"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bell, BellOff, Check, CheckCheck, FileText, Flag, MessageCircle, Paperclip, Reply, Send, Tag, X } from "lucide-react";
import { formatChatTimestamp, truncateChatMessage } from "@/lib/customer/chat-view";
import type { ChatMessage } from "@/backend/core/types";
import AiWritingAssistant from "@/components/vendor/ai-writing-assistant";

const IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const REPORT_REASONS = [
  { value: "scam", label: "Scam" },
  { value: "abuse", label: "Abuse" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Other" },
];

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
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0].value);
  const [reportDetails, setReportDetails] = useState("");
  const [reportState, setReportState] = useState<"idle" | "sending" | "sent">("idle");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreviewUrl, setPendingPreviewUrl] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const messagesById = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    if (!pendingFile) {
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
      setError("We couldn't send that message. Please try again.");
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
      if (!response.ok) throw new Error(payload.error?.message || "Upload failed");
      const { signedUrl, ...message } = payload.data as ChatMessage & { signedUrl: string | null };
      if (signedUrl) setSignedUrls((previous) => ({ ...previous, [message.id]: signedUrl }));
      onMessageSent?.(message);
      setText("");
      setPendingFile(null);
      setReplyingTo(null);
    } catch {
      setError("We couldn't send that attachment. Please try again.");
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
      if (!response.ok) throw new Error(payload.error?.message || "Report failed");
      setReportState("sent");
    } catch (err) {
      setReportState("idle");
      setError(err instanceof Error && err.message !== "Report failed" ? err.message : "We couldn't submit that report. Please try again.");
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
              aria-label="Back to conversations"
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
                <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[0.625rem] font-semibold text-muted-foreground" title="Notifications muted for you">
                  <BellOff size={10} /> Muted
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
                {counterpart.online ? "Online" : "Offline"}
                {counterpart.subtitle && ` · ${counterpart.subtitle}`}
              </p>
            ) : counterpart.subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{counterpart.subtitle}</p>}
          </div>
          {onToggleMute && (
            <button
              type="button"
              onClick={onToggleMute}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              aria-label={isMuted ? "Unmute conversation" : "Mute conversation"}
              title={isMuted ? "Unmute" : "Mute notifications"}
            >
              {isMuted ? <BellOff size={15} /> : <Bell size={15} />}
            </button>
          )}
          <div className="relative">
            <button
              type="button"
              onClick={() => setReportOpen((open) => !open)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
              aria-label="Report conversation"
            >
              <Flag size={15} />
            </button>
            {reportOpen && (
              <div className="absolute right-0 top-11 z-10 w-64 rounded-2xl border border-border bg-card p-4 shadow-lg">
                {reportState === "sent" ? (
                  <p className="text-sm font-medium text-foreground">Report submitted. Thank you.</p>
                ) : (
                  <>
                    <p className="mb-2 text-sm font-semibold text-foreground">Report this conversation</p>
                    <select
                      value={reportReason}
                      onChange={(event) => setReportReason(event.target.value)}
                      className="mb-2 w-full rounded-xl border border-border bg-input-background px-3 py-2 text-sm"
                    >
                      {REPORT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                    <textarea
                      value={reportDetails}
                      onChange={(event) => setReportDetails(event.target.value)}
                      placeholder="Details (optional)"
                      rows={2}
                      className="mb-2 w-full resize-none rounded-xl border border-border bg-input-background px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      onClick={handleReport}
                      disabled={reportState === "sending"}
                      className="w-full rounded-xl bg-destructive px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {reportState === "sending" ? "Submitting…" : "Submit report"}
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
            <p className="text-sm font-semibold text-foreground">Start the conversation</p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-muted-foreground">
              Ask about availability, accessibility, or anything you need for your trip.
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
                  aria-label="Reply to this message"
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
                        {quoted ? truncateChatMessage(quoted.text || (quoted.attachmentUrl ? "Attachment" : ""), 60) : "Original message"}
                      </div>
                    )}
                    {message.attachmentUrl && (
                      isImage ? (
                        attachmentSrc ? (
                          <a href={attachmentSrc} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element -- signed URL, not an optimizable static asset */}
                            <img src={attachmentSrc} alt="Attachment" className="max-h-64 rounded-2xl border border-border object-cover" />
                          </a>
                        ) : (
                          <div className="flex h-32 w-48 items-center justify-center rounded-2xl border border-border bg-secondary text-xs text-muted-foreground">
                            Loading…
                          </div>
                        )
                      ) : (
                        <a
                          href={attachmentSrc ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className={`flex items-center gap-2 rounded-2xl border border-border px-4 py-3 text-sm ${attachmentSrc ? "hover:bg-secondary" : "pointer-events-none opacity-60"}`}
                        >
                          <FileText size={16} className="text-primary" /> Document
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
                      <div
                        className={`rounded-2xl px-4 py-3 text-sm leading-6 shadow-sm ${
                          isMine
                            ? "rounded-br-md bg-primary text-white"
                            : "rounded-bl-md border border-border bg-card text-foreground"
                        }`}
                      >
                        {message.text}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
                      <span>{formatChatTimestamp(message.sentAt)}</span>
                      {isMine && (readByOthers?.has(message.id) ? (
                        <CheckCheck size={13} className="text-primary" aria-label="Read" />
                      ) : deliveredByOthers?.has(message.id) ? (
                        <CheckCheck size={13} aria-label="Delivered" />
                      ) : (
                        <Check size={13} aria-label="Sent" />
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
          {replyingTo && (
            <div className="mx-auto mb-2 flex max-w-2xl items-center justify-between gap-2 rounded-xl bg-secondary px-3 py-2 text-xs">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">
                  Replying to {replyingTo.senderId === currentUserId ? "yourself" : counterpart.name}
                </p>
                <p className="truncate text-muted-foreground">
                  {truncateChatMessage(replyingTo.text || (replyingTo.attachmentUrl ? "Attachment" : ""), 80)}
                </p>
              </div>
              <button type="button" onClick={() => setReplyingTo(null)} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Cancel reply">
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
              <button type="button" onClick={() => setPendingFile(null)} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label="Remove attachment">
                <X size={15} />
              </button>
            </div>
          )}
          {aiReply && <div className="mx-auto mb-3 max-w-2xl"><AiWritingAssistant
            compact
            label="AI reply assistant"
            buttonLabel="Suggest reply"
            draft={aiReply.draft}
            busy={aiReply.busy}
            error={aiReply.error}
            onGenerate={aiReply.onGenerate}
            onApply={() => { if (aiReply.draft) { setText(aiReply.draft); aiReply.onDiscard(); } }}
            onDiscard={aiReply.onDiscard}
          /></div>}
          <form onSubmit={handleSubmit} className="mx-auto flex max-w-2xl items-end gap-2">
            <label className="sr-only" htmlFor="chat-message">
              Message {counterpart.name}
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
              aria-label="Attach a file"
            >
              <Paperclip size={16} />
            </button>
            <textarea
              id="chat-message"
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={pendingFile ? "Add a caption…" : `Message ${counterpart.name}…`}
              rows={1}
              className="min-h-11 flex-1 resize-none rounded-2xl border border-border bg-input-background px-4 py-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
            />
            <button
              type="submit"
              disabled={sending || uploading || (!text.trim() && !pendingFile)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Send message"
            >
              <Send size={16} />
            </button>
          </form>
          <p className="mx-auto mt-2 max-w-2xl text-center text-[11px] text-muted-foreground">
            Phone numbers, contact details and links are hidden to keep you safe on MyWisata.
          </p>
        </div>
      )}
    </div>
  );
}
