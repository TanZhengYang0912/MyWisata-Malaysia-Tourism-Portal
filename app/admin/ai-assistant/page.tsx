"use client";

// P4 — Member 4: Admin AI assistant. CLAUDE-ADMIN-AI.md Part 2.
// Capability 1 (ask) reuses the customer chatbot widget's interaction shape
// (message bubbles, input + send) as a full panel rather than a floating
// bubble — admin analytics answers read better with room, and this page
// sits inside the admin shell already. Capability 3 (AI review) lives on
// the recommendations screen itself, not here.
//
// Capability 2 (a generic "draft a staff message" panel) was removed
// 2026-08-21 — since built, that drafting need has been mounted directly
// into its own real flows instead (lib/vendors/approval-draft.ts on the
// vendor approval/rejection screen, lib/recommendations/invite-draft.ts on
// the recommendation invite flow), each with real context already loaded
// rather than an admin re-typing it into a generic textarea here. See git
// history for the removed DraftPanel component, POST /api/admin-ai/draft,
// and lib/admin-ai/draft.ts if this generic version is ever needed again.

import { useEffect, useRef, useState } from "react";
import { Bot, Send, Shield } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "react-i18next";
import { adminFilterControlClassName } from "@/components/admin/filter-bar";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";

interface ChatMessage {
  role: "user" | "bot";
  text: string;
}

const SESSION_STORAGE_KEY = "mw_admin_ai_session";
const DRAFT_QUESTION_KEY = "mw_admin_ai_draft_question";

/** Synchronous localStorage read — lazy initializer, not an effect (matches components/shared/chatbot-widget.tsx). */
function readLocalStorage(key: string): string {
  return typeof window === "undefined" ? "" : (window.localStorage.getItem(key) ?? "");
}

export function AdminAiMessage({ role, text }: ChatMessage) {
  return (
    <div data-message-role={role} className={`flex w-full ${role === "user" ? "justify-end" : "justify-start"}`}>
      <div className={`w-fit max-w-[85%] break-words rounded-xl px-3 py-2 text-sm whitespace-pre-wrap lg:max-w-3xl ${role === "user" ? "bg-primary text-white" : "bg-background text-foreground shadow-sm"}`}>
        {text}
      </div>
    </div>
  );
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
        setMessages((m) => [...m, { role: "bot", text: body.error?.message ?? t("aiAssistant.errors.unavailable") }]);
        return;
      }
      if (body.data.sessionKey && body.data.sessionKey !== sessionKey) {
        setSessionKey(body.data.sessionKey);
        window.localStorage.setItem(SESSION_STORAGE_KEY, body.data.sessionKey);
      }
      setMessages((m) => [...m, { role: "bot", text: body.data!.answer }]);
    } catch {
      setMessages((m) => [...m, { role: "bot", text: t("aiAssistant.errors.unavailable") }]);
    } finally {
      setSending(false);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" }));
    }
  }

  return (
    <Card className="w-full overflow-hidden border-border/80 shadow-[0_12px_32px_rgba(1,0,102,0.06)]">
      <CardContent className="flex min-h-[480px] flex-col p-0" style={{ height: "min(800px, calc(100vh - 18rem + 160px))" }}>
        <div className="flex items-center gap-2 border-b border-border bg-card px-5 py-4">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Bot size={16} />
          </span>
          <h2 className="text-sm font-bold text-foreground">{t("aiAssistant.ask.title")}</h2>
        </div>
        <div ref={listRef} className="flex-1 overflow-y-auto bg-muted/20 px-5 py-5">
          <div className="w-full space-y-2">
            {loadingHistory && <p className="mx-auto w-full max-w-3xl text-xs text-muted-foreground">{t("aiAssistant.ask.restoring")}</p>}
            {!loadingHistory && messages.length === 0 && (
              <p className="mx-auto w-full max-w-3xl rounded-xl border border-dashed border-border bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                {t("aiAssistant.ask.empty")}
              </p>
            )}
            {messages.map((m, i) => (
              <AdminAiMessage key={i} role={m.role} text={m.text} />
            ))}
          </div>
        </div>
        <div className="border-t border-border bg-card px-5 py-4">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder={t("aiAssistant.ask.placeholder")}
              className={`${adminFilterControlClassName} flex-1`}
              disabled={sending}
            />
            <Button size="icon" className="h-9 w-9 shrink-0 rounded-full" onClick={send} disabled={sending || !input.trim()}>
              <Send size={14} />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminAiAssistantPage() {
  const { currentUser } = useAuth();
  const { t } = useTranslation("admin");

  if (currentUser && currentUser.role !== "super_admin") {
    return (
      <AdminPageShell>
        <AdminPageHeader title={t("aiAssistant.title")} />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Shield size={16} /> {t("aiAssistant.restricted")}
        </div>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell>
      <AdminPageHeader eyebrow={<span className="flex items-center gap-2"><Bot size={14} /> {t("aiAssistant.title")}</span>} title={t("aiAssistant.title")} description={t("aiAssistant.description")} />
      <AskPanel />
    </AdminPageShell>
  );
}
