"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Send } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { getMessages, getThread, sendMessage } from "@/backend/domains/identity";
import { getOutlet } from "@/backend/domains/catalogue";
import { EmptyState } from "@/components/shared/empty-state";
import type { ChatMessage, ChatThread, Outlet } from "@/backend/core/types";

export default function ChatThreadPage() {
  const params = useParams<{ threadId: string }>();
  const { currentUser } = useAuth();
  const [thread, setThread] = useState<ChatThread | null | undefined>(undefined);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [outlet, setOutlet] = useState<Outlet | undefined>(undefined);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const [msgs, t] = await Promise.all([getMessages(params.threadId), getThread(params.threadId)]);
      setMessages(msgs);
      setThread(t ?? null);
      if (t) setOutlet(await getOutlet(t.outletId));
    })();
  }, [params.threadId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (sending || !text.trim() || !currentUser) return;
    setSending(true);
    const msg = await sendMessage(params.threadId, currentUser.id, "customer", text.trim());
    setMessages((prev) => [...prev, msg]);
    setText("");
    setSending(false);
  }

  if (thread === undefined) {
    return <div className="max-w-2xl mx-auto px-6 py-16 text-sm text-muted-foreground">Loading…</div>;
  }
  if (thread === null) {
    return <EmptyState title="Conversation not found" description="This chat thread doesn't exist." />;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 flex flex-col" style={{ height: "calc(100vh - 6rem)" }}>
      <div className="flex items-center gap-3 pb-4 border-b border-border mb-4">
        <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white bg-teal">
          {outlet?.name[0] ?? "?"}
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">{outlet?.name ?? "Vendor"}</p>
          <p className="text-xs text-muted-foreground">{outlet?.city}, {outlet?.state}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 mb-4">
        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.senderRole === "customer" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[75%] px-3.5 py-2.5 rounded-2xl text-sm"
              style={{
                backgroundColor: m.senderRole === "customer" ? "var(--primary)" : "var(--muted)",
                color: m.senderRole === "customer" ? "white" : "var(--foreground)",
              }}
            >
              {m.text}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSend} className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 text-sm px-4 py-2.5 rounded-full border border-border bg-input-background outline-none text-foreground"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 disabled:opacity-50 bg-primary"
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
