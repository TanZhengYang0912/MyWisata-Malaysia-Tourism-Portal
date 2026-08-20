"use client";

// P4 — Member 4: FAQ chatbot widget. See CLAUDE.md Step 7.
//
// CLAUDE-CHATBOT-FEEDBACK.md: escalation is now customer-controlled, not
// automatic. Every bot reply carries its own small feedback state machine:
//   answered   -> "Was this helpful?" (Yes collapses to thanks, No -> ticket offer)
//   unanswered -> straight to the ticket offer (no helpfulness question —
//                 the bot already said it didn't know)
//   ticket offer -> Yes creates a ticket via the existing endpoint, No dismisses
// Nothing here ever calls POST /api/support/tickets except the ticket
// offer's own "Yes" — there is no automatic escalation path left.
//
// CLAUDE-FIXES.md Fix 2: "close the loop" — escalation used to tell the
// user nothing beyond "a ticket has been created." Still true here: the
// ticket_created stage names the ticket and links to My Tickets.
//
// CLAUDE-P4-EXTRAS.md Extra 1 (trilingual): every bot message carries the
// answer language returned by /api/chatbot/ask as metadata. That
// ChatLanguage value remains independent from the UI locale: answer text is
// rendered exactly as returned, while this widget's fixed chrome follows the
// app translation runtime.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { MessageCircle, Send, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { ChatLanguage } from "@/lib/chatbot/language";
import { useSupportChat } from "@/components/providers/support-chat";

type FeedbackStage =
  | "awaiting_helpful" // Flow 1: bot answered, ask "was this helpful?"
  | "helpful_done" // collapsed after Yes
  | "awaiting_ticket" // Flow 2 (bot couldn't answer) or Flow 1's "No" — offer a ticket
  | "ticket_created" // collapsed after the ticket offer's Yes succeeds
  | "ticket_declined"; // collapsed after the ticket offer's No

interface ChatMessage {
  role: "user" | "bot";
  text: string;
  /** Bot messages only — ties this reply to its chatbot_feedback row. */
  messageId?: string;
  /** Bot messages only — the user's question this reply answers, used as the ticket subject/body if one gets opened. */
  question?: string;
  /** Bot messages only — answer language returned by the chatbot API. */
  language?: ChatLanguage;
  feedbackStage?: FeedbackStage;
  ticketId?: string;
  ticketError?: string;
}

type ChatbotAnswerData = Pick<ChatMessage, "text" | "messageId" | "language"> & {
  botAnswered: boolean;
};

export function createBotMessage(data: ChatbotAnswerData, question: string): ChatMessage {
  return {
    role: "bot",
    text: data.text,
    messageId: data.messageId,
    question,
    language: data.language,
    feedbackStage: data.botAnswered ? "awaiting_helpful" : "awaiting_ticket",
  };
}

export function resolveTicketSubject(question: string | undefined, fallback: string): string {
  return question ?? fallback;
}

const SESSION_STORAGE_KEY = "mw_chatbot_session";

async function postFeedback(payload: Record<string, unknown>) {
  try {
    await fetch("/api/chatbot/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // best-effort — a logging failure must never visibly break the chat flow
  }
}

export function ChatbotWidget() {
  // Lifted to context (CLAUDE-SUPPORT-MUTE-REPORT.md Feature 1) so other
  // entry points — e.g. the profile page's "Contact Support" button — can
  // open this same widget instance instead of building a second chat surface.
  const { open, setOpen } = useSupportChat();
  const { t } = useTranslation("common");
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
  const [creatingTicketFor, setCreatingTicketFor] = useState<string | null>(null);
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

    try {
      const res = await fetch("/api/chatbot/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionKey: sessionKey ?? undefined, question }),
      });
      const body = (await res.json()) as {
        data: { sessionKey: string; answer: string; botAnswered: boolean; messageId: string; language: ChatLanguage } | null;
        error: { message: string } | null;
      };
      if (!res.ok || !body.data) {
        setMessages((m) => [...m, { role: "bot", text: t("chatbot.somethingWrong") }]);
        return;
      }
      const { answer, botAnswered, messageId, language } = body.data;
      let effectiveSessionKey = sessionKey;
      if (body.data.sessionKey && body.data.sessionKey !== sessionKey) {
        effectiveSessionKey = body.data.sessionKey;
        setSessionKey(body.data.sessionKey);
        window.localStorage.setItem(SESSION_STORAGE_KEY, body.data.sessionKey);
      }

      setMessages((m) => [...m, createBotMessage({ text: answer, messageId, language, botAnswered }, question)]);

      // Flow 2: the bot already knows it didn't help — there's no yes/no
      // helpfulness question to ask, so this is recorded automatically
      // rather than waiting on a click that will never come. helpful stays
      // null (not false): null means "never asked", which is what actually
      // happened here — the couldn't-answer signal is bot_answered=false
      // on its own, distinct from a real thumbs-down on a real answer.
      if (!botAnswered) {
        postFeedback({ sessionKey: effectiveSessionKey ?? undefined, messageId, question, botAnswered: false, helpful: null });
      }
    } catch {
      setMessages((m) => [...m, { role: "bot", text: t("chatbot.somethingWrong") }]);
    } finally {
      setSending(false);
    }
  }

  function submitHelpful(index: number, helpful: boolean) {
    const msg = messages[index];
    if (!msg.messageId) return;
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, feedbackStage: helpful ? "helpful_done" : "awaiting_ticket" } : m)));
    postFeedback({ sessionKey: sessionKey ?? undefined, messageId: msg.messageId, question: msg.question, botAnswered: true, helpful });
  }

  function declineTicket(index: number) {
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, feedbackStage: "ticket_declined" } : m)));
  }

  async function createTicket(index: number) {
    const msg = messages[index];
    if (!msg.messageId || creatingTicketFor) return;
    setCreatingTicketFor(msg.messageId);
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, ticketError: undefined } : m)));

    try {
      const subject = resolveTicketSubject(msg.question, t("chatbot.supportRequest"));
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionKey: sessionKey ?? undefined, subject, body: subject }),
      });
      const result = (await res.json()) as { data: { id: string; category: string } | null };
      const ticketErrorText = t("chatbot.ticketError");
      if (res.ok && result.data) {
        setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, feedbackStage: "ticket_created", ticketId: result.data!.id } : m)));
        postFeedback({ sessionKey: sessionKey ?? undefined, messageId: msg.messageId, openedTicket: true });
      } else {
        setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, ticketError: ticketErrorText } : m)));
      }
    } catch {
      setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, ticketError: t("chatbot.ticketError") } : m)));
    } finally {
      setCreatingTicketFor(null);
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
            <span className="text-sm font-semibold">{t("chatbot.title")}</span>
            <div className="flex items-center gap-3">
              <Link href="/customer/support" className="text-[0.6875rem] underline opacity-90 hover:opacity-100">
                {t("chatbot.myTickets")}
              </Link>
              <button onClick={() => setOpen(false)} aria-label={t("chatbot.closeChat")}>
                <X size={16} />
              </button>
            </div>
          </div>

          <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
            {messages.length === 0 && (
              <p className="text-xs text-muted-foreground text-center mt-8">
                {t("chatbot.emptyPrompt")}
              </p>
            )}
            {messages.map((m, i) => {
              return (
              <div key={i}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-primary text-white" : "bg-muted text-foreground"}`}
                >
                  {m.text}
                </div>
                {m.role === "bot" && m.feedbackStage && (
                  <div className="mt-1.5 max-w-[85%]">
                    {m.feedbackStage === "awaiting_helpful" && (
                      <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
                        <span className="text-xs text-muted-foreground flex-1">{t("chatbot.wasThisHelpful")}</span>
                        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => submitHelpful(i, true)}>
                          {t("chatbot.yes")}
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => submitHelpful(i, false)}>
                          {t("chatbot.no")}
                        </Button>
                      </div>
                    )}
                    {m.feedbackStage === "helpful_done" && <p className="text-xs text-muted-foreground px-1">{t("chatbot.gladToHelp")}</p>}
                    {m.feedbackStage === "awaiting_ticket" && (
                      <div className="rounded-lg border border-border bg-background px-2.5 py-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground flex-1">{t("chatbot.wantTicket")}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs"
                            onClick={() => createTicket(i)}
                            disabled={creatingTicketFor === m.messageId}
                          >
                            {creatingTicketFor === m.messageId ? t("chatbot.creatingTicket") : t("chatbot.yes")}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs"
                            onClick={() => declineTicket(i)}
                            disabled={creatingTicketFor === m.messageId}
                          >
                            {t("chatbot.no")}
                          </Button>
                        </div>
                        {m.ticketError && <p className="text-[0.6875rem] text-destructive mt-1">{m.ticketError}</p>}
                      </div>
                    )}
                    {m.feedbackStage === "ticket_declined" && <p className="text-xs text-muted-foreground px-1">{t("chatbot.noProblem")}</p>}
                    {m.feedbackStage === "ticket_created" && (
                      <div className="px-1">
                        <p className="text-xs text-muted-foreground">
                          {t("strictMigration.chatbotTicketCreated", { id: m.ticketId?.slice(0, 8).toUpperCase() })}
                        </p>
                        <Link href={`/customer/support/${m.ticketId}`} className="text-xs text-primary underline">
                          {t("chatbot.viewMyTickets")}
                        </Link>
                      </div>
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 px-3 py-3 border-t border-border">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendMessage();
              }}
              placeholder={t("chatbot.inputPlaceholder")}
              className="flex-1 h-9 rounded-full border border-border px-3 text-sm bg-background text-foreground"
              disabled={sending}
            />
            <Button size="icon" className="h-9 w-9 rounded-full shrink-0" onClick={sendMessage} aria-label={t("chatbot.send")} disabled={sending || !input.trim()}>
              <Send size={14} aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}

      <Button size="icon" className="h-14 w-14 rounded-full shadow-lg" onClick={() => setOpen((o) => !o)} title={t("chatbot.openChat")} aria-label={t("accessibility.openChat")}>
        <MessageCircle size={22} />
      </Button>
    </div>
  );
}
