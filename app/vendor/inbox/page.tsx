'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BellOff, CheckCheck, MessageCircle, Search, SlidersHorizontal, UserRound } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { ChatThreadPanel } from '@/components/customer/chat-thread-panel';
import { createClient } from '@/lib/supabase/client';
import { useChatPresence } from '@/hooks/use-chat-presence';
import { getOtherDeliveredMessageIds, getOtherReadMessageIds, getReadChatMessageIds } from '@/backend/domains/identity';
import { countUnreadMessages, formatChatTimestamp, truncateChatMessage } from '@/lib/customer/chat-view';
import { parseInboxResponse } from '@/lib/vendor/inbox-response';
import type { ChatMessage } from '@/backend/core/types';

interface Thread {
  id: string;
  customer_id: string;
  status: string;
  last_message_at: string | null;
  customer?: { full_name?: string; email?: string };
  outlets?: { id?: string; name?: string; city?: string; state?: string };
  chat_messages?: RawMessage[];
}
interface RawMessage { id: string; sender_id: string; body: string; created_at: string; attachment_url?: string | null; reply_to_message_id?: string | null; context_product_id?: string | null }

const STATUS_CHIP_STYLES: Record<string, string> = {
  archived: 'bg-gray-100 text-gray-500',
  closed: 'bg-gray-200 text-gray-400',
};

type InboxFilter = 'all' | 'unread' | 'needs_reply';
const FILTERS: { value: InboxFilter; translationKey: string }[] = [
  { value: 'all', translationKey: 'ui.inbox.filter.all' },
  { value: 'unread', translationKey: 'ui.inbox.filter.unread' },
  { value: 'needs_reply', translationKey: 'ui.inbox.filter.needs_reply' },
];

function toChatMessages(thread: Thread): ChatMessage[] {
  return (thread.chat_messages ?? [])
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((m) => ({
      id: m.id,
      threadId: thread.id,
      senderId: m.sender_id,
      senderRole: m.sender_id === thread.customer_id ? 'customer' : 'vendor',
      text: m.body,
      sentAt: m.created_at,
      attachmentUrl: m.attachment_url ?? undefined,
      replyToId: m.reply_to_message_id ?? undefined,
      contextProductId: m.context_product_id ?? undefined,
    }));
}

export default function VendorInboxPage() {
  const { t } = useTranslation('vendor');
  const { user } = useAuth();
  const vendorId = user?.activeVendorId;
  const { showFeedback } = useActionFeedback();
  const supabase = useMemo(() => createClient(), []);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [readByOthersIds, setReadByOthersIds] = useState<Set<string>>(new Set());
  const [readMessageIds, setReadMessageIds] = useState<Set<string>>(new Set());
  const [deliveredByOthersIds, setDeliveredByOthersIds] = useState<Set<string>>(new Set());
  const [aiReplyDraft, setAiReplyDraft] = useState<string | null>(null);
  const [aiReplyBusy, setAiReplyBusy] = useState(false);
  const [aiReplyError, setAiReplyError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<InboxFilter>('all');
  // CLAUDE-SUPPORT-MUTE-REPORT.md Feature 2
  const [mutedThreadIds, setMutedThreadIds] = useState<Set<string>>(new Set());
  const filters = FILTERS.map((option) => ({ value: option.value, label: t(option.translationKey) }));

  const presence = useChatPresence(vendorId ? `chat-presence-vendor-${vendorId}` : undefined, user?.id, 'vendor');
  const onlineCustomerIds = useMemo(() => new Set(presence.filter((p) => p.role === 'customer').map((p) => p.key)), [presence]);

  const loadThreads = useCallback(async (showLoading = true) => {
    if (!vendorId) {
      if (showLoading) setLoading(false);
      return;
    }
    if (showLoading) setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch(`/api/vendors/${vendorId}/inbox`, { cache: 'no-store' });
      const payload = await parseInboxResponse<Thread>(response);
      setThreads(payload.data);
      setLoadError(payload.error);
    } catch {
      setThreads([]);
      setLoadError(t('ui.inbox.loadFailed'));
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [t, vendorId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadThreads();
    const timer = window.setInterval(() => void loadThreads(false), 3000);
    return () => window.clearInterval(timer);
  }, [loadThreads]);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      try {
        const res = await fetch('/api/chat/mutes');
        const body = res.ok ? await res.json() : { data: [] };
        setMutedThreadIds(new Set((body.data ?? []) as string[]));
      } catch {
        // best-effort — mute icons just stay unset until the next load
      }
    })();
  }, [user?.id]);

  async function toggleMute(threadId: string) {
    const currentlyMuted = mutedThreadIds.has(threadId);
    setMutedThreadIds((previous) => {
      const next = new Set(previous);
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      currentlyMuted ? next.delete(threadId) : next.add(threadId);
      return next;
    });
    try {
      await fetch(`/api/chat/threads/${threadId}/mute`, { method: currentlyMuted ? 'DELETE' : 'POST' });
    } catch {
      setMutedThreadIds((previous) => {
        const next = new Set(previous);
        // eslint-disable-next-line @typescript-eslint/no-unused-expressions
        currentlyMuted ? next.add(threadId) : next.delete(threadId);
        return next;
      });
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAiReplyDraft(null);
    setAiReplyError(null);
  }, [active]);

  async function generateAiReply() {
    if (!active || !user?.activeVendorId) return;
    setAiReplyBusy(true); setAiReplyError(null); setAiReplyDraft(null);
    try {
      const response = await fetch(`/api/vendors/${user.activeVendorId}/ai/content`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ surface: 'inbox_reply', threadId: active }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message || t('ui.inbox.aiUnavailable'));
      setAiReplyDraft(payload.data?.draft || null);
    } catch (reason) {
      setAiReplyError(reason instanceof Error ? reason.message : t('ui.inbox.aiUnavailable'));
    } finally { setAiReplyBusy(false); }
  }

  useEffect(() => {
    if (!user?.id || threads.length === 0) return;
    const allMessageIds = threads.flatMap((thread) => (thread.chat_messages ?? []).map((m) => m.id));
    getReadChatMessageIds(user.id, allMessageIds).then((ids) => {
      setReadMessageIds((previous) => new Set([...previous, ...ids]));
    });
    // Re-runs only when the number of loaded threads changes (initial load / new thread) —
    // per-message updates after that are handled locally by the mark-as-read effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads.length, user?.id]);

  // A message is "delivered" once the vendor's client has it — which is as soon as
  // the inbox loads it, not only once that specific thread is opened (unlike Read).
  useEffect(() => {
    if (!user?.id || threads.length === 0) return;
    threads.forEach((thread) => { void fetch(`/api/chat/${thread.id}/delivered`, { method: 'POST' }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads.length, user?.id]);

  useEffect(() => {
    if (!user?.activeVendorId) return;
    const channel = supabase
      .channel(`vendor-inbox-${user.activeVendorId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        ({ new: row }: { new: RawMessage & { thread_id: string } }) => {
          setThreads((previous) => previous.map((thread) => {
            if (thread.id !== row.thread_id) return thread;
            if ((thread.chat_messages ?? []).some((m) => m.id === row.id)) return thread;
            return {
              ...thread,
              last_message_at: row.created_at,
              chat_messages: [...(thread.chat_messages ?? []), { id: row.id, sender_id: row.sender_id, body: row.body, created_at: row.created_at, attachment_url: row.attachment_url, reply_to_message_id: row.reply_to_message_id, context_product_id: row.context_product_id }],
            };
          }));
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_message_reads' },
        ({ new: row }: { new: { message_id: string; user_id: string } }) => {
          if (row.user_id === user?.id) return;
          setReadByOthersIds((previous) => new Set(previous).add(row.message_id));
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_message_deliveries' },
        ({ new: row }: { new: { message_id: string; user_id: string } }) => {
          if (row.user_id === user?.id) return;
          setDeliveredByOthersIds((previous) => new Set(previous).add(row.message_id));
        },
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, user?.activeVendorId, user?.id]);

  const selected = useMemo(() => threads.find((thread) => thread.id === active) || null, [active, threads]);

  useEffect(() => {
    if (!active || !user?.id) return;
    void fetch(`/api/chat/${active}/read`, { method: 'POST' }).then((response) => {
      if (!response.ok) return;
      const thread = threads.find((t) => t.id === active);
      if (!thread) return;
      const customerMessageIds = (thread.chat_messages ?? [])
        .filter((m) => m.sender_id === thread.customer_id)
        .map((m) => m.id);
      setReadMessageIds((previous) => new Set([...previous, ...customerMessageIds]));
    });
    // Re-runs only when the selected thread changes, not on every message —
    // `threads` is read fresh from closure, which is fine since it's already
    // populated by the time a thread can be selected from the list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, user?.id]);

  useEffect(() => {
    if (!active || !user?.id) return;
    const thread = threads.find((t) => t.id === active);
    if (!thread) return;
    const messageIds = toChatMessages(thread).map((m) => m.id);
    getOtherReadMessageIds(user.id, messageIds).then((ids) => {
      setReadByOthersIds((previous) => new Set([...previous, ...ids]));
    });
    getOtherDeliveredMessageIds(user.id, messageIds).then((ids) => {
      setDeliveredByOthersIds((previous) => new Set([...previous, ...ids]));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, user?.id]);

  const unreadByThread = useMemo(() => {
    const counts = new Map<string, number>();
    threads.forEach((thread) => counts.set(thread.id, countUnreadMessages(toChatMessages(thread), readMessageIds, 'vendor')));
    return counts;
  }, [threads, readMessageIds]);

  const visibleThreads = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return threads
      .filter((thread) => {
        const messages = thread.chat_messages ?? [];
        const latest = messages[messages.length - 1];
        const unreadCount = unreadByThread.get(thread.id) ?? 0;
        const needsReply = !!latest && latest.sender_id === thread.customer_id;
        const matchesFilter =
          filter === 'all' ||
          (filter === 'unread' && unreadCount > 0) ||
          (filter === 'needs_reply' && needsReply);
        const searchable = [thread.customer?.full_name, thread.outlets?.name, latest?.body].filter(Boolean).join(' ').toLowerCase();
        return matchesFilter && (!normalizedQuery || searchable.includes(normalizedQuery));
      })
      .sort((a, b) => (b.last_message_at ?? '').localeCompare(a.last_message_at ?? ''));
  }, [threads, unreadByThread, filter, query]);

  async function sendReply(text: string, replyToId?: string): Promise<ChatMessage> {
    if (!active || !user?.activeVendorId) throw new Error(t('ui.inbox.noConversationSelected'));
    const response = await fetch(`/api/vendors/${user.activeVendorId}/inbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: active, body: text, replyToId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error?.message || t('ui.inbox.sendFailed'));
    const row: RawMessage = payload.data;
    return { id: row.id, threadId: active, senderId: row.sender_id, senderRole: 'vendor', text: row.body, sentAt: row.created_at, replyToId: row.reply_to_message_id ?? undefined };
  }

  function appendMessage(message: ChatMessage) {
    setThreads((previous) => previous.map((thread) => {
      if (thread.id !== message.threadId) return thread;
      if ((thread.chat_messages ?? []).some((m) => m.id === message.id)) return thread;
      return {
        ...thread,
        last_message_at: message.sentAt,
        chat_messages: [...(thread.chat_messages ?? []), { id: message.id, sender_id: message.senderId, body: message.text, created_at: message.sentAt, attachment_url: message.attachmentUrl, reply_to_message_id: message.replyToId ?? null }],
      };
    }));
  }

  function handleSendError() {
    showFeedback('error', t('ui.inbox.sendFailed'));
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><MessageCircle size={15} /> {t('ui.inbox.travellerConversations')}</div>
        <h1 className="text-2xl font-bold text-gray-950">{t('ui.inbox.title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('ui.inbox.description')}</p>
      </div>
      <div className="flex h-[calc(100dvh-15rem)] min-h-[480px] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <div className="flex w-80 shrink-0 flex-col border-r border-gray-200">
          <div className="shrink-0 border-b border-gray-100 p-4">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <label className="sr-only" htmlFor="vendor-inbox-search">{t('ui.inbox.searchConversations')}</label>
              <input
                id="vendor-inbox-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('ui.inbox.searchConversations')}
                className="h-9 w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 text-xs text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-primary"
              />
            </div>
            <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 hide-scrollbar">
              <SlidersHorizontal size={13} className="shrink-0 text-gray-400" />
              {filters.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    filter === option.value ? 'bg-primary text-white' : 'bg-gray-100 text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadError ? (
              <div className="px-4 py-10 text-center text-xs text-red-600">
                <p>{loadError}</p>
                <button type="button" onClick={() => void loadThreads()} className="mt-3 font-semibold text-primary hover:underline">{t('ui.common.tryAgain')}</button>
              </div>
            ) : loading ? (
              <p className="px-4 py-10 text-center text-xs text-gray-400">{t('ui.inbox.loading')}</p>
            ) : visibleThreads.length === 0 ? (
              <p className="px-4 py-10 text-center text-xs text-gray-400">{threads.length === 0 ? t('ui.inbox.noConversations') : t('ui.inbox.noMatchingConversations')}</p>
            ) : visibleThreads.map((thread) => {
              const messages = thread.chat_messages ?? [];
              const latest = messages[messages.length - 1];
              const unreadCount = unreadByThread.get(thread.id) ?? 0;
              const name = thread.customer?.full_name || t('ui.inbox.traveller');
              return (
                <button key={thread.id} type="button" onClick={() => setActive(thread.id)} className={`w-full border-b border-gray-100 px-4 py-4 text-left transition hover:bg-secondary ${active === thread.id ? 'bg-secondary' : ''}`}>
                  <div className="flex items-start gap-3">
                    <span className="relative shrink-0 rounded-full bg-secondary p-2 text-primary">
                      <UserRound size={16} />
                      {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-primary" />}
                      {onlineCustomerIds.has(thread.customer_id) && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" title={t('ui.inbox.online')} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className={`flex min-w-0 items-center gap-1 truncate text-sm text-gray-900 ${unreadCount > 0 ? 'font-bold' : 'font-semibold'}`}>
                          <span className="truncate">{name}</span>
                          {mutedThreadIds.has(thread.id) && <BellOff size={12} className="shrink-0 text-gray-400" aria-label={t('ui.inbox.muted')} />}
                        </span>
                        <span className="shrink-0 text-[11px] text-gray-400">{thread.last_message_at ? formatChatTimestamp(thread.last_message_at) : t('ui.inbox.newConversation')}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        <span className="block truncate text-xs text-gray-500">{thread.outlets?.name || t('ui.inbox.malaysiaOutlet')}</span>
                        {thread.status !== 'open' && (
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${STATUS_CHIP_STYLES[thread.status] ?? 'bg-gray-100 text-gray-500'}`}>
                            {thread.status}
                          </span>
                        )}
                      </span>
                      <span className={`mt-1 block truncate text-xs ${unreadCount > 0 ? 'font-medium text-gray-900' : 'text-gray-500'}`}>
                        {latest ? truncateChatMessage(latest.body, 58) : t('ui.inbox.noMessages')}
                      </span>
                      {(unreadCount > 0 || (latest && latest.sender_id === user?.id)) && (
                        <span className="mt-2 flex items-center justify-end">
                          {unreadCount > 0 ? (
                            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">{unreadCount}</span>
                          ) : (
                            <CheckCheck size={13} className="text-primary" aria-label={t('ui.inbox.lastMessage')} />
                          )}
                        </span>
                      )}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center text-gray-400">
              <MessageCircle size={34} className="mb-3 opacity-30" />
              <p className="text-sm">{t('ui.inbox.selectConversation')}</p>
            </div>
          ) : (
            <ChatThreadPanel
              key={selected.id}
              threadId={selected.id}
              messages={toChatMessages(selected)}
              currentUserId={user?.id ?? ""}
              counterpart={{
                name: selected.customer?.full_name || t('ui.inbox.traveller'),
                online: onlineCustomerIds.has(selected.customer_id),
              }}
              onSend={(text, replyToId) => sendReply(text, replyToId).catch((error) => { handleSendError(); throw error; })}
              onMessageSent={appendMessage}
              readByOthers={readByOthersIds}
              deliveredByOthers={deliveredByOthersIds}
              aiReply={{ draft: aiReplyDraft, busy: aiReplyBusy, error: aiReplyError, onGenerate: () => void generateAiReply(), onDiscard: () => setAiReplyDraft(null) }}
              isMuted={mutedThreadIds.has(selected.id)}
              onToggleMute={() => void toggleMute(selected.id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
