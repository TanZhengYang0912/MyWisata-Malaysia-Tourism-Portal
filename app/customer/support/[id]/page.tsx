"use client";

// P4 — Member 4: customer ticket detail + reply thread. CLAUDE-FIXES.md Fix 2,
// bubble rendering delegated to the shared <TicketThread> per CLAUDE-FIXES-2.md item 2.

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Bell, BellOff, FileText, Mic, MicOff, Paperclip, Send, X } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { TicketThread, type ReplyMessage } from "@/components/shared/ticket-thread";
import { ReportChatButton } from "@/components/shared/report-chat-button";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { useTranslation } from "react-i18next";
import { useSpeechInput, resolveRecognitionLangFromLocale, type SpeechInputErrorKind } from "@/hooks/use-speech-input";
import { supportError, supportTicketLoadFailure } from "@/lib/support/errors";

// CLAUDE-VOICE-INPUT.md, mounted on support tickets. Same friendly copy as
// the chatbot widget's and chat-thread-panel's mic buttons — keys, not
// literals, since systemwide localization forbids untranslated UI strings.
const SPEECH_ERROR_KEY: Record<SpeechInputErrorKind, string> = {
  "permission-denied": "ui.support.voice.errors.permissionDenied",
  "no-speech": "ui.support.voice.errors.noSpeech",
  network: "ui.support.voice.errors.network",
  unknown: "ui.support.voice.errors.unknown",
};

interface TicketDetail {
  id: string;
  viewerIsOwner: boolean;
  subject: string;
  body: string;
  category: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  createdAt: string;
  resolvedAt: string | null;
  muted: boolean;
  replies: ReplyMessage[];
}

const LOCKED_STATUSES = new Set(["resolved", "closed"]);

export default function CustomerTicketDetailPage() {
  const { t: tCustomer, i18n } = useTranslation("customer");
  const { t: tCommon } = useTranslation("common");
  const { id } = useParams<{ id: string }>();
  const { currentUser } = useAuth();
  const { showFeedback } = useActionFeedback();
  const [ticket, setTicket] = useState<TicketDetail | null | undefined>(undefined);
  const [ticketLoadError, setTicketLoadError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [replyOperationId, setReplyOperationId] = useState<string | null>(null);
  const [attachmentOperationId, setAttachmentOperationId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [muting, setMuting] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speech = useSpeechInput({ lang: resolveRecognitionLangFromLocale(i18n.resolvedLanguage), onTranscriptChange: setReply });

  async function loadTicket(): Promise<TicketDetail | null> {
    try {
      const res = await fetch(`/api/support/tickets/${id}`);
      const body = (await res.json().catch(() => ({}))) as { data?: TicketDetail | null; error?: { code?: string } };
      if (!res.ok || !body.data) {
        const errorCode = body.error?.code ?? (res.ok ? "NOT_FOUND" : undefined);
        setTicketLoadError(errorCode ?? "READ_UNAVAILABLE");
        setTicket((current) => current === undefined ? null : current);
        return null;
      }
      setTicketLoadError(null);
      setTicket(body.data);
      return body.data;
    } catch {
      setTicketLoadError("READ_UNAVAILABLE");
      setTicket((current) => current === undefined ? null : current);
      return null;
    }
  }

  useEffect(() => {
    (async () => {
      const loadedTicket = await loadTicket();
      if (!loadedTicket) return;
      const lastDisplayedReply = [...loadedTicket.replies].reverse().find((reply) => reply.sender_role === "admin");
      if (lastDisplayedReply) {
        await fetch(`/api/support/tickets/${id}/read`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lastDisplayedReplyId: lastDisplayedReply.id }),
        });
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function sendReply() {
    if (pendingFile) return sendAttachment();
    const text = reply.trim();
    if (!text || sending) return;
    const operationId = replyOperationId ?? crypto.randomUUID();
    setReplyOperationId(operationId);
    setSending(true);
    try {
      const res = await fetch(`/api/support/tickets/${id}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, operationId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { code?: string } };
        showFeedback("error", body.error?.code ? tCommon(`chatbot.supportErrors.${supportError(body.error.code).key}`) : tCustomer("ui.support.replyError"));
        return;
      }
      setReply("");
      setReplyOperationId(null);
      showFeedback("success", tCustomer("ui.support.replySent"));
      await loadTicket();
    } catch {
      showFeedback("error", tCommon("chatbot.supportErrors.checking"));
    } finally {
      setSending(false);
    }
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploading) return;
    setPendingFile(file);
    setAttachmentOperationId(crypto.randomUUID());
  }

  async function sendAttachment() {
    if (!pendingFile || uploading) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      const operationId = attachmentOperationId ?? crypto.randomUUID();
      setAttachmentOperationId(operationId);
      formData.append("operationId", operationId);
      if (reply.trim()) formData.append("caption", reply.trim());
      const res = await fetch(`/api/support/tickets/${id}/attachments`, { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { code?: string } };
        if (body.error?.code === "UPLOAD_FAILED") setAttachmentOperationId(null);
        showFeedback("error", body.error?.code ? tCommon(`chatbot.supportErrors.${supportError(body.error.code).key}`) : tCustomer("ui.support.attachmentError"));
        return;
      }
      setReply("");
      setReplyOperationId(null);
      setPendingFile(null);
      setAttachmentOperationId(null);
      showFeedback("success", tCustomer("ui.support.replySent"));
      await loadTicket();
    } catch {
      showFeedback("error", tCommon("chatbot.supportErrors.checking"));
    } finally {
      setUploading(false);
    }
  }

  async function toggleMute() {
    if (!ticket || muting) return;
    const nextMuted = !ticket.muted;
    setMuting(true);
    setTicket((t) => (t ? { ...t, muted: nextMuted } : t));
    try {
      const res = await fetch(`/api/support/tickets/${id}/mute`, { method: nextMuted ? "POST" : "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setTicket((t) => (t ? { ...t, muted: !nextMuted } : t));
      showFeedback("error", tCustomer("ui.support.muteError"));
    } finally {
      setMuting(false);
    }
  }

  async function reopenTicket() {
    if (reopening) return;
    setReopening(true);
    try {
      const res = await fetch(`/api/support/tickets/${id}/reopen`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { code?: string } };
        const message = body.error?.code
          ? tCommon(`chatbot.supportErrors.${supportError(body.error.code).key}`)
          : tCustomer("ui.support.reopenError");
        showFeedback("error", message);
        return;
      }
      showFeedback("success", tCustomer("ui.support.ticketReopened"));
      await loadTicket();
    } catch {
      showFeedback("error", tCommon("chatbot.supportErrors.checking"));
    } finally {
      setReopening(false);
    }
  }

  if (ticket === undefined || !currentUser) {
    return <div role="status" aria-live="polite" className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-sm text-muted-foreground">{tCustomer("ui.states.loading")}</div>;
  }
  if (ticket === null) {
    const canRetry = supportTicketLoadFailure(ticketLoadError ?? undefined) === "retry";
    return (
      <EmptyState
        title={tCustomer("ui.support.ticketLoadError")}
        description={canRetry ? tCommon(`chatbot.supportErrors.${supportError(ticketLoadError ?? "READ_UNAVAILABLE").key}`) : tCustomer("ui.support.ticketNotFound")}
        action={canRetry ? <Button type="button" variant="outline" onClick={() => void loadTicket()}>{tCustomer("ui.support.retry")}</Button> : undefined}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <Link href="/customer/support" className="text-xs text-muted-foreground flex items-center gap-1 mb-4 hover:opacity-70">
        <ArrowLeft size={13} aria-hidden="true" /> {tCustomer("ui.support.myTickets")}
      </Link>

      {ticketLoadError && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{tCommon(`chatbot.supportErrors.${supportError(ticketLoadError).key}`)}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void loadTicket()}>{tCustomer("ui.support.retry")}</Button>
        </div>
      )}

      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-foreground font-[family-name:var(--font-display)]">{ticket.subject}</h1>
          {ticket.muted && (
            <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[0.625rem] font-semibold text-muted-foreground" title={tCustomer("ui.support.mutedHint")}>
              <BellOff size={10} /> {tCustomer("ui.support.muted")}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs font-semibold rounded-full px-3 py-1.5 bg-muted text-muted-foreground">
            {tCustomer(`ui.support.status.${ticket.status}`)}
          </span>
          <button
            type="button"
            onClick={toggleMute}
            disabled={muting}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={ticket.muted ? tCustomer("ui.support.unmute") : tCustomer("ui.support.mute")}
            title={ticket.muted ? tCustomer("ui.support.unmute") : tCustomer("ui.support.muteHint")}
          >
            {ticket.muted ? <BellOff size={14} /> : <Bell size={14} />}
          </button>
          <ReportChatButton chatType="user_admin" threadId={ticket.id} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-6">
        {ticket.category} · {tCustomer("ui.support.opened")} {new Date(ticket.createdAt).toLocaleDateString(i18n.resolvedLanguage || undefined)}
      </p>

      <div className="rounded-xl border border-border overflow-hidden mb-4">
        <div className="max-h-[50vh] overflow-y-auto px-4 py-4">
          <TicketThread
            ticketId={ticket.id}
            ticketIsMine={ticket.viewerIsOwner}
            ticketBody={ticket.body}
            ticketCreatedAt={ticket.createdAt}
            replies={ticket.replies}
          />
        </div>
      </div>

      {LOCKED_STATUSES.has(ticket.status) ? (
        <div className="rounded-xl border border-border bg-muted px-4 py-3 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            {tCustomer("ui.support.resolved")}{" "}
            <button onClick={reopenTicket} disabled={reopening} className="text-primary underline font-medium">
              {reopening ? tCustomer("ui.support.reopening") : tCustomer("ui.support.reopen")}
            </button>{" "}
            {tCustomer("ui.support.startNew")}
          </p>
        </div>
      ) : (
        <div>
          {speech.error && <p className="mb-1.5 text-xs text-destructive">{tCustomer(SPEECH_ERROR_KEY[speech.error])}</p>}
          {pendingFile && (
            <div className="mb-2 flex items-center gap-3 rounded-xl border border-border bg-secondary/60 px-3 py-2 text-xs">
              <FileText size={18} className="shrink-0 text-primary" />
              <span className="min-w-0 flex-1 break-words whitespace-normal text-foreground">{pendingFile.name}</span>
              <button type="button" onClick={() => { setPendingFile(null); setAttachmentOperationId(null); }} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={tCustomer("ui.support.removeAttachment")}>
                <X size={14} />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handleFileSelected} className="hidden" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={tCustomer("ui.support.attachFile")}
            >
              <Paperclip size={15} />
            </button>
            <input
              value={reply}
              onChange={(e) => {
                setReply(e.target.value);
                setReplyOperationId(e.target.value.trim() ? crypto.randomUUID() : null);
                if (pendingFile) setAttachmentOperationId(crypto.randomUUID());
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  sendReply();
                }
              }}
              aria-label={tCustomer("ui.support.reply")}
              placeholder={pendingFile ? tCustomer("ui.support.addCaption") : tCustomer("ui.support.reply")}
              maxLength={2000}
              className="flex-1 min-w-0 h-10 rounded-full border border-border px-4 text-sm bg-background text-foreground"
              disabled={sending || uploading}
            />
            {speech.isSupported && (
              <button
                type="button"
                onClick={() => (speech.isListening ? speech.stop() : speech.start())}
                disabled={sending || uploading}
                aria-label={speech.isListening ? tCustomer("ui.support.voice.stop") : tCustomer("ui.support.voice.start")}
                title={speech.isListening ? tCustomer("ui.support.voice.stop") : tCustomer("ui.support.voice.start")}
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  speech.isListening
                    ? "border-destructive bg-destructive/10 text-destructive animate-pulse"
                    : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {speech.isListening ? <MicOff size={15} /> : <Mic size={15} />}
              </button>
            )}
            <Button size="icon" className="h-10 w-10 rounded-full shrink-0" onClick={sendReply} disabled={sending || uploading || (!reply.trim() && !pendingFile)}>
              <Send size={14} aria-hidden="true" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
