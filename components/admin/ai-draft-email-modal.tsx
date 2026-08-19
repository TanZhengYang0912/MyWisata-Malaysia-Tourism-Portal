"use client";

// P4 — Member 4: generic "AI drafts an email, admin edits, admin sends"
// modal. Originally built as a recommendation-invite-specific component
// (InviteVendorModal); generalized so it can also back the vendor
// approval-email flow (app/admin/vendors/page.tsx) without duplicating this
// ~150 lines of modal chrome. Auto-drafts on open via `draftUrl`, lets the
// admin edit everything, and only commits anything server-side when Send is
// explicitly clicked via `sendUrl` — Cancel is always safe since nothing
// happens before that. `extraBody` is merged into both requests (e.g.
// `{recommendationId}` for the recommendations flow; empty for the vendor
// flow, which carries its id in the URL instead).

import { useEffect, useState } from "react";
import { Mail, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Target = { id: string; name: string; defaultEmail?: string };

type Props = {
  open: boolean;
  target: Target | null;
  title: string;
  draftUrl: string;
  sendUrl: string;
  extraBody?: Record<string, unknown>;
  sendLabel?: string;
  linkHint?: string;
  onClose: () => void;
  onSent: (id: string) => void;
};

export function AiDraftEmailModal({
  open,
  target,
  title,
  draftUrl,
  sendUrl,
  extraBody = {},
  sendLabel = "Send email",
  linkHint = "A link is appended automatically when you send — no need to include it.",
  onClose,
  onSent,
}: Props) {
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  async function runDraft() {
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await fetch(draftUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extraBody),
      });
      const responseBody = (await res.json()) as {
        data: { subject: string; body: string } | null;
        error: { message: string } | null;
      };
      if (!res.ok || !responseBody.data) {
        setDraftError(responseBody.error?.message ?? "Could not draft an email right now — write one manually.");
        return;
      }
      setSubject(responseBody.data.subject);
      setBody(responseBody.data.body);
    } catch {
      setDraftError("Could not draft an email right now — write one manually.");
    } finally {
      setDrafting(false);
    }
  }

  useEffect(() => {
    if (!open || !target) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEmail(target.defaultEmail ?? "");
    setSubject("");
    setBody("");
    setSendError(null);
    runDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, target?.id]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !sending) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, sending, onClose]);

  if (!open || !target) return null;

  async function sendEmail() {
    if (sending || !target) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(sendUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...extraBody, email: email.trim(), subject: subject.trim(), body: body.trim() }),
      });
      const responseBody = (await res.json()) as { error: { message: string } | null };
      if (!res.ok) {
        setSendError(responseBody.error?.message ?? "Could not send the email. Please try again.");
        return;
      }
      onSent(target.id);
    } catch {
      setSendError("Could not send the email. Please try again.");
    } finally {
      setSending(false);
    }
  }

  const canSend = email.trim().length > 0 && subject.trim().length > 0 && body.trim().length > 0 && !sending;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4" role="presentation">
      <div
        className="w-full max-w-xl rounded-2xl border border-border bg-card p-5 shadow-2xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ai-draft-email-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="ai-draft-email-title" className="text-base font-semibold text-foreground">
              {title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">AI drafts the message below — edit anything before sending.</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            disabled={sending}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary disabled:opacity-50"
          >
            <X size={17} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Recipient email</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="vendor@example.com"
              disabled={sending}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-muted-foreground">Subject</label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 gap-1 text-[0.6875rem] px-2"
                onClick={() => runDraft()}
                disabled={drafting || sending}
              >
                <Sparkles size={11} /> {drafting ? "Drafting…" : "Regenerate draft"}
              </Button>
            </div>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={drafting ? "Drafting…" : "Subject line"} disabled={sending} />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Message</label>
            <Textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={drafting ? "Drafting…" : "Message body"}
              disabled={sending}
            />
            <p className="mt-1 text-[0.6875rem] text-muted-foreground">{linkHint}</p>
          </div>

          {draftError && <p className="text-xs text-destructive">{draftError}</p>}
          {sendError && <p className="text-xs text-destructive">{sendError}</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={sendEmail} disabled={!canSend} className="gap-1.5">
            <Mail size={14} /> {sending ? "Sending…" : sendLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
