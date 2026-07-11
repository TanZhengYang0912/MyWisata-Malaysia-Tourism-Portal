"use client";

import { useEffect, useState } from "react";
import { Send } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { scopedOutletIds } from "../layout";
import { getMessages, getThreadsForOutlets, getUsers, sendMessage } from "@/backend/domains/identity";
import { getOutlets } from "@/backend/domains/catalogue";
import { EmptyState } from "@/components/shared/empty-state";
import type { ChatMessage, ChatThread, Outlet, User } from "@/backend/core/types";

export default function VendorInboxPage() {
  const { currentUser, activeVendorId, activeOutletIds } = useAuth();
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [selected, setSelected] = useState<ChatThread | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [users, setUsers] = useState<Map<string, User>>(new Map());
  const [outlets, setOutlets] = useState<Map<string, Outlet>>(new Map());

  useEffect(() => {
    (async () => {
      const outletIds = await scopedOutletIds(activeVendorId, activeOutletIds);
      const [list, allUsers, allOutlets] = await Promise.all([getThreadsForOutlets(outletIds), getUsers(), getOutlets()]);
      setThreads(list);
      setUsers(new Map(allUsers.map((u) => [u.id, u])));
      setOutlets(new Map(allOutlets.map((o) => [o.id, o])));
      setSelected((prev) => prev ?? list[0] ?? null);
    })();
  }, [activeVendorId, activeOutletIds]);

  useEffect(() => {
    if (selected) getMessages(selected.id).then(setMessages);
  }, [selected]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !text.trim() || !currentUser) return;
    const msg = await sendMessage(selected.id, currentUser.id, "vendor", text.trim());
    setMessages((prev) => [...prev, msg]);
    setText("");
  }

  if (threads.length === 0) {
    return <div className="p-8"><EmptyState title="No conversations yet" description="Customer messages to your outlets will show up here." /></div>;
  }

  return (
    <div className="flex" style={{ height: "100vh" }}>
      <div className="w-72 shrink-0 border-r border-border overflow-y-auto">
        <div className="p-4 border-b border-border">
          <h1 className="font-bold text-foreground">Chat Inbox</h1>
        </div>
        {threads.map((t) => {
          const customer = users.get(t.customerId);
          return (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className="w-full flex items-center gap-3 p-3 text-left border-b border-border"
              style={{ backgroundColor: selected?.id === t.id ? "var(--secondary)" : "transparent" }}
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs text-white shrink-0 bg-primary">
                {customer?.avatarInitial ?? "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{customer?.name ?? "Customer"}</p>
                <p className="text-xs text-muted-foreground">{outlets.get(t.outletId)?.name}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex-1 flex flex-col p-6">
        {selected ? (
          <>
            <div className="flex-1 overflow-y-auto space-y-3 mb-4">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.senderRole === "vendor" ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[70%] px-3.5 py-2.5 rounded-2xl text-sm"
                    style={{
                      backgroundColor: m.senderRole === "vendor" ? "var(--primary)" : "var(--muted)",
                      color: m.senderRole === "vendor" ? "white" : "var(--foreground)",
                    }}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
            <form onSubmit={handleSend} className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Reply to customer…"
                className="flex-1 text-sm px-4 py-2.5 rounded-full border border-border bg-input-background outline-none text-foreground"
              />
              <button type="submit" disabled={!text.trim()} className="w-10 h-10 rounded-full flex items-center justify-center text-white shrink-0 disabled:opacity-50 bg-primary">
                <Send size={15} />
              </button>
            </form>
          </>
        ) : (
          <EmptyState title="Select a conversation" />
        )}
      </div>
    </div>
  );
}
