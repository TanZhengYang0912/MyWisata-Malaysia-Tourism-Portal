"use client";

// P4 — Member 4: Admin AI assistant. CLAUDE-ADMIN-AI.md Part 2.
// Capability 1 (ask) reuses the customer chatbot widget's interaction shape
// (message bubbles, input + send) as a full panel rather than a floating
// bubble — admin analytics answers read better with room, and this page
// sits inside the admin shell already. Capability 2 (draft) lives alongside
// it since neither is usable standalone without some UI. Capability 3 (AI
// review) lives on the recommendations screen itself, not here.

import { useEffect, useRef, useState } from "react";
import { Bot, Send, Shield, Sparkles } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StaffConductPanel } from "@/components/admin/staff-conduct-panel";
import { useTranslation } from "react-i18next";

interface ChatMessage {
  role: "user" | "bot";
  text: string;
}

const SESSION_STORAGE_KEY = "mw_admin_ai_session";
const DRAFT_QUESTION_KEY = "mw_admin_ai_draft_question";
const DRAFT_TYPES = [
  { value: "onboarding", label: "Vendor onboarding" },
  { value: "rejection", label: "Rejection notice" },
  { value: "approval", label: "Approval message" },
  { value: "custom", label: "Custom" },
] as const;

/** Synchronous localStorage read — lazy initializer, not an effect (matches components/shared/chatbot-widget.tsx). */
function readLocalStorage(key: string): string {
  return typeof window === "undefined" ? "" : (window.localStorage.getItem(key) ?? "");
}

function AskPanel() {
  const { t } = useTranslation("admin");
  const [sessionKey, setSessionKey] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem(SESSION_STORAGE_KEY),
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Fix 4: the unsent question survives navigation — lazy-read on mount,
  // written to localStorage on every keystroke, cleared once actually sent.
  const [input, setInputState] = useState<string>(() => readLocalStorage(DRAFT_QUESTION_KEY));
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  function setInput(value: string) {
    setInputState(value);
    if (typeof window !== "undefined") window.localStorage.setItem(DRAFT_QUESTION_KEY, value);
  }

  // Fix 4: restore the conversation — an async DB fetch, so this needs an
  // effect (unlike the synchronous localStorage reads above). Inline async
  // IIFE per the repo's react-hooks/set-state-in-effect convention (see
  // activity-detail-client.tsx). Only runs once, for whatever session was
  // already in localStorage when this component first mounted.
  useEffect(() => {
    if (!sessionKey) return;
    (async () => {
      setLoadingHistory(true);
      try {
        const res = await fetch(`/api/admin-ai/session?sessionKey=${encodeURIComponent(sessionKey)}`);
        const body = (await res.json()) as { data: { messages: ChatMessage[] } | null };
        if (res.ok && body.data) setMessages(body.data.messages);
      } catch {
        // best-effort restore — an empty history just means the conversation starts fresh
      } finally {
        setLoadingHistory(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        setMessages((m) => [...m, { role: "bot", text: body.error?.message ?? t("aiAssistant.errors.unavailable", { defaultValue: "Assistant unavailable right now." }) }]);
        return;
      }
      if (body.data.sessionKey && body.data.sessionKey !== sessionKey) {
        setSessionKey(body.data.sessionKey);
        window.localStorage.setItem(SESSION_STORAGE_KEY, body.data.sessionKey);
      }
      setMessages((m) => [...m, { role: "bot", text: body.data!.answer }]);
    } catch {
      setMessages((m) => [...m, { role: "bot", text: t("aiAssistant.errors.unavailable", { defaultValue: "Assistant unavailable right now." }) }]);
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
          <h2 className="text-sm font-bold text-foreground">{t("aiAssistant.ask.title", { defaultValue: "Ask about platform metrics" })}</h2>
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto space-y-2 mb-3">
          {loadingHistory && <p className="text-xs text-muted-foreground">{t("aiAssistant.ask.restoring", { defaultValue: "Restoring conversation…" })}</p>}
          {!loadingHistory && messages.length === 0 && (
            <p className="text-xs text-muted-foreground">
              {t("aiAssistant.ask.empty", { defaultValue: "e.g. “How many recommendations are pending this week?” or “Show me withdrawals over 500”. Answers only come from registered aggregate queries — never raw customer data." })}
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
            placeholder={t("aiAssistant.ask.placeholder", { defaultValue: "Ask a question…" })}
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

const DRAFT_TYPE_KEY = "mw_admin_ai_draft_type";
const DRAFT_CONTEXT_KEY = "mw_admin_ai_draft_context";
const DRAFT_OUTPUT_KEY = "mw_admin_ai_draft_output";

function DraftPanel() {
  const { t } = useTranslation("admin");
  // Fix 4: all three fields (the type picker, the unsent context, and the
  // last generated draft) survive navigation — same lazy-read /
  // write-on-change pattern as AskPanel's question input.
  const [type, setTypeState] = useState<(typeof DRAFT_TYPES)[number]["value"]>(
    () => (readLocalStorage(DRAFT_TYPE_KEY) || "onboarding") as (typeof DRAFT_TYPES)[number]["value"],
  );
  const [context, setContextState] = useState<string>(() => readLocalStorage(DRAFT_CONTEXT_KEY));
  const [draft, setDraftState] = useState<string>(() => readLocalStorage(DRAFT_OUTPUT_KEY));
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setType(value: (typeof DRAFT_TYPES)[number]["value"]) {
    setTypeState(value);
    if (typeof window !== "undefined") window.localStorage.setItem(DRAFT_TYPE_KEY, value);
  }
  function setContext(value: string) {
    setContextState(value);
    if (typeof window !== "undefined") window.localStorage.setItem(DRAFT_CONTEXT_KEY, value);
  }
  function setDraft(value: string) {
    setDraftState(value);
    if (typeof window !== "undefined") window.localStorage.setItem(DRAFT_OUTPUT_KEY, value);
  }

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
        setError(body.error?.message ?? t("aiAssistant.errors.unavailable", { defaultValue: "Assistant unavailable right now." }));
        return;
      }
      setDraft(body.data.draft);
    } catch {
      setError(t("aiAssistant.errors.unavailable", { defaultValue: "Assistant unavailable right now." }));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-primary" />
          <h2 className="text-sm font-bold text-foreground">{t("aiAssistant.draft.title", { defaultValue: "Draft a staff message" })}</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("aiAssistant.draft.description", { defaultValue: "You supply the specifics — the assistant never fetches vendor or customer data itself. Edit and send manually; nothing is sent for you." })}
        </p>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
          className="h-9 w-full rounded-lg border border-border bg-background px-3 text-sm text-foreground"
        >
          {DRAFT_TYPES.map((draftType) => (
            <option key={draftType.value} value={draftType.value}>{t(`aiAssistant.draft.types.${draftType.value}`, { defaultValue: draftType.label })}</option>
          ))}
        </select>
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder={t("aiAssistant.draft.contextPlaceholder", { defaultValue: "e.g. Vendor: Sunset Kayak Tours. Photos submitted were blurry, cannot verify listing quality." })}
          rows={3}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
        />
        <Button size="sm" onClick={generate} disabled={generating || !context.trim()}>
          {generating ? t("aiAssistant.draft.drafting", { defaultValue: "Drafting…" }) : t("aiAssistant.draft.generate", { defaultValue: "Generate draft" })}
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
  const { t } = useTranslation("admin");

  if (currentUser && currentUser.role !== "super_admin") {
    return (
      <div className="min-h-full bg-background px-4 py-6 sm:px-6 sm:py-8 xl:px-8">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield size={16} /> {t("aiAssistant.restricted", { defaultValue: "The AI assistant is limited to super admins." })}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-background px-4 py-6 sm:px-6 sm:py-8 xl:px-8 space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.04em] text-foreground sm:text-4xl">{t("aiAssistant.title", { defaultValue: "AI Assistant" })}</h1>
        <p className="text-sm text-muted-foreground">
          {t("aiAssistant.description", { defaultValue: "Platform analytics and staff message drafting. Never sees raw customer records — metrics come from a fixed set of registered aggregate queries, and drafts use only what you type in." })}
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <AskPanel />
        <DraftPanel />
      </div>
      <StaffConductPanel />
    </div>
  );
}
