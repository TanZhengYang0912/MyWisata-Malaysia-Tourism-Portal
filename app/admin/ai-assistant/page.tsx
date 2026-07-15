"use client";

// P4 — Member 4: Admin AI assistant. CLAUDE-ADMIN-AI.md Part 2.
// Capability 1 (ask) reuses the customer chatbot widget's interaction shape
// (message bubbles, input + send) as a full panel rather than a floating
// bubble — admin analytics answers read better with room, and this page
// sits inside the admin shell already. Capability 2 (draft) lives alongside
// it since neither is usable standalone without some UI. Capability 3 (AI
// review) lives on the recommendations screen itself, not here.

import { useRef, useState } from "react";
import { Bot, Send, Shield, Sparkles } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ChatMessage {
  role: "user" | "bot";
  text: string;
}

const SESSION_STORAGE_KEY = "mw_admin_ai_session";
const DRAFT_TYPES = [
  { value: "onboarding", label: "Vendor onboarding" },
  { value: "rejection", label: "Rejection notice" },
  { value: "approval", label: "Approval message" },
  { value: "custom", label: "Custom" },
] as const;

function AskPanel() {
  const [sessionKey, setSessionKey] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem(SESSION_STORAGE_KEY),
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  async function send() {
    const question = input.trim();
    if (!question || sending) return;
    setSending(true);
    setMessages((m) => [...m, { role: "user", text: question }]);
    setInput("");

    try {
      const res = await fetch("/api/admin-ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionKey: sessionKey ?? undefined, question }),
      });
      const body = (await res.json()) as {
        data: { sessionKey: string; answer: string } | null;
        error: { message: string } | null;
      };
      if (!res.ok || !body.data) {
        setMessages((m) => [...m, { role: "bot", text: body.error?.message ?? "Assistant unavailable right now." }]);
        return;
      }
      if (body.data.sessionKey && body.data.sessionKey !== sessionKey) {
        setSessionKey(body.data.sessionKey);
        window.localStorage.setItem(SESSION_STORAGE_KEY, body.data.sessionKey);
      }
      setMessages((m) => [...m, { role: "bot", text: body.data!.answer }]);
    } catch {
      setMessages((m) => [...m, { role: "bot", text: "Assistant unavailable right now." }]);
    } finally {
      setSending(false);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
    }
  }

  return (
    <Card>
      <CardContent className="p-4 flex flex-col" style={{ height: 420 }}>
        <div className="flex items-center gap-2 mb-3">
          <Bot size={16} className="text-primary" />
          <h2 className="text-sm font-bold text-foreground">Ask about platform metrics</h2>
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto space-y-2 mb-3">
          {messages.length === 0 && (
            <p className="text-xs text-muted-foreground">
              e.g. &ldquo;How many recommendations are pending this week?&rdquo; or &ldquo;Show me withdrawals over 500&rdquo;.
              Answers only come from registered aggregate queries — never raw customer data.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "ml-auto bg-primary text-white" : "bg-muted text-foreground"}`}
            >
              {m.text}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder="Ask a question…"
            className="flex-1 h-9 rounded-full border border-border px-3 text-sm bg-background text-foreground"
            disabled={sending}
          />
          <Button size="icon" className="h-9 w-9 rounded-full shrink-0" onClick={send} disabled={sending || !input.trim()}>
            <Send size={14} />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DraftPanel() {
  const [type, setType] = useState<(typeof DRAFT_TYPES)[number]["value"]>("onboarding");
  const [context, setContext] = useState("");
  const [draft, setDraft] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    if (!context.trim() || generating) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/admin-ai/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, context: context.trim() }),
      });
      const body = (await res.json()) as { data: { draft: string } | null; error: { message: string } | null };
      if (!res.ok || !body.data) {
        setError(body.error?.message ?? "Assistant unavailable right now.");
        return;
      }
      setDraft(body.data.draft);
    } catch {
      setError("Assistant unavailable right now.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          <h2 className="text-sm font-bold text-foreground">Draft a staff message</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          You supply the specifics — the assistant never fetches vendor or customer data itself. Edit and send manually; nothing is sent for you.
        </p>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
        >
          {DRAFT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="e.g. Vendor: Sunset Kayak Tours. Photos submitted were blurry, cannot verify listing quality."
          rows={3}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <Button size="sm" onClick={generate} disabled={generating || !context.trim()}>
          {generating ? "Drafting…" : "Generate draft"}
        </Button>
        {error && <p className="text-xs text-destructive">{error}</p>}
        {draft && (
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminAiAssistantPage() {
  const { currentUser } = useAuth();

  if (currentUser && currentUser.role !== "super_admin") {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield size={16} /> The AI assistant is limited to super admins.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">AI Assistant</h1>
        <p className="text-sm text-muted-foreground">
          Platform analytics and staff message drafting. Never sees raw customer records — metrics come from a fixed set of
          registered aggregate queries, and drafts use only what you type in.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <AskPanel />
        <DraftPanel />
      </div>
    </div>
  );
}
