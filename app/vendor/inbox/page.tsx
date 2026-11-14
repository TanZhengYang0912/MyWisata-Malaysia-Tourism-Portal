'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, BellOff, CheckCheck, MessageCircle, Search, SlidersHorizontal, UserRound, X } from 'lucide-react';
import { formatMYR } from '@/lib/i18n/format';
import { useAuth } from '@/hooks/use-auth';
import { VendorPageHeader } from '@/components/vendor/vendor-page-header';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { ChatThreadPanel } from '@/components/customer/chat-thread-panel';
import { createClient } from '@/lib/supabase/client';
import { useChatPresence } from '@/hooks/use-chat-presence';
import { getOtherDeliveredMessageIds, getOtherReadMessageIds } from '@/backend/domains/identity';
import { formatChatTimestamp, truncateChatMessage } from '@/lib/customer/chat-view';
import { parseInboxResponse } from '@/lib/vendor/inbox-response';
import type { ChatMessage } from '@/backend/core/types';

interface Thread {
  id: string;
  customer_id: string;
  status: string;
  last_message_at: string | null;
  customer?: { full_name?: string; email?: string };
  outlets?: { id?: string; name?: string; city?: string; state?: string };
  // Summary fields from get_chat_thread_summaries; the open thread's messages
  // load separately from /api/vendors/[vendorId]/inbox/[threadId].
  latest_message?: RawMessage | null;
  unread_count?: number;
}
interface RawMessage { id: string; sender_id: string; body: string; created_at: string; attachment_url?: string | null; reply_to_message_id?: string | null; context_product_id?: string | null; context_snapshot?: ChatMessage['context'] | null }

const STATUS_CHIP_STYLES: Record<string, string> = {
  archived: 'bg-gray-100 dark:bg-muted text-gray-500 dark:text-muted-foreground',
  closed: 'bg-gray-200 dark:bg-secondary text-gray-400 dark:text-muted-foreground',
};

type InboxFilter = 'all' | 'unread' | 'needs_reply';
const FILTERS: { value: InboxFilter; translationKey: string }[] = [
  { value: 'all', translationKey: 'ui.inbox.filter.all' },
  { value: 'unread', translationKey: 'ui.inbox.filter.unread' },
  { value: 'needs_reply', translationKey: 'ui.inbox.filter.needs_reply' },
];
const INBOX_RECONCILE_POLL_MS = 15_000;

function toChatMessages(thread: Pick<Thread, 'id' | 'customer_id'>, rows: RawMessage[]): ChatMessage[] {
  return rows
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
      context: m.context_snapshot ?? undefined,
    }));
}

export default function VendorInboxPage() {
  const { t } = useTranslation('vendor');
  const { t: tCommon } = useTranslation('common');
  const { user } = useAuth();
  const vendorId = user?.activeVendorId;
  const { showFeedback } = useActionFeedback();
  const supabase = useMemo(() => createClient(), []);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [readByOthersIds, setReadByOthersIds] = useState<Set<string>>(new Set());
  const [activeMessages, setActiveMessages] = useState<RawMessage[]>([]);
  const [activeLoadedFor, setActiveLoadedFor] = useState<string | null>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // Read by the realtime handler and the reconcile poll, which outlive renders.
  const activeRef = useRef<string | null>(null);
  const activeMessagesRef = useRef<RawMessage[]>([]);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { activeMessagesRef.current = activeMessages; }, [activeMessages]);
  const [deliveredByOthersIds, setDeliveredByOthersIds] = useState<Set<string>>(new Set());
  const [aiReplyDraft, setAiReplyDraft] = useState<string | null>(null);
  const [aiReplyBusy, setAiReplyBusy] = useState(false);
  const [aiReplyError, setAiReplyError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<InboxFilter>('all');
  // CLAUDE-SUPPORT-MUTE-REPORT.md Feature 2
  const [mutedThreadIds, setMutedThreadIds] = useState<Set<string>>(new Set());
  const refreshRequest = useRef<{ vendorId: string; controller: AbortController } | null>(null);
  // Set once catchUpActiveThread exists (declared further down).
  const catchUpActiveThreadRef = useRef<() => Promise<void>>(async () => undefined);
  const filters = FILTERS.map((option) => ({ value: option.value, label: t(option.translationKey) }));

  const presence = useChatPresence(vendorId ? `chat-presence-vendor-${vendorId}` : undefined, user?.id, 'vendor');
  const onlineCustomerIds = useMemo(() => new Set(presence.filter((p) => p.role === 'customer').map((p) => p.key)), [presence]);

  const loadThreads = useCallback(async (showLoading = true) => {
    if (!vendorId) {
      if (showLoading) setLoading(false);
      return;
    }
    if (refreshRequest.current?.vendorId === vendorId) return;
    refreshRequest.current?.controller.abort();
    const controller = new AbortController();
    refreshRequest.current = { vendorId, controller };
    if (showLoading) setLoading(true);
    try {
      const response = await fetch(`/api/vendors/${vendorId}/inbox`, { cache: 'no-store', signal: controller.signal });
      const payload = await parseInboxResponse<Thread>(response);
      if (controller.signal.aborted) return;
      if (payload.error) {
        if (showLoading) {
          setThreads(payload.data);
          setLoadError(payload.error);
        }
        return;
      }
      setThreads(payload.data);
      setLoadError(null);
    } catch {
      if (!controller.signal.aborted && showLoading) {
        setThreads([]);
        setLoadError(t('ui.inbox.loadFailed'));
      }
    } finally {
      if (refreshRequest.current?.controller === controller) {
        refreshRequest.current = null;
        if (showLoading) setLoading(false);
      }
    }
  }, [t, vendorId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadThreads();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadThreads(false);
        void catchUpActiveThreadRef.current();
      }
    }, INBOX_RECONCILE_POLL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void loadThreads(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      const request = refreshRequest.current;
      if (request && request.vendorId === vendorId) {
        refreshRequest.current = null;
        request.controller.abort();
      }
    };
  }, [loadThreads, vendorId]);

  // Deep-link from a "New message" notification (/vendor/inbox?thread=<id>).
  // One-shot: only before the user has opened a thread themselves.
  useEffect(() => {
    if (active || typeof window === 'undefined') return;
    const threadId = new URLSearchParams(window.location.search).get('thread');
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (threadId) setActive(threadId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // A message is "delivered" once the vendor's client has it — which is as soon as
  // the inbox loads it, not only once that specific thread is opened (unlike Read).
  useEffect(() => {
    if (!user?.id || threads.length === 0) return;
    threads.forEach((thread) => { void fetch(`/api/chat/${thread.id}/delivered`, { method: 'POST' }); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads.length, user?.id]);

  // Thread list: every send path updates chat_threads.last_message_at, so a
  // vendor-filtered thread UPDATE stands in for platform-wide message inserts,
  // which made Realtime check chat RLS for every inbox tab on every message.
  // The summary reload refreshes the preview and unread count; a reload that
  // collides with one in flight is caught by the reconcile poll.
  useEffect(() => {
    if (!vendorId) return;
    let refreshTimer: number | null = null;
    const channel = supabase
      .channel(`vendor-inbox-${vendorId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_threads', filter: `vendor_id=eq.${vendorId}` },
        () => {
          if (refreshTimer !== null) window.clearTimeout(refreshTimer);
          refreshTimer = window.setTimeout(() => {
            refreshTimer = null;
            void loadThreads(false);
          }, 250);
        },
      )
      .subscribe();
    return () => {
      if (refreshTimer !== null) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [supabase, vendorId, loadThreads]);

  const selected = useMemo(() => threads.find((thread) => thread.id === active) || null, [active, threads]);
  const activeCustomerId = selected?.customer_id ?? null;

  // Open conversation: messages arrive live for this thread only. Receipts are
  // the customer's reads/deliveries, filtered by reader so the channel stays
  // stable while the vendor keeps sending.
  useEffect(() => {
    if (!active) return;
    let channel = supabase
      .channel(`vendor-inbox-thread-${active}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `thread_id=eq.${active}` },
        ({ new: row }: { new: RawMessage & { thread_id: string } }) => {
          const message: RawMessage = { id: row.id, sender_id: row.sender_id, body: row.body, created_at: row.created_at, attachment_url: row.attachment_url, reply_to_message_id: row.reply_to_message_id, context_product_id: row.context_product_id, context_snapshot: row.context_snapshot };
          setThreads((previous) => previous.map((thread) => thread.id === row.thread_id && thread.latest_message?.id !== row.id
            ? { ...thread, last_message_at: row.created_at, latest_message: message }
            : thread));
          if (activeRef.current !== row.thread_id) return;
          setActiveMessages((previous) => previous.some((m) => m.id === row.id) ? previous : [...previous, message]);
          if (row.sender_id !== user?.id) void fetch(`/api/chat/${row.thread_id}/read`, { method: 'POST' });
        },
      );
    if (activeCustomerId) {
      channel = channel
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_message_reads', filter: `user_id=eq.${activeCustomerId}` },
          ({ new: row }: { new: { message_id: string } }) => {
            setReadByOthersIds((previous) => new Set(previous).add(row.message_id));
          },
        )
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_message_deliveries', filter: `user_id=eq.${activeCustomerId}` },
          ({ new: row }: { new: { message_id: string } }) => {
            setDeliveredByOthersIds((previous) => new Set(previous).add(row.message_id));
          },
        );
    }
    channel.subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, active, activeCustomerId, user?.id]);

  // The open thread loads its newest 50 messages; older pages on request.
  const fetchThreadMessages = useCallback(async (threadId: string, cursor?: { before?: string; after?: string }, signal?: AbortSignal) => {
    if (!vendorId) return null;
    const params = new URLSearchParams();
    if (cursor?.before) params.set('before', cursor.before);
    if (cursor?.after) params.set('after', cursor.after);
    const response = await fetch(`/api/vendors/${vendorId}/inbox/${threadId}${params.size ? `?${params}` : ''}`, { cache: 'no-store', signal });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => ({}));
    return payload.data as { messages: RawMessage[]; hasOlder: boolean | null } | null;
  }, [vendorId]);

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void fetchThreadMessages(active, undefined, controller.signal).then((page) => {
      if (!page || controller.signal.aborted) return;
      setActiveMessages(page.messages);
      setHasOlder(Boolean(page.hasOlder));
      setActiveLoadedFor(active);
    }).catch(() => undefined);
    return () => controller.abort();
  }, [active, fetchThreadMessages]);

  async function loadOlder() {
    const threadId = active;
    const oldest = activeMessages[0]?.created_at;
    if (!threadId || !oldest) return;
    setLoadingOlder(true);
    try {
      const page = await fetchThreadMessages(threadId, { before: oldest });
      if (!page || activeRef.current !== threadId) return;
      setActiveMessages((previous) => [...page.messages.filter((m) => !previous.some((p) => p.id === m.id)), ...previous]);
      setHasOlder(Boolean(page.hasOlder));
    } finally {
      setLoadingOlder(false);
    }
  }

  // Realtime can miss an insert (reconnects); the reconcile poll also catches
  // the open thread up from its newest loaded message.
  const catchUpActiveThread = useCallback(async () => {
    const threadId = activeRef.current;
    const newest = activeMessagesRef.current[activeMessagesRef.current.length - 1]?.created_at;
    if (!threadId || !newest) return;
    const page = await fetchThreadMessages(threadId, { after: newest });
    if (!page || activeRef.current !== threadId) return;
    setActiveMessages((previous) => {
      const added = page.messages.filter((m) => !previous.some((p) => p.id === m.id));
      return added.length ? [...previous, ...added] : previous;
    });
  }, [fetchThreadMessages]);
  useEffect(() => { catchUpActiveThreadRef.current = catchUpActiveThread; }, [catchUpActiveThread]);

  useEffect(() => {
    if (!active || !user?.id) return;
    void fetch(`/api/chat/${active}/read`, { method: 'POST' }).then((response) => {
      if (!response.ok) return;
      setThreads((previous) => previous.map((thread) => thread.id === active ? { ...thread, unread_count: 0 } : thread));
    });
  }, [active, user?.id]);

  useEffect(() => {
    if (!active || !user?.id || activeLoadedFor !== active) return;
    const messageIds = activeMessagesRef.current.map((m) => m.id);
    getOtherReadMessageIds(user.id, messageIds).then((ids) => {
      setReadByOthersIds((previous) => new Set([...previous, ...ids]));
    });
    getOtherDeliveredMessageIds(user.id, messageIds).then((ids) => {
      setDeliveredByOthersIds((previous) => new Set([...previous, ...ids]));
    });
  }, [active, activeLoadedFor, user?.id]);

  const unreadByThread = useMemo(
    () => new Map(threads.map((thread) => [thread.id, thread.unread_count ?? 0])),
    [threads],
  );

  const visibleThreads = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return threads
      .filter((thread) => {
        const latest = thread.latest_message;
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

  async function sendReply(text: string, replyToId?: string, contextOrderId?: string): Promise<ChatMessage> {
    if (!active || !user?.activeVendorId) throw new Error(t('ui.inbox.noConversationSelected'));
    const response = await fetch(`/api/vendors/${user.activeVendorId}/inbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ threadId: active, body: text, replyToId, contextOrderId }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error?.message || t('ui.inbox.sendFailed'));
    const row: RawMessage = payload.data;
    return { id: row.id, threadId: active, senderId: row.sender_id, senderRole: 'vendor', text: row.body, sentAt: row.created_at, replyToId: row.reply_to_message_id ?? undefined, context: row.context_snapshot ?? undefined };
  }

  const [orderPicker, setOrderPicker] = useState<{ open: boolean; loading: boolean; orders: { id: string; displayId: string | null; status: string; totalAmount: number; items: string[] }[] }>({ open: false, loading: false, orders: [] });

  async function openOrderPicker() {
    if (!selected || !user?.activeVendorId) return;
    setOrderPicker({ open: true, loading: true, orders: [] });
    try {
      const res = await fetch(`/api/vendors/${user.activeVendorId}/inbox/orders?customerId=${selected.customer_id}`);
      const body = await res.json().catch(() => ({}));
      setOrderPicker({ open: true, loading: false, orders: res.ok ? (body.data ?? []) : [] });
    } catch {
      setOrderPicker({ open: true, loading: false, orders: [] });
    }
  }

  async function attachOrder(orderId: string) {
    setOrderPicker((p) => ({ ...p, open: false }));
    try {
      appendMessage(await sendReply('', undefined, orderId));
    } catch {
      handleSendError();
    }
  }

  function appendMessage(message: ChatMessage) {
    const raw: RawMessage = { id: message.id, sender_id: message.senderId, body: message.text, created_at: message.sentAt, attachment_url: message.attachmentUrl, reply_to_message_id: message.replyToId ?? null, context_snapshot: message.context ?? null };
    setThreads((previous) => previous.map((thread) => thread.id === message.threadId
      ? { ...thread, last_message_at: message.sentAt, latest_message: raw }
      : thread));
    if (activeRef.current === message.threadId) {
      setActiveMessages((previous) => previous.some((m) => m.id === message.id) ? previous : [...previous, raw]);
    }
  }

  function handleSendError() {
    showFeedback('error', t('ui.inbox.sendFailed'));
  }

  return (
    <div className="space-y-4">
      <VendorPageHeader eyebrow={<><MessageCircle size={15} aria-hidden="true" /> {t('ui.inbox.travellerConversations')}</>} title={t('ui.inbox.title')} />
      <div className="flex h-[calc(100dvh-15rem)] min-h-[480px] overflow-hidden rounded-2xl border border-gray-200 dark:border-border bg-white dark:bg-card shadow-sm">
        {/* Phones show the list or the open conversation, one at a time; md and up show both. */}
        <div className={`flex shrink-0 flex-col border-r border-gray-200 dark:border-border md:w-80 ${selected ? 'max-md:hidden' : 'max-md:w-full max-md:border-r-0'}`}>
          <div className="shrink-0 border-b border-gray-100 dark:border-border p-4">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-muted-foreground" />
              <label className="sr-only" htmlFor="vendor-inbox-search">{t('ui.inbox.searchConversations')}</label>
              <input
                id="vendor-inbox-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('ui.inbox.searchConversations')}
                className="h-9 w-full rounded-xl border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/50 pl-9 pr-3 text-xs text-gray-900 dark:text-foreground outline-none transition-colors placeholder:text-gray-400 dark:placeholder:text-muted-foreground focus:border-primary"
              />
            </div>
            <div className="mt-2 flex items-center gap-1.5 overflow-x-auto pb-0.5 hide-scrollbar">
              <SlidersHorizontal size={13} className="shrink-0 text-gray-400 dark:text-muted-foreground" />
              {filters.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                    filter === option.value ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-muted text-gray-500 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadError ? (
              <div className="px-4 py-10 text-center text-xs text-red-600 dark:text-red-300">
                <p>{loadError}</p>
                <button type="button" onClick={() => void loadThreads()} className="mt-3 font-semibold text-primary hover:underline">{t('ui.common.tryAgain')}</button>
              </div>
            ) : loading ? (
              <p className="px-4 py-10 text-center text-xs text-gray-400 dark:text-muted-foreground">{t('ui.inbox.loading')}</p>
            ) : visibleThreads.length === 0 ? (
              <p className="px-4 py-10 text-center text-xs text-gray-400 dark:text-muted-foreground">{threads.length === 0 ? t('ui.inbox.noConversations') : t('ui.inbox.noMatchingConversations')}</p>
            ) : visibleThreads.map((thread) => {
              const latest = thread.latest_message;
              const unreadCount = unreadByThread.get(thread.id) ?? 0;
              const name = thread.customer?.full_name || t('ui.inbox.traveller');
              return (
                <button key={thread.id} type="button" onClick={() => setActive(thread.id)} className={`w-full border-b border-gray-100 dark:border-border px-4 py-4 text-left transition hover:bg-secondary ${active === thread.id ? 'bg-secondary' : ''}`}>
                  <div className="flex items-start gap-3">
                    <span className="relative shrink-0 rounded-full bg-secondary p-2 text-primary">
                      <UserRound size={16} />
                      {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-primary" />}
                      {onlineCustomerIds.has(thread.customer_id) && <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" title={t('ui.inbox.online')} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className={`flex min-w-0 items-center gap-1 truncate text-sm text-gray-900 dark:text-foreground ${unreadCount > 0 ? 'font-bold' : 'font-semibold'}`}>
                          <span className="truncate">{name}</span>
                          {mutedThreadIds.has(thread.id) && <BellOff size={12} className="shrink-0 text-gray-400 dark:text-muted-foreground" aria-label={t('ui.inbox.muted')} />}
                        </span>
                        <span className="shrink-0 text-[11px] text-gray-400 dark:text-muted-foreground">{thread.last_message_at ? formatChatTimestamp(thread.last_message_at) : t('ui.inbox.newConversation')}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        <span className="block truncate text-xs text-gray-500 dark:text-muted-foreground">{thread.outlets?.name || t('ui.inbox.malaysiaOutlet')}</span>
                        {thread.status !== 'open' && (
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${STATUS_CHIP_STYLES[thread.status] ?? 'bg-gray-100 dark:bg-muted text-gray-500 dark:text-muted-foreground'}`}>
                            {thread.status}
                          </span>
                        )}
                      </span>
                      <span className={`mt-1 block truncate text-xs ${unreadCount > 0 ? 'font-medium text-gray-900 dark:text-foreground' : 'text-gray-500 dark:text-muted-foreground'}`}>
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
        <div className={`flex min-h-0 min-w-0 flex-1 flex-col ${selected ? '' : 'max-md:hidden'}`}>
          {selected && (
            <button type="button" onClick={() => setActive(null)} className="flex shrink-0 items-center gap-1.5 border-b border-gray-100 dark:border-border px-4 py-2.5 text-xs font-semibold text-primary md:hidden">
              <ArrowLeft size={14} aria-hidden="true" /> {tCommon('actions.back')}
            </button>
          )}
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center text-gray-400 dark:text-muted-foreground">
              <MessageCircle size={34} className="mb-3 opacity-30" />
              <p className="text-sm">{t('ui.inbox.selectConversation')}</p>
            </div>
          ) : (
            <>
            {hasOlder && activeLoadedFor === selected.id && (
              <button type="button" onClick={() => void loadOlder()} disabled={loadingOlder} className="shrink-0 border-b border-gray-100 py-2 text-xs font-semibold text-primary hover:bg-secondary/60 disabled:opacity-60 dark:border-border">
                {t('ui.inbox.loadOlder')}
              </button>
            )}
            <ChatThreadPanel
              key={selected.id}
              threadId={selected.id}
              messages={activeLoadedFor === selected.id ? toChatMessages(selected, activeMessages) : []}
              currentUserId={user?.id ?? ""}
              counterpart={{
                name: selected.customer?.full_name || t('ui.inbox.traveller'),
                online: onlineCustomerIds.has(selected.customer_id),
              }}
              onSend={(text, replyToId) => sendReply(text, replyToId).catch((error) => { handleSendError(); throw error; })}
              onMessageSent={appendMessage}
              onAttachOrder={openOrderPicker}
              readByOthers={readByOthersIds}
              deliveredByOthers={deliveredByOthersIds}
              aiReply={{ draft: aiReplyDraft, busy: aiReplyBusy, error: aiReplyError, onGenerate: () => void generateAiReply(), onDiscard: () => setAiReplyDraft(null) }}
              isMuted={mutedThreadIds.has(selected.id)}
              onToggleMute={() => void toggleMute(selected.id)}
            />
            </>
          )}
        </div>
      </div>

      {orderPicker.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setOrderPicker((p) => ({ ...p, open: false }))}>
          <div className="w-full max-w-md rounded-2xl bg-card p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">{t('ui.inbox.attachOrder.title')}</h2>
              <button type="button" onClick={() => setOrderPicker((p) => ({ ...p, open: false }))} aria-label={t('ui.inbox.attachOrder.close')} className="text-muted-foreground hover:text-foreground"><X size={16} /></button>
            </div>
            {orderPicker.loading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('ui.inbox.attachOrder.loading')}</p>
            ) : orderPicker.orders.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('ui.inbox.attachOrder.empty')}</p>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto">
                {orderPicker.orders.map((order) => (
                  <button key={order.id} type="button" onClick={() => void attachOrder(order.id)} className="flex w-full items-start justify-between gap-3 rounded-xl border border-border p-3 text-left transition hover:bg-secondary">
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold text-foreground">{order.displayId ?? order.id.slice(0, 8)}</span>
                      <span className="block truncate text-[0.6875rem] text-muted-foreground">{t('ui.inbox.attachOrder.itemCount', { count: order.items.length })} · {order.status}</span>
                    </span>
                    <span className="shrink-0 font-[family-name:var(--font-mono)] text-xs font-bold text-foreground">{formatMYR(order.totalAmount)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
