"use client";

import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, BellOff, Check, CheckCheck, FileText, Flag, Languages, MessageCircle, Mic, MicOff, Paperclip, Reply, Send, Tag, X } from "lucide-react";
import { formatChatTimestamp, truncateChatMessage } from "@/lib/customer/chat-view";
import type { ChatMessage } from "@/backend/core/types";
import AiWritingAssistant from "@/components/vendor/ai-writing-assistant";
import { useSpeechInput, resolveRecognitionLang, type SpeechInputErrorKind } from "@/hooks/use-speech-input";

// CLAUDE-CAMPAIGN-CLEARING-TRANSLATE.md Feature 3 — matches lib/chatbot/language.ts's
// vocabulary (kept as a literal union here, not imported, to avoid pulling a
// chatbot-module type into this file for one string type).
type TranslateTarget = "en" | "bm" | "zh";

interface TranslationState {
  text: string;
  loading: boolean;
  error: boolean;
}

// CLAUDE-VOICE-INPUT.md Part 3. Same friendly copy as the chatbot widget's
// mic button (components/shared/chatbot-widget.tsx) — kept as a small local
// const rather than a shared export, since it's just four short strings.
const SPEECH_ERROR_TEXT: Record<SpeechInputErrorKind, string> = {
  "permission-denied": "Microphone access needed",
  "no-speech": "Didn't catch that — try again",
  network: "Voice input needs a connection",
  unknown: "Voice input isn't available right now",
};

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const REPORT_REASONS = [
  "scam",
  "abuse",
  "spam",
  "other",
] as const;

interface ChatThreadPanelProps {
  threadId: string;
  messages: ChatMessage[];
  currentUserId: string;
  /** Who the viewer is talking to — a vendor/outlet for a customer, a traveller for a vendor. */
  counterpart: { name: string; subtitle?: string; badge?: string; online?: boolean };
  /** Persists the message (RLS insert for customers, service-role API for vendors). */
  onSend?: (text: string, replyToId?: string) => Promise<ChatMessage>;
  onMessageSent?: (message: ChatMessage) => void;
  /** Present only where chat is its own route (customer); vendor's inbox is a single page, no back link. */
  backHref?: string;
  /** Ids of my messages the counterpart has already read — renders the blue ✓✓ receipt. */
  readByOthers?: Set<string>;
  /** Ids of my messages the counterpart's client has received — renders the grey ✓✓ receipt. */
  deliveredByOthers?: Set<string>;
  aiReply?: { draft: string | null; busy: boolean; error: string | null; onGenerate: () => void; onDiscard: () => void };
  /** Admin moderation view: hides the composer and report action. */
  readOnly?: boolean;
  /** CLAUDE-SUPPORT-MUTE-REPORT.md Feature 2 — current user's own mute state for this thread. Omit both to hide the toggle entirely (e.g. readOnly admin view). */
  isMuted?: boolean;
  onToggleMute?: () => void;
}

export function ChatThreadPanel({
  threadId,
  messages,
  currentUserId,
  counterpart,
  onSend,
  onMessageSent,
  backHref,
  readByOthers,
  deliveredByOthers,
  aiReply,
  readOnly = false,
  isMuted,
  onToggleMute,
}: ChatThreadPanelProps) {
  const { t } = useTranslation("customer");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState<(typeof REPORT_REASONS)[number]>(REPORT_REASONS[0]);
  const [reportDetails, setReportDetails] = useState("");
  const [reportState, setReportState] = useState<"idle" | "sending" | "sent">("idle");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Feature 3: per-message translation cache (client-side, this session
  // only — the server already caches by messageId+targetLang, so a remount
  // just re-fetches once from that cache, no LLM call). One shared target
  // language per viewer, derived from their browser locale.
  const [translations, setTranslations] = useState<Record<string, TranslationState>>({});
  const [showTranslated, setShowTranslated] = useState<Record<string, boolean>>({});
  const targetLang = useMemo<TranslateTarget>(() => {
    if (typeof navigator === "undefined") return "en";
    const locale = navigator.language.toLowerCase();
    if (locale.startsWith("ms")) return "bm";
    if (locale.startsWith("zh")) return "zh";
    return "en";
  }, []);

  // CLAUDE-VOICE-INPUT.md Part 3: same shared hook as the chatbot widget
  // (Part 2), reusing the browser-locale signal Feature 3 already computes
  // above — no separate language detection. onTranscriptChange populates
  // the composer directly (the idiomatic non-effect pattern — see the
  // hook's own doc comment), never auto-sends.
  const speech = useSpeechInput({ lang: resolveRecognitionLang(targetLang), onTranscriptChange: setText });

  async function toggleTranslate(message: ChatMessage) {
    if (showTranslated[message.id]) {
      setShowTranslated((s) => ({ ...s, [message.id]: false }));
      return;
    }
    if (translations[message.id]?.text) {
      setShowTranslated((s) => ({ ...s, [message.id]: true }));
      return;
    }
    setTranslations((t) => ({ ...t, [message.id]: { text: "", loading: true, error: false } }));
    try {
      const response = await fetch("/api/chat/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message.id, targetLang }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.data) throw new Error("translate failed");
      setTranslations((t) => ({ ...t, [message.id]: { text: payload.data.translatedText, loading: false, error: false } }));
      setShowTranslated((s) => ({ ...s, [message.id]: true }));
    } catch {
      setTranslations((t) => ({ ...t, [message.id]: { text: "", loading: false, error: true } }));
    }
  }

  const messagesById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!pendingFile) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingPreviewUrl(null);
      return;
    }
    const extension = pendingFile.name.split(".").pop()?.toLowerCase() ?? "";
    if (!IMAGE_EXTENSIONS.has(extension)) {
      setPendingPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPendingPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  useEffect(() => {
    const missing = messages.filter((m) => m.attachmentUrl && !signedUrls[m.id]);
    if (missing.length === 0) return;
    let cancelled = false;
    Promise.all(missing.map(async (m) => {
      const response = await fetch(`/api/chat/${threadId}/attachments?path=${encodeURIComponent(m.attachmentUrl!)}`);
      const payload = await response.json().catch(() => ({}));
      return response.ok ? [m.id, payload.data?.signedUrl as string] as const : null;
    })).then((results) => {
      if (cancelled) return;
      const resolved = results.filter((r): r is readonly [string, string] => r !== null && !!r[1]);
      if (resolved.length === 0) return;
      setSignedUrls((previous) => ({ ...previous, ...Object.fromEntries(resolved) }));
    });
    return () => {
      cancelled = true;
    };
  }, [messages, signedUrls, threadId]);

  async function send() {
    if (sending || uploading) return;
    const messageText = text.trim();

    if (pendingFile) {
      await sendAttachment(pendingFile, messageText);
      return;
    }

    if (!messageText || !onSend) return;
    setSending(true);
    setError(null);
    try {
      const message = await onSend(messageText, replyingTo?.id);
      setText("");
      setReplyingTo(null);
      onMessageSent?.(message);
    } catch {
      setError(t("strictMigration.chat.sendFailedRetry"));
    } finally {
      setSending(false);
    }
  }

  async function sendAttachment(file: File, caption: string) {
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (caption) formData.append("caption", caption);
      if (replyingTo) formData.append("replyToId", replyingTo.id);
      const response = await fetch(`/api/chat/${threadId}/attachments`, { method: "POST", body: formData });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(t("strictMigration.chat.attachmentFailed"));
      const { signedUrl, ...message } = payload.data as ChatMessage & { signedUrl: string | null };
      if (signedUrl) setSignedUrls((previous) => ({ ...previous, [message.id]: signedUrl }));
      onMessageSent?.(message);
      setText("");
      setPendingFile(null);
      setReplyingTo(null);
    } catch {
      setError(t("strictMigration.chat.attachmentFailed"));
    } finally {
      setUploading(false);
    }
  }

  async function handleReport() {
    if (reportState === "sending") return;
    setReportState("sending");
    try {
      const response = await fetch(`/api/chat/${threadId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reportReason, details: reportDetails }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(t("strictMigration.chat.reportFailed"));
      setReportState("sent");
    } catch {
      setReportState("idle");
      setError(t("strictMigration.chat.reportFailed"));
    }
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploading) return;
    setError(null);
    setPendingFile(file);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void send();
    }
  }

  const counterpartInitial = counterpart.name.trim().slice(0, 1).toUpperCase() || "?";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      {!readOnly && (
      <header className="border-b border-border px-5 py-4 sm:px-7">
        <div className="flex items-center gap-3">
          {backHref && (
            <Link
              href={backHref}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:hidden"
              aria-label={t("actions.back", { ns: "common" })}
            >
              <ArrowLeft size={17} />
            </Link>
          )}
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-sm font-bold text-white shadow-sm">
            {counterpartInitial}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-base font-bold text-foreground">{counterpart.name}</h2>
              {isMuted && (
                <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[0.625rem] font-semibold text-muted-foreground" title={t("strictMigration.chat.mutedTitle")}>
                  <BellOff size={10} /> {t("strictMigration.chat.muted")}
                </span>
              )}
              {counterpart.badge && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                  {counterpart.badge}
                </span>
              )}
            </div>
            {counterpart.online !== undefined ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className={`h-1.5 w-1.5 rounded-full ${counterpart.online ? "bg-emerald-500" : "bg-gray-300"}`} />
                {t(counterpart.online ? "strictMigration.chat.online" : "strictMigration.chat.offline")}
                {counterpart.subtitle && ` · ${counterpart.subtitle}`}
              </p>
            ) : counterpart.subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{counterpart.subtitle}</p>}
          </div>
          {onToggleMute && (
            <button
              type="button"
              onClick={onToggleMute}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label={t(isMuted ? "strictMigration.chat.unmuteConversation" : "strictMigration.chat.muteConversation")}
              title={t(isMuted ? "strictMigration.chat.unmute" : "strictMigration.chat.muteNotifications")}
            >
              {isMuted ? <BellOff size={15} /> : <Bell size={15} />}
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setReportOpen((open) => !open)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
              aria-label={t("strictMigration.chat.reportConversation")}
            >
              <Flag size={15} />
            </button>
            {reportOpen && (
              <div className="absolute right-0 top-11 z-10 w-64 rounded-2xl border border-border bg-card p-4 shadow-lg">
                {reportState === "sent" ? (
                  <p className="text-sm font-medium text-foreground">{t("ui.chat.reportSubmitted")}</p>
                ) : (
                  <>
                    <p className="mb-2 text-sm font-semibold text-foreground">{t("ui.chat.reportConversation")}</p>
                    <select
                      value={reportReason}
                      onChange={(event) => setReportReason(event.target.value as (typeof REPORT_REASONS)[number])}
                      className="mb-2 w-full rounded-xl border border-border bg-input-background px-3 py-2 text-sm"
                    >
                      {REPORT_REASONS.map((reason) => <option key={reason} value={reason}>{t(`strictMigration.chat.reportReasons.${reason}`)}</option>)}
                    </select>
                    <textarea
                      value={reportDetails}
                      onChange={(event) => setReportDetails(event.target.value)}
                      placeholder={t("strictMigration.chat.detailsOptional")}
                      rows={2}
                      className="mb-2 w-full resize-none rounded-xl border border-border bg-input-background px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleReport}
                      disabled={reportState === "sending"}
                      className="w-full rounded-xl bg-destructive px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {reportState === "sending" ? t("ui.actions.submitting") : t("ui.actions.submit")}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-7">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
              <MessageCircle size={21} />
            </div>
            <p className="text-sm font-semibold text-foreground">{t("ui.chat.startConversation")}</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
              {t("ui.chat.startConversationHint")}
            </p>
          </div>
        ) : (
          <div className="mx-auto flex max-w-2xl flex-col gap-4">
            {messages.map((message) => {
              const isMine = message.senderId === currentUserId;
              const extension = message.attachmentUrl?.split(".").pop()?.toLowerCase() ?? "";
              const isImage = IMAGE_EXTENSIONS.has(extension);
              const attachmentSrc = message.attachmentUrl ? signedUrls[message.id] : undefined;
              const quoted = message.replyToId ? messagesById.get(message.replyToId) : undefined;
              const replyButton = !readOnly && (
                <button
                  type="button"
                  onClick={() => setReplyingTo(message)}
                  className="mb-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground group-hover:opacity-100"
                  aria-label={t("strictMigration.chat.replyMessage")}
                >
                  <Reply size={14} />
                </button>
              );
              return (
                <div key={message.id} className={`group flex items-end gap-1 ${isMine ? "justify-end" : "justify-start"}`}>
                  {isMine && replyButton}
                  <div className={`max-w-[min(82%,520px)] ${isMine ? "items-end" : "items-start"} flex flex-col gap-1.5`}>
                    {message.replyToId && (
                      <div className="max-w-full truncate rounded-lg border-l-2 border-primary/40 bg-secondary px-2.5 py-1 text-xs text-muted-foreground">
                        {quoted ? truncateChatMessage(quoted.text || (quoted.attachmentUrl ? t("strictMigration.chat.attachment") : ""), 60) : t("strictMigration.chat.originalMessage")}
                      </div>
                    )}
                    {message.attachmentUrl && (
                      isImage ? (
                        attachmentSrc ? (
                          <a href={attachmentSrc} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, not an optimizable static asset */}
                            <img src={attachmentSrc} alt={t("strictMigration.chat.attachment")} className="max-h-64 rounded-2xl border border-border object-cover" />
                          </a>
                        ) : (
                          <div className="flex h-32 w-48 items-center justify-center rounded-2xl border border-border bg-secondary text-xs text-muted-foreground">
                            {t("ui.states.loading")}
                          </div>
                        )
                      ) : (
                        <a
                          href={attachmentSrc ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className={`flex items-center gap-2 rounded-2xl border border-border px-4 py-3 text-sm ${attachmentSrc ? "hover:bg-secondary" : "pointer-events-none opacity-60"}`}
                        >
                          <FileText size={16} className="text-primary" /> {t("strictMigration.chat.document")}
                        </a>
                      )
                    )}
                    {message.contextProductId ? (
                      <Link
                        href={`/customer/activity/${message.contextProductId}`}
                        className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-secondary px-3 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10"
                      >
                        <Tag size={12} /> {message.text}
                      </Link>
                    ) : message.text && (
                      <>
                        <div
                          className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                            isMine
                              ? "rounded-br-md bg-primary text-white"
                              : "rounded-bl-md border border-border bg-card text-foreground"
                          }`}
                        >
                          {showTranslated[message.id] && translations[message.id]?.text ? translations[message.id].text : message.text}
                        </div>
                        {!isMine && (
                          <div className="px-1">
                            {translations[message.id]?.loading ? (
                              <span className="text-[11px] text-muted-foreground">{t("ui.chat.translate.working")}</span>
                            ) : translations[message.id]?.error ? (
                              <span className="text-[11px] text-destructive">{t("ui.chat.translate.failed")}</span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => toggleTranslate(message)}
                                className="flex items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
                              >
                                <Languages size={11} />
                                {showTranslated[message.id] ? t("ui.chat.translate.showOriginal") : t("ui.chat.translate.action")}
                              </button>
                            )}
                          </div>
                        )}
                      </>
                    )}
                    <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                      <span>{formatChatTimestamp(message.sentAt)}</span>
                      {isMine && (readByOthers?.has(message.id) ? (
                        <CheckCheck size={13} className="text-primary" aria-label={t("strictMigration.chat.read")} />
                      ) : deliveredByOthers?.has(message.id) ? (
                        <CheckCheck size={13} aria-label={t("strictMigration.chat.delivered")} />
                      ) : (
                        <Check size={13} aria-label={t("strictMigration.chat.sent")} />
                      ))}
                    </div>
                  </div>
                  {!isMine && replyButton}
                </div>
              );
            })}
            <div ref={endRef} />
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="border-t border-border bg-background px-5 py-4 sm:px-7">
          {error && <p className="mb-2 text-xs text-destructive">{error}</p>}
          {speech.error && <p className="mb-2 text-xs text-destructive">{SPEECH_ERROR_TEXT[speech.error]}</p>}
          {replyingTo && (
            <div className="mx-auto mb-2 flex max-w-2xl items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2 text-xs">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">
                  {t("strictMigration.chat.replyingTo", { name: replyingTo.senderId === currentUserId ? t("strictMigration.chat.yourself") : counterpart.name })}
                </p>
                <p className="truncate text-muted-foreground">
                  {truncateChatMessage(replyingTo.text || (replyingTo.attachmentUrl ? t("strictMigration.chat.attachment") : ""), 80)}
                </p>
              </div>
              <button type="button" onClick={() => setReplyingTo(null)} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={t("strictMigration.chat.cancelReply")}>
                <X size={15} />
              </button>
            </div>
          )}
          {pendingFile && (
            <div className="mx-auto mb-2 flex max-w-2xl items-center gap-3 rounded-xl border border-border bg-secondary/60 px-3 py-2 text-xs">
              {pendingPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- local object URL preview, not an optimizable static asset
                <img src={pendingPreviewUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
              ) : (
                <FileText size={20} className="shrink-0 text-primary" />
              )}
              <span className="min-w-0 flex-1 truncate text-foreground">{pendingFile.name}</span>
              <button type="button" onClick={() => setPendingFile(null)} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={t("strictMigration.chat.removeAttachment")}>
                <X size={15} />
              </button>
            </div>
          )}
          {aiReply && <div className="mx-auto mb-3 max-w-2xl"><AiWritingAssistant
            compact
            label={t("strictMigration.chat.aiReplyAssistant")}
            buttonLabel={t("strictMigration.chat.suggestReply")}
            draft={aiReply.draft}
            busy={aiReply.busy}
            error={aiReply.error}
            onGenerate={aiReply.onGenerate}
            onApply={() => { if (aiReply.draft) { setText(aiReply.draft); aiReply.onDiscard(); } }}
            onDiscard={aiReply.onDiscard}
          /></div>}
          <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl items-end gap-2">
            <label className="sr-only" htmlFor="chat-message">
              {t("strictMigration.chat.messagePerson", { name: counterpart.name })}
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              onChange={handleFileSelected}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t("strictMigration.chat.attachFile")}
            >
              <Paperclip size={16} />
            </button>
            <textarea
              id="chat-message"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pendingFile ? t("strictMigration.chat.addCaption") : t("strictMigration.chat.messagePerson", { name: counterpart.name })}
              rows={1}
              className="min-h-11 min-w-0 flex-1 resize-none rounded-2xl border border-border bg-input-background px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
            />
            {speech.isSupported && (
              <button
                type="button"
                onClick={() => (speech.isListening ? speech.stop() : speech.start())}
                disabled={sending || uploading}
                aria-label={speech.isListening ? "Stop listening" : "Speak your message"}
                title={speech.isListening ? "Stop listening" : "Speak your message"}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  speech.isListening
                    ? "border-destructive bg-destructive/10 text-destructive animate-pulse"
                    : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {speech.isListening ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
            )}
            <button
              type="submit"
              disabled={sending || uploading || (!text.trim() && !pendingFile)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={t("ui.actions.send")}
            >
              <Send size={16} />
            </button>
          </form>
          <p className="mx-auto mt-2 max-w-2xl text-center text-[11px] text-muted-foreground">
            {t("strictMigration.chat.safetyNotice")}
          </p>
        </div>
      )}
    </div>
  );
}
