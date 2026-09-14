"use client";

// P4 — left pane of the merged chat widget (components/shared/chatbot-widget.tsx).
// AI Support pinned first, vendor threads below it — ported from the old
// app/customer/chat/page.tsx's list logic (fetch/poll/search/filter/mute),
// minus the page framing and the ChatThreadPanel rendering (that's now the
// widget's right pane, driven by `selected` from the shared provider).
// Mounts only while the widget panel is open (chatbot-widget.tsx renders
// this conditionally), so the poll below starts/stops with the widget
// itself — no separate "active" gate needed.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BellOff, CheckCheck, MessageCircle, Search, SlidersHorizontal } from "lucide-react";
import { countUnreadMessages, formatChatTimestamp, truncateChatMessage } from "@/lib/customer/chat-view";
import type { ChatMessage, ChatThread, Outlet } from "@/backend/core/types";
import type { SelectedChat } from "@/components/providers/support-chat";

// "Needs your reply" dropped for the customer side (2026-09): that filter
// earns its keep on the vendor inbox, which triages many customer threads —
// a customer here has a handful of vendor threads at most, and it nearly
// always overlapped with Unread anyway. All/Unread stays.
type ChatFilter = "all" | "unread";

const FILTERS: { value: ChatFilter; labelKey: string }[] = [
  { value: "all", labelKey: "strictMigration.chat.filters.all" },
  { value: "unread", labelKey: "strictMigration.chat.filters.unread" },
];

type ChatOutlet = Pick<Outlet, "id" | "name" | "city" | "state">;
type RawChatMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  attachment_url?: string | null;
  reply_to_message_id?: string | null;
  context_product_id?: string | null;
  context_snapshot?: ChatMessage["context"] | null;
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
    context: row.context_snapshot ?? undefined,
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

interface ChatWidgetInboxProps {
  currentUserId: string | null;
  selected: SelectedChat | null;
  onSelect: (chat: SelectedChat) => void;
  /** Overrides the default sm:w-64 — the expanded/full-screen layout's drag-to-resize divider drives this. */
  widthPx?: number;
}

export function ChatWidgetInbox({ currentUserId, selected, onSelect, widthPx }: ChatWidgetInboxProps) {
  const { t: tCustomer } = useTranslation("customer");
  const { t: tCommon } = useTranslation("common");
  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [outlets, setOutlets] = useState<Map<string, ChatOutlet>>(new Map());
  const [messagesByThread, setMessagesByThread] = useState<Map<string, ChatMessage[]>>(new Map());
  const [readMessageIds, setReadMessageIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ChatFilter>("all");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutedThreadIds, setMutedThreadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!currentUserId) return;
    let cancelled = false;

    async function loadConversations() {
      try {
        const response = await fetch("/api/customer/chat", { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(tCustomer("strictMigration.chat.loadFailed"));
        const rawThreads = Array.isArray(payload.data?.threads) ? payload.data.threads : [];
        const normalized: ReturnType<typeof normalizeThread>[] = rawThreads.map((row: ApiThread) => normalizeThread(row));

        const mutesRes = await fetch("/api/chat/mutes").then((r) => (r.ok ? r.json() : { data: [] })).catch(() => ({ data: [] }));

        if (cancelled) return;

        setThreads(normalized.map(({ thread }) => thread));
        setOutlets(new Map(normalized.flatMap(({ outlet }) => outlet ? [[outlet.id, outlet] as const] : [])));
        setMessagesByThread(new Map(normalized.map(({ thread, messages }) => [thread.id, messages])));
        setReadMessageIds(new Set(Array.isArray(payload.data?.readMessageIds) ? payload.data.readMessageIds : []));
        setMutedThreadIds(new Set((mutesRes.data ?? []) as string[]));
        setLoadError(null);
      } catch {
        if (!cancelled) setLoadError(tCustomer("strictMigration.chat.loadFailed"));
      }
    }

    void loadConversations();
    const timer = window.setInterval(() => void loadConversations(), 3000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [currentUserId, tCustomer]);

  // Read-only here — the mute toggle UI lives on ChatThreadPanel's own
  // header (rendered by the right pane's ChatWidgetVendorThread, which owns
  // the actual POST/DELETE). This list only displays the BellOff badge,
  // refreshed on its own 3s poll — the same eventual-consistency the old
  // two-page inbox/detail split already had.
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
        const matchesFilter = filter === "all" || unreadCount > 0;
        const searchable = [outlet?.name, outlet?.city, outlet?.state, latest?.text, thread.id].filter(Boolean).join(" ").toLowerCase();
        return matchesFilter && (!normalizedQuery || searchable.includes(normalizedQuery));
      })
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  }, [filter, messagesByThread, outlets, query, threads, unreadByThread]);

  const isVendorSelected = (threadId: string) => selected?.kind === "vendor" && selected.threadId === threadId;

  return (
    <div
      className={`flex min-h-0 w-full flex-col sm:shrink-0 sm:border-r sm:border-border ${widthPx ? "" : "sm:w-64"}`}
      style={widthPx ? { width: widthPx } : undefined}
    >
      <button
        type="button"
        onClick={() => onSelect({ kind: "support" })}
        className={`flex items-center gap-3 border-b border-border px-3 py-3 text-left transition hover:bg-secondary/70 ${selected?.kind === "support" ? "bg-secondary" : ""}`}
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <MessageCircle size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{tCommon("chatbot.list.supportLabel")}</span>
          <span className="block truncate text-xs text-muted-foreground">{tCommon("chatbot.emptyPrompt")}</span>
        </span>
      </button>

      {!currentUserId ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">{tCommon("chatbot.list.signInPrompt")}</p>
      ) : (
        <>
          <div className="border-b border-border p-2.5">
            <div className="relative">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <label className="sr-only" htmlFor="chat-widget-search">{tCustomer("strictMigration.chat.search")}</label>
              <input
                id="chat-widget-search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={tCustomer("strictMigration.chat.search")}
                className="h-9 w-full rounded-xl border border-border bg-input-background pl-8 pr-3 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              />
            </div>
            <div className="mt-2 flex items-center gap-1.5 overflow-x-auto hide-scrollbar">
              <SlidersHorizontal size={12} className="shrink-0 text-muted-foreground" />
              {FILTERS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setFilter(option.value)}
                  className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold transition-colors ${
                    filter === option.value ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tCustomer(option.labelKey)}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
            {loadError ? (
              <p className="px-2 py-4 text-xs text-destructive">{loadError}</p>
            ) : threads === null ? (
              <p className="px-2 py-4 text-xs text-muted-foreground">{tCustomer("strictMigration.chat.loadingConversations")}</p>
            ) : threads.length === 0 ? (
              <p className="px-2 py-4 text-xs text-muted-foreground">{tCustomer("strictMigration.chat.noConversations")}</p>
            ) : visibleThreads.length === 0 ? (
              <p className="px-2 py-4 text-xs text-muted-foreground">{tCustomer("strictMigration.chat.noMatches")}</p>
            ) : (
              visibleThreads.map((thread) => {
                const outlet = outlets.get(thread.outletId);
                const messages = messagesByThread.get(thread.id) ?? [];
                const latest = messages[messages.length - 1];
                const unreadCount = unreadByThread.get(thread.id) ?? 0;
                const isSelected = isVendorSelected(thread.id);
                const name = outlet?.name ?? tCustomer("strictMigration.chat.vendorFallback");
                return (
                  <button
                    key={thread.id}
                    type="button"
                    onClick={() => onSelect({ kind: "vendor", threadId: thread.id })}
                    className={`mb-1 flex w-full items-start gap-2.5 rounded-xl p-2.5 text-left transition-colors ${isSelected ? "bg-secondary" : "hover:bg-secondary/70"}`}
                  >
                    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-xs font-bold text-primary">
                      {name.slice(0, 1).toUpperCase()}
                      {unreadCount > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-1.5">
                        <p className={`flex min-w-0 items-center gap-1 truncate text-xs ${unreadCount > 0 ? "font-bold text-foreground" : "font-semibold text-foreground"}`}>
                          <span className="truncate">{name}</span>
                          {mutedThreadIds.has(thread.id) && <BellOff size={11} className="shrink-0 text-muted-foreground" aria-label={tCustomer("strictMigration.chat.muted")} />}
                        </p>
                        <span className="shrink-0 text-[0.625rem] text-muted-foreground">{formatChatTimestamp(thread.lastMessageAt)}</span>
                      </div>
                      <p className={`mt-0.5 truncate text-[0.6875rem] ${unreadCount > 0 ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                        {latest ? truncateChatMessage(latest.text, 42) : ""}
                      </p>
                      {(unreadCount > 0 || latest?.senderRole === "customer") && (
                        <div className="mt-1 flex items-center justify-end">
                          {unreadCount > 0 ? (
                            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[0.625rem] font-bold text-primary-foreground">{unreadCount}</span>
                          ) : (
                            <CheckCheck size={12} className="text-primary" aria-label={tCustomer("strictMigration.chat.yourLastMessage")} />
                          )}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
