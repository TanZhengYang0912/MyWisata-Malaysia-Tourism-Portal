"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { getMessages, getThreadsForUser } from "@/backend/domains/identity";
import { getOutlets } from "@/backend/domains/catalogue";
import { EmptyState } from "@/components/shared/empty-state";
import type { ChatMessage, ChatThread, Outlet } from "@/backend/core/types";

export default function ChatListPage() {
  const { currentUser } = useAuth();
  const [threads, setThreads] = useState<ChatThread[] | null>(null);
  const [outlets, setOutlets] = useState<Map<string, Outlet>>(new Map());
  const [lastMessages, setLastMessages] = useState<Map<string, ChatMessage>>(new Map());

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      const [list, allOutlets] = await Promise.all([getThreadsForUser(currentUser.id), getOutlets()]);
      setThreads(list);
      setOutlets(new Map(allOutlets.map((o) => [o.id, o])));
      const messagesByThread = await Promise.all(list.map((t) => getMessages(t.id)));
      setLastMessages(new Map(list.map((t, i) => [t.id, messagesByThread[i][messagesByThread[i].length - 1]]).filter(([, m]) => m) as [string, ChatMessage][]));
    })();
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
            const outlet = outlets.get(thread.outletId);
            const last = lastMessages.get(thread.id);
            return (
              <Link
                key={thread.id}
                href={`/customer/chat/${thread.id}`}
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
