"use client";

// P4 — right pane of the merged chat widget when a vendor thread is
// selected. Ported from the old app/customer/chat/[threadId]/page.tsx
// (own poll, presence-driven online dot, read+delivered receipts), minus
// the page framing — plus isMuted/onToggleMute wiring the old deep-link
// page never had (a known pre-existing gap, fixed here since
// ChatThreadPanel already supports it and the mute endpoints already exist).

import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useChatPresence } from "@/hooks/use-chat-presence";
import { ChatThreadPanel } from "@/components/customer/chat-thread-panel";
import { useSupportChat } from "@/components/providers/support-chat";
import { useVisibleReviewRefresh } from "@/hooks/use-visible-review-refresh";
import type { ChatMessage, ChatMessageContext, ChatThread } from "@/backend/core/types";

type ChatOutlet = { id: string; name: string; city: string; state: string };
type RawChatMessage = {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
  attachment_url?: string | null;
  reply_to_message_id?: string | null;
  context_product_id?: string | null;
  context_snapshot?: ChatMessageContext | null;
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
  readByOthers?: string[];
  deliveredByOthers?: string[];
  reportedByMe?: boolean;
};

function normalizeApiThread(row: ApiThread) {
  const outlet = Array.isArray(row.outlets) ? row.outlets[0] : row.outlets ?? undefined;
  const thread: ChatThread = {
    id: row.id,
    customerId: row.customer_id,
    outletId: row.outlet_id,
    vendorId: row.vendor_id,
    lastMessageAt: row.last_message_at ?? row.created_at,
  };
  const messages: ChatMessage[] = (row.chat_messages ?? [])
    .slice()
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((message) => ({
      id: message.id,
      threadId: row.id,
      senderId: message.sender_id,
      senderRole: message.sender_id === row.customer_id ? "customer" : "vendor",
      text: message.body,
      sentAt: message.created_at,
      attachmentUrl: message.attachment_url ?? undefined,
      replyToId: message.reply_to_message_id ?? undefined,
      contextProductId: message.context_product_id ?? undefined,
      context: message.context_snapshot ?? undefined,
    }));
  return { thread, outlet, messages };
}

// Refresh cadence while a conversation is open and the tab is visible.
const THREAD_REFRESH_MS = 2500;

const withIds = (current: Set<string>, ids: unknown) => Array.isArray(ids) && ids.some((id) => !current.has(id))
  ? new Set([...current, ...(ids as string[])])
  : current;

interface ChatWidgetVendorThreadProps {
  threadId: string;
  currentUserId: string;
  /** Mobile-only — clears the selection back to the empty split-view state. Hidden at sm and above, where the list pane stays visible alongside this one. */
  onBack: () => void;
}

export function ChatWidgetVendorThread({ threadId, currentUserId, onBack }: ChatWidgetVendorThreadProps) {
  const { t: tCustomer } = useTranslation("customer");
  const { t: tCommon } = useTranslation("common");
  const { pendingContext, clearPendingContext } = useSupportChat();
  const [thread, setThread] = useState<ChatThread | null | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [outlet, setOutlet] = useState<ChatOutlet | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [readByOthers, setReadByOthers] = useState<Set<string>>(new Set());
  const [deliveredByOthers, setDeliveredByOthers] = useState<Set<string>>(new Set());
  const [reportedByMe, setReportedByMe] = useState(false);
  const presence = useChatPresence(thread ? `chat-presence-vendor-${thread.vendorId}` : undefined, currentUserId, "customer");
  const vendorOnline = presence.some((p) => p.role === "vendor");

  // Opening loads the whole thread; each refresh asks only for messages from
  // the newest one held (inclusive, merged by id). Receipts only ever grow:
  // a message never becomes unread or undelivered again.
  const newestSentAt = useRef<string | null>(null);
  const loadConversation = useCallback(async (signal?: AbortSignal, incremental = false) => {
    const after = incremental ? newestSentAt.current : null;
    try {
      const response = await fetch(`/api/customer/chat/${threadId}${after ? `?after=${encodeURIComponent(after)}` : ""}`, { cache: "no-store", signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404) {
          if (!signal?.aborted) setThread(null);
          return;
        }
        throw new Error(tCustomer("ui.chat.loadingConversation"));
      }
      const normalized = normalizeApiThread(payload.data as ApiThread);
      if (signal?.aborted || normalized.thread.id !== threadId) return;
      const newest = normalized.messages[normalized.messages.length - 1]?.sentAt;
      if (!after || (newest && newest > after)) newestSentAt.current = newest ?? null;
      setThread((current) => current?.id === normalized.thread.id && current.lastMessageAt === normalized.thread.lastMessageAt ? current : normalized.thread);
      if (!after) setOutlet(normalized.outlet);
      setMessages((current) => {
        if (!after) return normalized.messages;
        const known = new Set(current.map((message) => message.id));
        const added = normalized.messages.filter((message) => !known.has(message.id));
        return added.length ? [...current, ...added].sort((a, b) => a.sentAt.localeCompare(b.sentAt)) : current;
      });
      setReadByOthers((current) => withIds(after ? current : new Set(), payload.data?.readByOthers));
      setDeliveredByOthers((current) => withIds(after ? current : new Set(), payload.data?.deliveredByOthers));
      setReportedByMe(Boolean(payload.data?.reportedByMe));
      setLoadError(null);
    } catch {
      if (!signal?.aborted) setLoadError(tCustomer("ui.chat.conversationMissing"));
    }
  }, [threadId, tCustomer]);

  useEffect(() => {
    newestSentAt.current = null;
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- full load when a conversation opens
    void loadConversation(controller.signal);
    return () => controller.abort();
  }, [loadConversation]);

  useVisibleReviewRefresh({
    enabled: Boolean(thread),
    onRefresh: (signal) => loadConversation(signal, true),
    intervalMs: THREAD_REFRESH_MS,
  });

  // Mark read/delivered when the conversation opens and when a new vendor
  // message arrives, not on every refresh.
  const newestVendorMessageId = useMemo(
    () => [...messages].reverse().find((message) => message.senderRole !== "customer")?.id ?? null,
    [messages],
  );
  useEffect(() => {
    if (!thread?.id) return;
    void fetch(`/api/chat/${thread.id}/read`, { method: "POST" });
    void fetch(`/api/chat/${thread.id}/delivered`, { method: "POST" });
  }, [thread?.id, newestVendorMessageId]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/chat/mutes")
      .then((r) => (r.ok ? r.json() : { data: [] }))
      .then((body) => {
        if (!cancelled) setIsMuted(((body.data ?? []) as string[]).includes(threadId));
      })
      .catch(() => {
        // best-effort — mute state just stays at its last-known value
      });
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  async function toggleMute() {
    const currentlyMuted = isMuted;
    setIsMuted(!currentlyMuted);
    try {
      await fetch(`/api/chat/threads/${threadId}/mute`, { method: currentlyMuted ? "DELETE" : "POST" });
    } catch {
      setIsMuted(currentlyMuted);
    }
  }

  if (thread === undefined) {
    return <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">{tCustomer("ui.chat.loadingConversation")}</div>;
  }
  if (thread === null || loadError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-sm font-semibold text-foreground">{tCustomer("ui.chat.conversationNotFound")}</p>
        <p className="mt-2 text-xs text-muted-foreground">{loadError ?? tCustomer("ui.chat.conversationMissing")}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <button type="button" onClick={onBack} className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:text-foreground sm:hidden">
        <ArrowLeft size={14} /> {tCommon("actions.back")}
      </button>
      <ChatThreadPanel
        threadId={thread.id}
        messages={messages}
        currentUserId={currentUserId}
        counterpart={{
          name: outlet?.name ?? tCustomer("ui.chat.vendorConversation"),
          subtitle: `${outlet?.city || tCustomer("ui.labels.malaysia")}${outlet?.state ? `, ${outlet.state}` : ""}`,
          badge: tCustomer("ui.chat.vendor"),
          online: vendorOnline,
        }}
        onSend={async (text, replyToId, contextProductId) => {
          const response = await fetch(`/api/customer/chat/${thread.id}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ body: text, replyToId, contextProductId }),
          });
          const payload = await response.json().catch(() => ({}));
          if (!response.ok || !payload.data) throw new Error(tCustomer("strictMigration.chat.sendFailed"));
          if (contextProductId) clearPendingContext();
          const row = payload.data as RawChatMessage & { thread_id?: string };
          return {
            id: row.id,
            threadId: thread.id,
            senderId: row.sender_id,
            senderRole: "customer" as const,
            text: row.body,
            sentAt: row.created_at,
            attachmentUrl: row.attachment_url ?? undefined,
            replyToId: row.reply_to_message_id ?? undefined,
            contextProductId: row.context_product_id ?? undefined,
            context: row.context_snapshot ?? undefined,
          };
        }}
        onMessageSent={(message) => setMessages((previous) => previous.some((item) => item.id === message.id) ? previous : [...previous, message])}
        pendingContext={pendingContext}
        onDismissContext={clearPendingContext}
        readByOthers={readByOthers}
        deliveredByOthers={deliveredByOthers}
        underReview={reportedByMe}
        isMuted={isMuted}
        onToggleMute={() => void toggleMute()}
      />
    </div>
  );
}
