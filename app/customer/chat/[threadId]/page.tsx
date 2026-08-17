"use client";

import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/providers/auth";
import { getMessages, getOtherDeliveredMessageIds, getOtherReadMessageIds, getThread, sendMessage } from "@/backend/domains/identity";
import { getOutlet } from "@/backend/domains/catalogue";
import { supabase } from "@/backend/supabase";
import { useChatPresence } from "@/hooks/use-chat-presence";
import { EmptyState } from "@/components/shared/empty-state";
import { ChatThreadPanel } from "@/components/customer/chat-thread-panel";
import type { ChatMessage, ChatThread, Outlet } from "@/backend/core/types";

export default function ChatThreadPage() {
  const { t: tCustomer } = useTranslation("customer");
  const params = useParams<{ threadId: string }>();
  const { currentUser } = useAuth();
  const [thread, setThread] = useState<ChatThread | null | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [outlet, setOutlet] = useState<Outlet | undefined>(undefined);
  const [readByOthersIds, setReadByOthersIds] = useState<Set<string>>(new Set());
  const [deliveredByOthersIds, setDeliveredByOthersIds] = useState<Set<string>>(new Set());
  const presence = useChatPresence(thread ? `chat-presence-vendor-${thread.vendorId}` : undefined, currentUser?.id, "customer");
  const vendorOnline = presence.some((p) => p.role === "vendor");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [loadedMessages, loadedThread] = await Promise.all([getMessages(params.threadId), getThread(params.threadId)]);
      if (cancelled) return;
      setMessages(loadedMessages);
      setThread(loadedThread ?? null);
      if (loadedThread) setOutlet(await getOutlet(loadedThread.outletId));
      if (loadedThread) setReadByOthersIds(await getOtherReadMessageIds(loadedThread.customerId, loadedMessages.map((m) => m.id)));
      if (loadedThread) setDeliveredByOthersIds(await getOtherDeliveredMessageIds(loadedThread.customerId, loadedMessages.map((m) => m.id)));
    })();
    return () => {
      cancelled = true;
    };
  }, [params.threadId]);

  useEffect(() => {
    if (!currentUser || !thread) return;
    void fetch(`/api/chat/${thread.id}/read`, { method: "POST" });
    void fetch(`/api/chat/${thread.id}/delivered`, { method: "POST" });
  }, [currentUser, thread]);

  useEffect(() => {
    if (!thread) return;
    const channel = supabase
      .channel(`chat-thread-${thread.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `thread_id=eq.${thread.id}` },
        ({ new: row }: { new: { id: string; thread_id: string; sender_id: string; body: string; created_at: string; attachment_url: string | null } }) => {
          setMessages((previous) => {
            if (previous.some((m) => m.id === row.id)) return previous;
            return [...previous, {
              id: row.id,
              threadId: row.thread_id,
              senderId: row.sender_id,
              senderRole: row.sender_id === thread.customerId ? "customer" : "vendor",
              text: row.body,
              sentAt: row.created_at,
              attachmentUrl: row.attachment_url ?? undefined,
            }];
          });
          if (row.sender_id !== thread.customerId) void fetch(`/api/chat/${thread.id}/delivered`, { method: "POST" });
        },
      )
      // ponytail: chat_message_reads/deliveries have no thread_id column to filter
      // on, so these streams aren't scoped to this thread — stray ids from other
      // threads just sit unused in the Set. Add a thread_id column to filter
      // server-side if that matters.
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_message_reads" },
        ({ new: row }: { new: { message_id: string; user_id: string } }) => {
          if (row.user_id === thread.customerId) return;
          setReadByOthersIds((previous) => new Set(previous).add(row.message_id));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_message_deliveries" },
        ({ new: row }: { new: { message_id: string; user_id: string } }) => {
          if (row.user_id === thread.customerId) return;
          setDeliveredByOthersIds((previous) => new Set(previous).add(row.message_id));
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [thread]);

  if (thread === undefined || !currentUser) {
    return <div className="mx-auto max-w-3xl px-6 py-16 text-sm text-muted-foreground">{tCustomer("ui.chat.loadingConversation")}</div>;
  }
  if (thread === null) {
    return <EmptyState title={tCustomer("ui.chat.conversationNotFound")} description={tCustomer("ui.chat.conversationMissing")} />;
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-7rem)] max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex h-[min(720px,calc(100dvh-12rem))] min-h-0 flex-1 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <ChatThreadPanel
          threadId={thread.id}
          messages={messages}
          currentUserId={currentUser.id}
          counterpart={{
            name: outlet?.name ?? tCustomer("ui.chat.vendorConversation"),
            subtitle: `${outlet?.city || tCustomer("ui.labels.malaysia")}${outlet?.state ? `, ${outlet.state}` : ""}`,
            badge: tCustomer("ui.chat.vendor"),
            online: vendorOnline,
          }}
          onSend={(text) => sendMessage(thread.id, currentUser.id, "customer", text)}
          onMessageSent={(message) => setMessages((previous) => [...previous, message])}
          backHref="/customer/chat"
          readByOthers={readByOthersIds}
          deliveredByOthers={deliveredByOthersIds}
        />
      </div>
    </div>
  );
}
