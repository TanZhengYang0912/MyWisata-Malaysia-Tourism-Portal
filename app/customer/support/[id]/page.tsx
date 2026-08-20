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
import { TicketThread, type ReplyMessage, type TranscriptMessage } from "@/components/shared/ticket-thread";
import { ReportChatButton } from "@/components/shared/report-chat-button";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { useTranslation } from "react-i18next";
import { useSpeechInput, resolveRecognitionLangFromLocale, type SpeechInputErrorKind } from "@/hooks/use-speech-input";

// CLAUDE-VOICE-INPUT.md, mounted on support tickets. Same friendly copy as
// the chatbot widget's and chat-thread-panel's mic buttons.
const SPEECH_ERROR_TEXT: Record<SpeechInputErrorKind, string> = {
  "permission-denied": "Microphone access needed",
  "no-speech": "Didn't catch that — try again",
  network: "Voice input needs a connection",
  unknown: "Voice input isn't available right now",
};

interface TicketDetail {
  id: string;
  userId: string | null;
  subject: string;
  body: string;
  category: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  createdAt: string;
  resolvedAt: string | null;
  muted: boolean;
  transcript: TranscriptMessage[];
  replies: ReplyMessage[];
}

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const LOCKED_STATUSES = new Set(["resolved", "closed"]);

export default function CustomerTicketDetailPage() {
  const { t: tCustomer, i18n } = useTranslation("customer");
  const { id } = useParams<{ id: string }>();
  const { currentUser } = useAuth();
  const { showFeedback } = useActionFeedback();
  const [ticket, setTicket] = useState<TicketDetail | null | undefined>(undefined);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [muting, setMuting] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const speech = useSpeechInput({ lang: resolveRecognitionLangFromLocale(i18n.resolvedLanguage), onTranscriptChange: setReply });

  async function loadTicket() {
    try {
      const res = await fetch(`/api/support/tickets/${id}`);
      const body = (await res.json()) as { data: TicketDetail | null };
      setTicket(res.ok && body.data ? body.data : null);
    } catch {
      setTicket(null);
    }
  }

  useEffect(() => {
    (async () => {
      await loadTicket();
      // Marks read on actually opening the thread, not just when a list
      // row renders (CLAUDE-FIXES-2.md item 1's own instruction). Fire and
      // forget — the badge will just stay stale for one more poll cycle if
      // this happens to fail.
      await fetch(`/api/support/tickets/${id}/read`, { method: "PATCH" });
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function sendReply() {
    if (pendingFile) return sendAttachment();
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/support/tickets/${id}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); showFeedback("error", body?.error?.message ?? tCustomer("ui.support.replyError", { defaultValue: "Could not send reply." })); return; }
      setReply("");
      showFeedback("success", tCustomer("ui.support.replySent", { defaultValue: "Reply sent." }));
      await loadTicket();
    } catch {
      showFeedback("error", tCustomer("ui.support.replyRetry", { defaultValue: "Could not send reply. Please try again." }));
    } finally {
      setSending(false);
    }
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploading) return;
    setPendingFile(file);
  }

  async function sendAttachment() {
    if (!pendingFile || uploading) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      if (reply.trim()) formData.append("caption", reply.trim());
      const res = await fetch(`/api/support/tickets/${id}/attachments`, { method: "POST", body: formData });
      if (!res.ok) { const body = await res.json().catch(() => ({})); showFeedback("error", body?.error?.message ?? tCustomer("ui.support.attachmentError", { defaultValue: "Could not send attachment." })); return; }
      setReply("");
      setPendingFile(null);
      showFeedback("success", tCustomer("ui.support.replySent", { defaultValue: "Reply sent." }));
      await loadTicket();
    } catch {
      showFeedback("error", tCustomer("ui.support.attachmentError", { defaultValue: "Could not send attachment." }));
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
      showFeedback("error", tCustomer("ui.support.muteError", { defaultValue: "Could not update notification setting." }));
    } finally {
      setMuting(false);
    }
  }

  async function reopenTicket() {
    if (reopening) return;
    setReopening(true);
    try {
      const res = await fetch(`/api/support/tickets/${id}/reopen`, { method: "POST" });
      if (!res.ok) { const body = await res.json().catch(() => ({})); showFeedback("error", body?.error?.message ?? tCustomer("ui.support.reopenError", { defaultValue: "Could not reopen ticket." })); return; }
      showFeedback("success", tCustomer("ui.support.ticketReopened", { defaultValue: "Ticket reopened." }));
      await loadTicket();
    } catch {
      showFeedback("error", tCustomer("ui.support.reopenRetry", { defaultValue: "Could not reopen ticket. Please try again." }));
    } finally {
      setReopening(false);
    }
  }

  if (ticket === undefined || !currentUser) {
    return <div role="status" aria-live="polite" className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-sm text-muted-foreground">{tCustomer("ui.states.loading", { defaultValue: "Loading…" })}</div>;
  }
  if (ticket === null) {
    return <EmptyState title={tCustomer("ui.support.ticketLoadError", { defaultValue: "Couldn't load this ticket" })} description={tCustomer("ui.support.ticketNotFound", { defaultValue: "It may not exist, or it's not yours." })} />;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <Link href="/customer/support" className="text-xs text-muted-foreground flex items-center gap-1 mb-4 hover:opacity-70">
        <ArrowLeft size={13} aria-hidden="true" /> {tCustomer("ui.support.myTickets", { defaultValue: "My Tickets" })}
      </Link>

      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold text-foreground font-[family-name:var(--font-display)]">{ticket.subject}</h1>
          {ticket.muted && (
            <span className="flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[0.625rem] font-semibold text-muted-foreground" title={tCustomer("ui.support.mutedHint", { defaultValue: "Notifications muted for you" })}>
              <BellOff size={10} /> {tCustomer("ui.support.muted", { defaultValue: "Muted" })}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs font-semibold rounded-full px-3 py-1.5 bg-muted text-muted-foreground">
            {tCustomer(`ui.support.status.${ticket.status}`, { defaultValue: STATUS_LABEL[ticket.status] ?? ticket.status })}
          </span>
          <button
            type="button"
            onClick={toggleMute}
            disabled={muting}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={ticket.muted ? tCustomer("ui.support.unmute", { defaultValue: "Unmute ticket" }) : tCustomer("ui.support.mute", { defaultValue: "Mute ticket" })}
            title={ticket.muted ? tCustomer("ui.support.unmute", { defaultValue: "Unmute" }) : tCustomer("ui.support.muteHint", { defaultValue: "Mute notifications" })}
          >
            {ticket.muted ? <BellOff size={14} /> : <Bell size={14} />}
          </button>
          <ReportChatButton chatType="user_admin" threadId={ticket.id} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground mb-6">
        {ticket.category} · {tCustomer("ui.support.opened", { defaultValue: "opened" })} {new Date(ticket.createdAt).toLocaleDateString(i18n.resolvedLanguage || undefined)}
      </p>

      <div className="rounded-xl border border-border overflow-hidden mb-4">
        <div className="max-h-[50vh] overflow-y-auto px-4 py-4">
          <TicketThread
            ticketId={ticket.id}
            currentUserId={currentUser.id}
            ticketOwnerId={ticket.userId}
            ticketBody={ticket.body}
            ticketCreatedAt={ticket.createdAt}
            transcript={ticket.transcript}
            replies={ticket.replies}
          />
        </div>
      </div>

      {LOCKED_STATUSES.has(ticket.status) ? (
        <div className="rounded-xl border border-border bg-muted px-4 py-3 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            {tCustomer("ui.support.resolved", { defaultValue: "This ticket is resolved." })}{" "}
            <button onClick={reopenTicket} disabled={reopening} className="text-primary underline font-medium">
              {reopening ? tCustomer("ui.support.reopening", { defaultValue: "Reopening…" }) : tCustomer("ui.support.reopen", { defaultValue: "Reopen ticket" })}
            </button>{" "}
            {tCustomer("ui.support.startNew", { defaultValue: "or start a new one." })}
          </p>
        </div>
      ) : (
        <div>
          {speech.error && <p className="mb-1.5 text-xs text-destructive">{SPEECH_ERROR_TEXT[speech.error]}</p>}
          {pendingFile && (
            <div className="mb-2 flex items-center gap-3 rounded-xl border border-border bg-secondary/60 px-3 py-2 text-xs">
              <FileText size={18} className="shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-foreground">{pendingFile.name}</span>
              <button type="button" onClick={() => setPendingFile(null)} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={tCustomer("ui.support.removeAttachment", { defaultValue: "Remove attachment" })}>
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
              aria-label={tCustomer("ui.support.attachFile", { defaultValue: "Attach a file" })}
            >
              <Paperclip size={15} />
            </button>
            <input
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") sendReply();
              }}
              aria-label={tCustomer("ui.support.reply", { defaultValue: "Reply to this ticket" })}
              placeholder={pendingFile ? tCustomer("ui.support.addCaption", { defaultValue: "Add a caption…" }) : tCustomer("ui.support.reply", { defaultValue: "Reply to this ticket…" })}
              className="flex-1 min-w-0 h-10 rounded-full border border-border px-4 text-sm bg-background text-foreground"
              disabled={sending || uploading}
            />
            {speech.isSupported && (
              <button
                type="button"
                onClick={() => (speech.isListening ? speech.stop() : speech.start())}
                disabled={sending || uploading}
                aria-label={speech.isListening ? "Stop listening" : "Speak your reply"}
                title={speech.isListening ? "Stop listening" : "Speak your reply"}
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
