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
//
// Widget merge (2026-09): what used to be a single-mode AI chat panel is now
// a Shopee-Chat-style split view — this component owns the shared chrome
// (toggle bubble, top bar, panel sizing) and the left/right pane routing;
// the AI-support conversation logic below is otherwise unchanged, just
// rendered in the right pane instead of filling the whole panel. Vendor
// threads live in the sibling components under chat-widget/.

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, HelpCircle, MessageCircle, Mic, MicOff, Send, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { FaqCategory } from "@/app/api/chatbot/faq/route";
import type { ChatLanguage } from "@/lib/chatbot/language";
import { useAuth } from "@/components/providers/auth";
import { useSupportChat } from "@/components/providers/support-chat";
import { useSpeechInput, resolveRecognitionLang, type SpeechInputErrorKind } from "@/hooks/use-speech-input";
import { ChatWidgetInbox } from "@/components/shared/chat-widget/chat-widget-inbox";
import { ChatWidgetVendorThread } from "@/components/shared/chat-widget/chat-widget-vendor-thread";

// CLAUDE-VOICE-INPUT.md Part 2. Friendly copy per error kind — never a raw
// error/exception reaching this UI (the hook itself already guarantees
// that; this is just the last-mile string).
const SPEECH_ERROR_TEXT: Record<SpeechInputErrorKind, string> = {
  "permission-denied": "Microphone access needed",
  "no-speech": "Didn't catch that — try again",
  network: "Voice input needs a connection",
  unknown: "Voice input isn't available right now",
};

// Display labels for the KB's own `category` values (the live set today:
// account, affiliate, booking, general, payment, rewards, vendor, wallet).
// Admins can add new categories from the KB editor at any time, so an
// unmapped value falls back to its own capitalised name rather than
// disappearing from the FAQ browser.
const FAQ_CATEGORY_LABEL: Record<string, string> = {
  account: "Account",
  affiliate: "Affiliate",
  booking: "Booking",
  general: "General",
  payment: "Payment",
  rewards: "Rewards",
  vendor: "Vendor",
  wallet: "Wallet",
};

function faqCategoryLabel(category: string): string {
  return FAQ_CATEGORY_LABEL[category] ?? category.charAt(0).toUpperCase() + category.slice(1);
}

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
  // entry points — the profile page's "Contact Support" button, outlet and
  // activity page "Message vendor" buttons — can open this same widget
  // instance instead of building a second chat surface.
  const { open, setOpen, selected, selectChat, unreadChatCount } = useSupportChat();
  const { currentUser } = useAuth();
  const { t } = useTranslation("common");
  const { t: tCustomer } = useTranslation("customer");
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

  // FAQ shortcuts: category chips -> question list -> tap to ask. Loaded
  // lazily the first time the panel is opened (undefined = never fetched,
  // null = fetch failed), so the widget's normal open/close costs nothing
  // extra for users who never touch it.
  const [faq, setFaq] = useState<FaqCategory[] | null | undefined>(undefined);
  const [faqOpen, setFaqOpen] = useState(false);
  const [faqCategory, setFaqCategory] = useState<string | null>(null);

  async function loadFaq() {
    try {
      const res = await fetch("/api/chatbot/faq");
      const body = (await res.json()) as { data: { categories: FaqCategory[] } | null };
      setFaq(res.ok && body.data ? body.data.categories : null);
    } catch {
      setFaq(null);
    }
  }

  function toggleFaq() {
    setFaqOpen((wasOpen) => {
      if (!wasOpen && faq === undefined) void loadFaq();
      if (wasOpen) setFaqCategory(null); // reset to the category list for next time
      return !wasOpen;
    });
  }

  useEffect(() => {
    // Also depends on `selected`: the message list div only exists in the DOM
    // while the Support pane is the one showing (conditionally rendered), so
    // switching to a vendor thread and back remounts it at scroll position 0
    // (oldest message) — this re-fires on that remount too, not just on new
    // messages, so reselecting Support always lands back at the latest one.
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, selected]);

  // CLAUDE-VOICE-INPUT.md Part 2: "current language" = the most recent bot
  // reply's detected language (the only per-conversation language signal
  // this widget already tracks — see the file header's trilingual note),
  // falling back to English before any reply has arrived.
  const currentLanguage = useMemo<ChatLanguage>(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "bot" && m.language) return m.language;
    }
    return "en";
  }, [messages]);
  // Populate the input directly from the hook's onTranscriptChange callback
  // (fires only while a real recognition result comes in) rather than a
  // useEffect watching the returned transcript value — the idiomatic fix,
  // see that option's doc comment in hooks/use-speech-input.ts. This also
  // means the user's own typed edits after stopping are never at risk of
  // being clobbered by a stray effect re-run.
  const speech = useSpeechInput({ lang: resolveRecognitionLang(currentLanguage), onTranscriptChange: setInput });

  /**
   * `explicitQuestion` is the FAQ path — an exact, curated KB question the
   * user tapped, sent as-is. The typed path (no argument) reads and clears
   * the composer as before; a FAQ tap deliberately leaves whatever the user
   * had typed untouched, since it never came from the composer.
   */
  async function sendMessage(explicitQuestion?: string) {
    const question = (explicitQuestion ?? input).trim();
    if (!question || sending) return;
    setSending(true);
    setMessages((m) => [...m, { role: "user", text: question }]);
    if (explicitQuestion === undefined) setInput("");

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
      {open ? (
        <div
          className="flex w-[640px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
          style={{ height: 460, maxHeight: "calc(100vh - 6rem)" }}
        >
          <div className="flex items-center justify-between border-b border-border bg-primary px-4 py-3 text-primary-foreground">
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

          <div className="flex min-h-0 flex-1">
            <div className={`min-h-0 ${selected ? "hidden sm:flex sm:flex-none" : "flex flex-1 sm:flex-none"}`}>
              <ChatWidgetInbox currentUserId={currentUser?.id ?? null} selected={selected} onSelect={selectChat} />
            </div>

            {selected?.kind === "vendor" && currentUser ? (
              <ChatWidgetVendorThread threadId={selected.threadId} currentUserId={currentUser.id} onBack={() => selectChat(null)} />
            ) : selected?.kind === "support" ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <button onClick={() => selectChat(null)} className="flex items-center gap-1.5 border-b border-border px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:text-foreground sm:hidden">
                  <ChevronLeft size={14} /> {t("actions.back")}
                </button>

                <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                  {messages.length === 0 && (
                    <div className="mt-8 flex flex-col items-center gap-2.5">
                      <p className="text-xs text-muted-foreground text-center">
                        {t("chatbot.emptyPrompt")}
                      </p>
                      {!faqOpen && (
                        <button
                          type="button"
                          onClick={toggleFaq}
                          className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary"
                        >
                          <HelpCircle size={13} /> {t("chatbot.faq.browse")}
                        </button>
                      )}
                    </div>
                  )}
                  {messages.map((m, i) => {
                    return (
                    <div key={i}>
                      <div
                        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted text-foreground"}`}
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

                {/* FAQ shortcuts — category chips, then that category's real KB
                    questions. Tapping a question asks it exactly as written. */}
                {faqOpen && (
                  <div className="max-h-52 overflow-y-auto border-t border-border bg-muted/40 px-3 py-2.5">
                    {faq === undefined && (
                      <p className="text-xs text-muted-foreground">{t("chatbot.faq.loading")}</p>
                    )}
                    {faq === null && (
                      <p className="text-xs text-destructive">{t("chatbot.faq.error")}</p>
                    )}
                    {faq && faq.length === 0 && (
                      <p className="text-xs text-muted-foreground">{t("chatbot.faq.empty")}</p>
                    )}
                    {faq && faq.length > 0 && faqCategory === null && (
                      <>
                        <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">
                          {t("chatbot.faq.pickCategory")}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {faq.map((c) => (
                            <button
                              key={c.category}
                              type="button"
                              onClick={() => setFaqCategory(c.category)}
                              className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-secondary"
                            >
                              {faqCategoryLabel(c.category)}
                              <span className="ml-1 text-muted-foreground">{c.questions.length}</span>
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                    {faq && faqCategory !== null && (
                      <>
                        <button
                          type="button"
                          onClick={() => setFaqCategory(null)}
                          className="mb-2 flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground transition-colors hover:text-foreground"
                        >
                          <ChevronLeft size={12} /> {faqCategoryLabel(faqCategory)}
                        </button>
                        <div className="flex flex-col gap-1">
                          {(faq.find((c) => c.category === faqCategory)?.questions ?? []).map((q) => (
                            <button
                              key={q.id}
                              type="button"
                              disabled={sending}
                              onClick={() => {
                                setFaqOpen(false);
                                setFaqCategory(null);
                                void sendMessage(q.question);
                              }}
                              className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-left text-xs text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {q.question}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}

                {speech.error && <p className="px-3 pt-1.5 text-[0.6875rem] text-destructive border-t border-border">{SPEECH_ERROR_TEXT[speech.error]}</p>}
                <div className={`flex items-center gap-2 px-3 py-3 ${speech.error ? "" : "border-t border-border"}`}>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") sendMessage();
                    }}
                    placeholder={t("chatbot.inputPlaceholder")}
                    className="flex-1 min-w-0 h-9 rounded-full border border-border px-3 text-sm bg-background text-foreground"
                    disabled={sending}
                  />
                  <button
                    type="button"
                    onClick={toggleFaq}
                    aria-label={t("chatbot.faq.toggle")}
                    aria-expanded={faqOpen}
                    title={t("chatbot.faq.toggle")}
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      faqOpen
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                    }`}
                  >
                    <HelpCircle size={15} />
                  </button>
                  {speech.isSupported && (
                    <button
                      type="button"
                      onClick={() => (speech.isListening ? speech.stop() : speech.start())}
                      disabled={sending}
                      aria-label={speech.isListening ? t("chatbot.voice.stop") : t("chatbot.voice.start")}
                      title={speech.isListening ? t("chatbot.voice.stop") : t("chatbot.voice.start")}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        speech.isListening
                          ? "border-destructive bg-destructive/10 text-destructive animate-pulse"
                          : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }`}
                    >
                      {speech.isListening ? <MicOff size={15} /> : <Mic size={15} />}
                    </button>
                  )}
                  <Button size="icon" className="h-9 w-9 rounded-full shrink-0" onClick={() => sendMessage()} aria-label={t("chatbot.send")} disabled={sending || !input.trim()}>
                    <Send size={14} aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="hidden min-h-0 flex-1 flex-col items-center justify-center px-6 text-center sm:flex">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-secondary text-primary">
                  <MessageCircle size={28} />
                </div>
                <h2 className="text-lg font-bold text-foreground">{tCustomer("strictMigration.chat.selectConversation")}</h2>
                <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">{tCustomer("strictMigration.chat.selectConversationHint")}</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <Button size="icon" className="relative h-14 w-14 rounded-full shadow-lg" onClick={() => setOpen(true)} title={t("chatbot.openChat")} aria-label={t("accessibility.openChat")}>
          <MessageCircle size={22} />
          {unreadChatCount > 0 && (
            <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-destructive px-1 text-center text-[0.5625rem] font-bold leading-4 text-white">
              {unreadChatCount > 99 ? "99+" : unreadChatCount}
            </span>
          )}
        </Button>
      )}
    </div>
  );
}
