"use client";

// P4 — right pane of the merged chat widget when a vendor thread is
// selected. Ported from the old app/customer/chat/[threadId]/page.tsx
// (own poll, presence-driven online dot, read+delivered receipts), minus
// the page framing — plus isMuted/onToggleMute wiring the old deep-link
// page never had (a known pre-existing gap, fixed here since
// ChatThreadPanel already supports it and the mute endpoints already exist).

import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useChatPresence } from "@/hooks/use-chat-presence";
import { ChatThreadPanel } from "@/components/customer/chat-thread-panel";
import { useSupportChat } from "@/components/providers/support-chat";
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

  useEffect(() => {
    let cancelled = false;

    async function loadConversation() {
      try {
        const response = await fetch(`/api/customer/chat/${threadId}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 404) {
            if (!cancelled) setThread(null);
            return;
          }
          throw new Error(tCustomer("ui.chat.loadingConversation"));
        }
        const normalized = normalizeApiThread(payload.data as ApiThread);
        if (cancelled) return;
        setThread(normalized.thread);
        setOutlet(normalized.outlet);
        setMessages(normalized.messages);
        setReadByOthers(new Set(Array.isArray(payload.data?.readByOthers) ? payload.data.readByOthers : []));
        setDeliveredByOthers(new Set(Array.isArray(payload.data?.deliveredByOthers) ? payload.data.deliveredByOthers : []));
        setReportedByMe(Boolean(payload.data?.reportedByMe));
        setLoadError(null);
      } catch {
        if (!cancelled) setLoadError(tCustomer("ui.chat.conversationMissing"));
      }
    }

    void loadConversation();
    const timer = window.setInterval(() => void loadConversation(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [threadId, tCustomer]);

  useEffect(() => {
    if (!thread) return;
    void fetch(`/api/chat/${thread.id}/read`, { method: "POST" });
    void fetch(`/api/chat/${thread.id}/delivered`, { method: "POST" });
  }, [thread]);

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
