"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/components/providers/auth";
import { getMessages, getThread } from "@/backend/domains/identity";
import { getOutlet } from "@/backend/domains/catalogue";
import { EmptyState } from "@/components/shared/empty-state";
import { ChatThreadPanel } from "@/components/customer/chat-thread-panel";
import type { ChatMessage, ChatThread, Outlet } from "@/backend/core/types";

export default function ChatThreadPage() {
  const params = useParams<{ threadId: string }>();
  const { currentUser } = useAuth();
  const [thread, setThread] = useState<ChatThread | null | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [outlet, setOutlet] = useState<Outlet | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [loadedMessages, loadedThread] = await Promise.all([getMessages(params.threadId), getThread(params.threadId)]);
      if (cancelled) return;
      setMessages(loadedMessages);
      setThread(loadedThread ?? null);
      if (loadedThread) setOutlet(await getOutlet(loadedThread.outletId));
    })();
    return () => {
      cancelled = true;
    };
  }, [params.threadId]);

  useEffect(() => {
    if (!currentUser || !thread) return;
    void fetch(`/api/chat/${thread.id}/read`, { method: "POST" });
  }, [currentUser, thread]);

  if (thread === undefined) {
    return <div className="mx-auto max-w-3xl px-6 py-16 text-sm text-muted-foreground">Loading conversation…</div>;
  }
  if (thread === null) {
    return <EmptyState title="Conversation not found" description="This chat thread doesn't exist." />;
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-7rem)] max-w-4xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex min-h-[min(720px,calc(100vh-12rem))] flex-1 overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <ChatThreadPanel
          thread={thread}
          outlet={outlet}
          messages={messages}
          currentUser={currentUser}
          showBack
          onMessageSent={(message) => setMessages((previous) => [...previous, message])}
        />
      </div>
    </div>
  );
}
