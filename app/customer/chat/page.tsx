"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCheck, MessageCircle, Search, SlidersHorizontal } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { EmptyState } from "@/components/shared/empty-state";
import { ChatThreadPanel } from "@/components/customer/chat-thread-panel";
import { countUnreadMessages, formatChatTimestamp, truncateChatMessage } from "@/lib/customer/chat-view";
import type { ChatMessage, ChatThread, Outlet } from "@/backend/core/types";

type ChatFilter = "all" | "unread" | "needs_reply";

const FILTERS: { value: ChatFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "needs_reply", label: "Needs your reply" },
];

type ChatOutlet = Pick<Outlet, "id" | "name" | "city" | "state">;
type RawChatMessage = {
  id: string;
  thread_id?: string;
  sender_id: string;
  body: string;
  created_at: string;
  attachment_url?: string | null;
  reply_to_message_id?: string | null;
  context_product_id?: string | null;
};
type ApiThread = {
  id: string;
  customer_id: string;
  outlet_id: string;
  vendor_id: string;
  last_message_at: string | null;
  created_at: string;
  outlets?: ChatOutlet | ChatOutlet[] | null;
  chat_messages?: RawChatMessage[];
};

function toChatMessage(row: RawChatMessage, thread: ApiThread): ChatMessage {
  return {
    id: row.id,
    threadId: thread.id,
    senderId: row.sender_id,
    senderRole: row.sender_id === thread.customer_id ? "customer" : "vendor",
    text: row.body,
    sentAt: row.created_at,
    attachmentUrl: row.attachment_url ?? undefined,
    replyToId: row.reply_to_message_id ?? undefined,
    contextProductId: row.context_product_id ?? undefined,
  };
}

function normalizeThread(row: ApiThread): { thread: ChatThread; outlet?: ChatOutlet; messages: ChatMessage[] } {
  const outlet = Array.isArray(row.outlets) ? row.outlets[0] : row.outlets ?? undefined;
  return {
    thread: {
      id: row.id,
      customerId: row.customer_id,
      outletId: row.outlet_id,
      vendorId: row.vendor_id,
      lastMessageAt: row.last_message_at ?? row.created_at,
    },
    outlet,
    messages: (row.chat_messages ?? [])
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((message) => toChatMessage(message, row)),
  };
}

export default function ChatListPage() {
  const { currentUser } = useAuth();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("thread");
  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [outlets, setOutlets] = useState<Map<string, ChatOutlet>>(new Map());
  const [messagesByThread, setMessagesByThread] = useState<Map<string, ChatMessage[]>>(new Map());
  const [readMessageIds, setReadMessageIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;

    async function loadConversations() {
      try {
        const response = await fetch("/api/customer/chat", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error?.message || "Unable to load conversations");
        const rawThreads = Array.isArray(payload.data?.threads) ? payload.data.threads : [];
        const normalized: ReturnType<typeof normalizeThread>[] = rawThreads.map((row: ApiThread) => normalizeThread(row));
        if (cancelled) return;

        setThreads(normalized.map(({ thread }) => thread));
        setOutlets(new Map(normalized.flatMap(({ outlet }) => outlet ? [[outlet.id, outlet] as const] : [])));
        setMessagesByThread(new Map(normalized.map(({ thread, messages }) => [thread.id, messages])));
        setReadMessageIds(new Set(Array.isArray(payload.data?.readMessageIds) ? payload.data.readMessageIds : []));
        setLoadError(null);
      } catch {
        if (!cancelled) setLoadError("We couldn't load your conversations. Please refresh and try again.");
      }
    }

    void loadConversations();
    const timer = window.setInterval(() => void loadConversations(), 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentUser]);

  const unreadByThread = useMemo(() => {
    const counts = new Map<string, number>();
    messagesByThread.forEach((messages, threadId) => counts.set(threadId, countUnreadMessages(messages, readMessageIds)));
    return counts;
  }, [messagesByThread, readMessageIds]);

  const visibleThreads = useMemo(() => {
    if (!threads) return [];
    const normalizedQuery = query.trim().toLowerCase();

    return threads
      .filter((thread) => {
        const messages = messagesByThread.get(thread.id) ?? [];
        const latest = messages[messages.length - 1];
        const unreadCount = unreadByThread.get(thread.id) ?? 0;
        const outlet = outlets.get(thread.outletId);
        const matchesFilter =
          filter === "all" ||
          (filter === "unread" && unreadCount > 0) ||
          (filter === "needs_reply" && latest?.senderRole === "vendor");
        const searchable = [outlet?.name, outlet?.city, outlet?.state, latest?.text, thread.id].filter(Boolean).join(" ").toLowerCase();
        return matchesFilter && (!normalizedQuery || searchable.includes(normalizedQuery));
      })
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  }, [filter, messagesByThread, outlets, query, threads, unreadByThread]);

  const selectedThread = threads?.find((thread) => thread.id === selectedId);
  const selectedMessages = selectedThread ? messagesByThread.get(selectedThread.id) ?? [] : [];
  const selectedOutlet = selectedThread ? outlets.get(selectedThread.outletId) : undefined;
  const unreadTotal = Array.from(unreadByThread.values()).reduce((total, count) => total + count, 0);
  const needsReplyTotal = threads?.filter((thread) => {
    const messages = messagesByThread.get(thread.id) ?? [];
    return messages[messages.length - 1]?.senderRole === "vendor";
  }).length ?? 0;

  useEffect(() => {
    if (!selectedThread || !currentUser || !messagesByThread.has(selectedThread.id)) return;
    const unreadIds = (messagesByThread.get(selectedThread.id) ?? [])
      .filter((message) => message.senderRole === "vendor" && !readMessageIds.has(message.id))
      .map((message) => message.id);
    if (unreadIds.length === 0) return;

    (async () => {
      const response = await fetch(`/api/chat/${selectedThread.id}/read`, { method: "POST" });
      if (response.ok) {
        setReadMessageIds((previous) => new Set([...previous, ...unreadIds]));
      }
    })().catch(() => {
      // The read receipt is best-effort; the unread state remains until the next successful sync.
    });
  }, [currentUser, messagesByThread, readMessageIds, selectedThread]);

  function appendMessage(message: ChatMessage) {
    setMessagesByThread((previous) => {
      const existing = previous.get(message.threadId) ?? [];
      if (existing.some((m) => m.id === message.id)) return previous;
      const next = new Map(previous);
      next.set(message.threadId, [...existing, message]);
      return next;
    });
  }

  if (!currentUser || threads === null) {
    return <div className="mx-auto max-w-7xl px-4 py-16 text-sm text-muted-foreground sm:px-6">Loading conversations…</div>;
  }

  if (loadError) {
    return <EmptyState icon={<MessageCircle size={40} />} title="Unable to load messages" description={loadError} />;
  }

  if (threads.length === 0) {
    return (
      <EmptyState
        icon={<MessageCircle size={40} />}
        title="No conversations yet"
        description="Open an experience's detail page and tap Chat to message a vendor."
      />
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-7rem)] max-w-7xl flex-col px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Your inbox</p>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-foreground sm:text-4xl">Messages</h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">Keep every question and vendor reply in one place.</p>
        </div>
        <div className="flex items-center gap-5 text-xs text-muted-foreground">
          <span><strong className="text-foreground">{threads.length}</strong> conversations</span>
          <span><strong className="text-foreground">{unreadTotal}</strong> unread</span>
          <span><strong className="text-foreground">{needsReplyTotal}</strong> need your reply</span>
        </div>
      </header>

      <div className="grid h-[min(720px,calc(100dvh-15rem))] min-h-0 flex-1 overflow-hidden rounded-3xl border border-border bg-card shadow-sm md:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
        <aside className={`flex min-h-0 flex-col border-border md:border-r ${selectedThread ? "hidden md:flex" : "flex"}`}>
          <div className="border-b border-border p-4 sm:p-5">
            <div className="relative">
              <Search size={17} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <label className="sr-only" htmlFor="conversation-search">Search conversations</label>
              <input
                id="conversation-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search conversations"
                className="h-11 w-full rounded-2xl border border-border bg-input-background pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              />
            </div>
            <div className="mt-3 flex items-center gap-2 overflow-x-auto pb-0.5 hide-scrollbar">
              <SlidersHorizontal size={14} className="shrink-0 text-muted-foreground" />
              {FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    filter === option.value ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2 sm:p-3">
            {visibleThreads.length === 0 ? (
              <div className="flex h-full min-h-56 flex-col items-center justify-center px-6 text-center">
                <Search size={20} className="mb-3 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">No matching conversations</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">Try another search or filter.</p>
              </div>
            ) : (
              visibleThreads.map((thread) => {
                const outlet = outlets.get(thread.outletId);
                const messages = messagesByThread.get(thread.id) ?? [];
                const latest = messages[messages.length - 1];
                const unreadCount = unreadByThread.get(thread.id) ?? 0;
                const isSelected = thread.id === selectedId;
                const name = outlet?.name ?? "Vendor";
                return (
                  <Link
                    key={thread.id}
                    href={`/customer/chat?thread=${thread.id}`}
                    className={`mb-1 block rounded-2xl p-3.5 transition-colors ${isSelected ? "bg-secondary" : "hover:bg-secondary/70"}`}
                    aria-current={isSelected ? "page" : undefined}
                  >
                    <div className="flex items-start gap-3">
                      <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-sm font-bold text-primary">
                        {name.slice(0, 1).toUpperCase()}
                        {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-card bg-primary" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`truncate text-sm ${unreadCount > 0 ? "font-bold text-foreground" : "font-semibold text-foreground"}`}>{name}</p>
                          <span className="shrink-0 text-[11px] text-muted-foreground">{formatChatTimestamp(thread.lastMessageAt)}</span>
                        </div>
                        <p className={`mt-1 truncate text-xs ${unreadCount > 0 ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                          {latest ? truncateChatMessage(latest.text, 58) : "No messages yet"}
                        </p>
                        {(unreadCount > 0 || latest?.senderRole === "customer") && (
                          <div className="mt-2 flex items-center justify-end">
                            {unreadCount > 0 ? (
                              <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-white">{unreadCount}</span>
                            ) : (
                              <CheckCheck size={13} className="text-primary" aria-label="Your last message" />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })
            )}
          </div>
        </aside>

        <section className={`${selectedThread ? "flex" : "hidden md:flex"} min-h-0 flex-col`}>
          {selectedThread ? (
            <ChatThreadPanel
              key={selectedThread.id}
              threadId={selectedThread.id}
              messages={selectedMessages}
              currentUserId={currentUser.id}
              counterpart={{
                name: selectedOutlet?.name ?? "Vendor conversation",
                subtitle: `${selectedOutlet?.city || "Malaysia"}${selectedOutlet?.state ? `, ${selectedOutlet.state}` : ""}`,
                badge: "Vendor",
              }}
              onSend={async (text, replyToId) => {
                const response = await fetch(`/api/customer/chat/${selectedThread.id}/messages`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ body: text, replyToId }),
                });
                const payload = await response.json().catch(() => ({}));
                if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Unable to send message");
                return toChatMessage({ ...payload.data, thread_id: selectedThread.id }, {
                  id: selectedThread.id,
                  customer_id: currentUser.id,
                  outlet_id: selectedThread.outletId,
                  vendor_id: selectedThread.vendorId,
                  last_message_at: payload.data.created_at,
                  created_at: payload.data.created_at,
                });
              }}
              onMessageSent={appendMessage}
              backHref="/customer/chat"
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-secondary text-primary">
                <MessageCircle size={28} />
              </div>
              <h2 className="text-lg font-bold text-foreground">Select a conversation</h2>
              <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">Choose a vendor conversation to view messages and continue planning your trip.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
