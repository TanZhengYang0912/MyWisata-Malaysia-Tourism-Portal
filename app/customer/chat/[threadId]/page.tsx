"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/providers/auth";
import { useChatPresence } from "@/hooks/use-chat-presence";
import { EmptyState } from "@/components/shared/empty-state";
import { ChatThreadPanel } from "@/components/customer/chat-thread-panel";
import type { ChatMessage, ChatThread } from "@/backend/core/types";

type ChatOutlet = { id: string; name: string; city: string; state: string };
type RawChatMessage = {
  id: string;
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
    }));
  return { thread, outlet, messages };
}

export default function ChatThreadPage() {
  const params = useParams<{ threadId: string }>();
  const { currentUser } = useAuth();
  const [thread, setThread] = useState<ChatThread | null | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [outlet, setOutlet] = useState<ChatOutlet | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const presence = useChatPresence(thread ? `chat-presence-vendor-${thread.vendorId}` : undefined, currentUser?.id, "customer");
  const vendorOnline = presence.some((p) => p.role === "vendor");

  useEffect(() => {
    let cancelled = false;

    async function loadConversation() {
      try {
        const response = await fetch(`/api/customer/chat/${params.threadId}`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          if (response.status === 404) {
            if (!cancelled) setThread(null);
            return;
          }
          throw new Error(payload.error?.message || "Unable to load conversation");
        }
        const normalized = normalizeApiThread(payload.data as ApiThread);
        if (cancelled) return;
        setThread(normalized.thread);
        setOutlet(normalized.outlet);
        setMessages(normalized.messages);
        setLoadError(null);
      } catch {
        if (!cancelled) setLoadError("We couldn't load this conversation. Please refresh and try again.");
      }
    }

    void loadConversation();
    const timer = window.setInterval(() => void loadConversation(), 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [params.threadId]);

  useEffect(() => {
    if (!currentUser || !thread) return;
    void fetch(`/api/chat/${thread.id}/read`, { method: "POST" });
    void fetch(`/api/chat/${thread.id}/delivered`, { method: "POST" });
  }, [currentUser, thread]);

  if (thread === undefined || !currentUser) {
    return <div className="mx-auto max-w-3xl px-6 py-16 text-sm text-muted-foreground">Loading conversation…</div>;
  }
  if (thread === null) {
    return <EmptyState title="Conversation not found" description="This chat thread doesn't exist." />;
  }
  if (loadError) {
    return <EmptyState title="Unable to load conversation" description={loadError} />;
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-7rem)] max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex h-[min(720px,calc(100dvh-12rem))] min-h-0 flex-1 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <ChatThreadPanel
          threadId={thread.id}
          messages={messages}
          currentUserId={currentUser.id}
          counterpart={{
            name: outlet?.name ?? "Vendor conversation",
            subtitle: `${outlet?.city || "Malaysia"}${outlet?.state ? `, ${outlet.state}` : ""}`,
            badge: "Vendor",
            online: vendorOnline,
          }}
          onSend={async (text, replyToId) => {
            const response = await fetch(`/api/customer/chat/${thread.id}/messages`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ body: text, replyToId }),
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.data) throw new Error(payload.error?.message || "Unable to send message");
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
            };
          }}
          onMessageSent={(message) => setMessages((previous) => previous.some((item) => item.id === message.id) ? previous : [...previous, message])}
          backHref="/customer/chat"
        />
      </div>
    </div>
  );
}
