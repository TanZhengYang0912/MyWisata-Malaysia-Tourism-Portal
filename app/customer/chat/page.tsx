"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { getMessages, getThreadsForUser } from "@/backend/domains/identity";
import { getOutlet } from "@/backend/domains/catalogue";
import { EmptyState } from "@/components/shared/empty-state";
import type { ChatThread } from "@/backend/core/types";

export default function ChatListPage() {
  const { currentUser } = useAuth();
  const [threads, setThreads] = useState<ChatThread[] | null>(null);

  useEffect(() => {
    if (currentUser) setThreads(getThreadsForUser(currentUser.id));
  }, [currentUser]);

  if (threads === null) {
    return <div className="max-w-2xl mx-auto px-6 py-16 text-sm text-muted-foreground">Loading…</div>;
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
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-6 font-[family-name:var(--font-display)]">Chat</h1>
      <div className="space-y-2">
        {threads
          .slice()
          .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
          .map((thread) => {
            const outlet = getOutlet(thread.outletId);
            const messages = getMessages(thread.id);
            const last = messages[messages.length - 1];
            return (
              <Link
                key={thread.id}
                href={`/chat/${thread.id}`}
                className="flex items-center gap-3 p-3 rounded-xl border border-border hover:bg-secondary transition-colors"
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0 bg-teal">
                  {outlet?.name[0] ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">{outlet?.name ?? "Vendor"}</p>
                  <p className="text-xs text-muted-foreground truncate">{last?.text ?? "No messages yet"}</p>
                </div>
              </Link>
            );
          })}
      </div>
    </div>
  );
}
