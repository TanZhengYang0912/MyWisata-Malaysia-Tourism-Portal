"use client";

// P4 — Member 4: FAQ chatbot widget. See CLAUDE.md Step 7.
//
// The "Get help from our team" button already POSTs to /api/support/tickets
// (Step 8) — that route doesn't exist yet, so escalation will fail
// gracefully (shown as "couldn't create a ticket") until Step 8 lands. This
// is the expected shape once it does, not a stub to rewrite later.
//
// CLAUDE-FIXES.md Fix 2: "close the loop" — escalation used to tell the
// user nothing beyond "a ticket has been created." Now it names the ticket
// and links to My Tickets, since that page (and the reply mechanism behind
// it) exists now.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatMessage {
  role: "user" | "bot";
  text: string;
}

const SESSION_STORAGE_KEY = "mw_chatbot_session";

export function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  // Lazy initializer, not an effect: reading localStorage here is
  // synchronous and doesn't need a render cycle. Guarded for SSR, where
  // `window` doesn't exist — sessionKey is never rendered into JSX, so a
  // server/client value mismatch here can't cause a hydration warning.
  const [sessionKey, setSessionKey] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem(SESSION_STORAGE_KEY),
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [canEscalate, setCanEscalate] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [escalateNote, setEscalateNote] = useState<string | null>(null);
  const [escalatedTicketId, setEscalatedTicketId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function sendMessage() {
    const question = input.trim();
    if (!question || sending) return;
    setSending(true);
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");
    setCanEscalate(false);
    setEscalateNote(null);

    try {
      const res = await fetch("/api/chatbot/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionKey: sessionKey ?? undefined, question }),
      });
      const body = (await res.json()) as {
        data: { sessionKey: string; answer: string; canEscalate: boolean } | null;
        error: { message: string } | null;
      };
      if (!res.ok || !body.data) {
        setMessages((m) => [...m, { role: "bot", text: "Sorry, something went wrong. Please try again." }]);
        return;
      }
      if (body.data.sessionKey && body.data.sessionKey !== sessionKey) {
        setSessionKey(body.data.sessionKey);
        window.localStorage.setItem(SESSION_STORAGE_KEY, body.data.sessionKey);
      }
      setMessages((m) => [...m, { role: "bot", text: body.data!.answer }]);
      setCanEscalate(body.data.canEscalate);
    } catch {
      setMessages((m) => [...m, { role: "bot", text: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setSending(false);
    }
  }

  async function escalate() {
    if (escalating) return;
    setEscalating(true);
    setEscalateNote(null);
    const lastQuestion = [...messages].reverse().find((m) => m.role === "user")?.text ?? "Support request";
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionKey: sessionKey ?? undefined, subject: lastQuestion, body: lastQuestion }),
      });
      const result = (await res.json()) as { data: { id: string; category: string } | null };
      if (res.ok && result.data) {
        setEscalatedTicketId(result.data.id);
        const shortId = result.data.id.slice(0, 8).toUpperCase();
        setEscalateNote(
          `I've created ticket #${shortId} for you. Our team will reply — you'll get a notification, and you can see it under My Tickets.`,
        );
      } else {
        setEscalateNote("Couldn't create a ticket right now. Please try again later.");
      }
    } catch {
      setEscalateNote("Couldn't create a ticket right now. Please try again later.");
    } finally {
      setEscalating(false);
      setCanEscalate(false);
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 print:hidden">
      {open && (
        <div
          className="mb-3 w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-background shadow-xl flex flex-col overflow-hidden"
          style={{ height: 420 }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary text-white">
            <span className="text-sm font-semibold">MyWisata Support</span>
            <div className="flex items-center gap-3">
              <Link href="/customer/support" className="text-[11px] underline opacity-90 hover:opacity-100">
                My Tickets
              </Link>
              <button onClick={() => setOpen(false)} aria-label="Close chat">
                <X size={16} />
              </button>
            </div>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center mt-8">
                Ask about rewards, affiliate links, withdrawals, booking, or verification.
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-primary text-white" : "bg-muted text-foreground"}`}
              >
                {m.text}
              </div>
            ))}
            {canEscalate && !escalateNote && (
              <div className="pt-1">
                <Button size="sm" variant="outline" onClick={escalate} disabled={escalating} className="w-full">
                  {escalating ? "Creating ticket…" : "Get help from our team"}
                </Button>
              </div>
            )}
            {escalateNote && (
              <div className="pt-1 text-center">
                <p className="text-xs text-muted-foreground">{escalateNote}</p>
                {escalatedTicketId && (
                  <Link href={`/customer/support/${escalatedTicketId}`} className="text-xs text-primary underline">
                    View my tickets
                  </Link>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 px-3 py-3 border-t border-border">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage();
              }}
              placeholder="Ask a question…"
              className="flex-1 h-9 rounded-full border border-border px-3 text-sm bg-background text-foreground"
              disabled={sending}
            />
            <Button size="icon" className="h-9 w-9 rounded-full shrink-0" onClick={sendMessage} disabled={sending || !input.trim()}>
              <Send size={14} />
            </Button>
          </div>
        </div>
      )}

      <Button size="icon" className="h-14 w-14 rounded-full shadow-lg" onClick={() => setOpen((o) => !o)} title="Chat with us">
        <MessageCircle size={22} />
      </Button>
    </div>
  );
}
