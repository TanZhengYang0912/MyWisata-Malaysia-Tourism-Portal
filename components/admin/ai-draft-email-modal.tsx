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

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { isAppLocale, type AppLocale } from "@/lib/i18n/locale";

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
  onSent: (id: string, data: unknown) => void;
};

export function AiDraftEmailModal({
  open,
  target,
  title,
  draftUrl,
  sendUrl,
  extraBody = {},
  sendLabel,
  linkHint,
  onClose,
  onSent,
}: Props) {
  const { t } = useTranslation("admin");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const [recipientLocale, setRecipientLocale] = useState<AppLocale | null>(null);
  const recipientRef = useRef("");
  const draftRequest = useRef(0);

  async function resolveRecipientLanguage(recipient: string) {
    if (!recipient.trim()) return;
    try {
      const res = await fetch(draftUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...extraBody, email: recipient.trim(), localeOnly: true }),
      });
      const result = await res.json() as { data?: { locale?: unknown } };
      if (recipientRef.current !== recipient) return;
      setRecipientLocale(res.ok && isAppLocale(result.data?.locale) ? result.data.locale : null);
    } catch {
      if (recipientRef.current === recipient) setRecipientLocale(null);
    }
  }

  async function runDraft(recipient = email) {
    const requestId = ++draftRequest.current;
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await fetch(draftUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...extraBody, ...(recipient.trim() ? { email: recipient.trim() } : {}) }),
      });
      const responseBody = (await res.json()) as {
        data: { subject: string; body: string; locale?: unknown } | null;
        error: { message: string } | null;
      };
      if (requestId !== draftRequest.current || recipientRef.current !== recipient) return;
      if (!res.ok || !responseBody.data) {
        setDraftError(responseBody.error?.message ?? t("email.draft.errors.unavailable"));
        return;
      }
      setRecipientLocale(isAppLocale(responseBody.data.locale) ? responseBody.data.locale : null);
      setSubject(responseBody.data.subject);
      setBody(responseBody.data.body);
    } catch {
      if (requestId === draftRequest.current) setDraftError(t("email.draft.errors.unavailable"));
    } finally {
      if (requestId === draftRequest.current) setDrafting(false);
    }
  }

  useEffect(() => {
    if (!open || !target) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEmail(target.defaultEmail ?? "");
    const initialEmail = target.defaultEmail ?? "";
    recipientRef.current = initialEmail;
    setRecipientLocale(null);
    setSubject("");
    setBody("");
    setSendError(null);
    runDraft(initialEmail);
    return () => { draftRequest.current += 1; };
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
      const responseBody = (await res.json()) as {
        data: unknown;
        error: { message: string } | null;
      };
      if (!res.ok) {
        setSendError(responseBody.error?.message ?? t("email.draft.errors.sendFailed"));
        return;
      }
      onSent(target.id, responseBody.data);
    } catch {
      setSendError(t("email.draft.errors.sendFailed"));
    } finally {
      setSending(false);
    }
  }

  const canSend = email.trim().length > 0 && subject.trim().length > 0 && body.trim().length > 0 && !sending && !drafting;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4" role="presentation">
      <div
        className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-5 shadow-2xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="ai-draft-email-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="ai-draft-email-title" className="break-words text-base font-semibold text-foreground">
              {title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">{t("email.draft.advisory")}</p>
          </div>
          <button
            type="button"
            aria-label={t("email.draft.close")}
            onClick={onClose}
            disabled={sending}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary disabled:opacity-50"
          >
            <X size={17} />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("email.draft.recipient")}</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                recipientRef.current = e.target.value;
                setRecipientLocale(null);
                draftRequest.current += 1;
                setDrafting(false);
              }}
              onBlur={() => void resolveRecipientLanguage(email)}
              placeholder={t("email.draft.recipientPlaceholder")}
              disabled={sending}
            />
            <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
              {recipientLocale
                ? t("email.draft.recipientLanguage", { language: t(`email.draft.languages.${recipientLocale}`) })
                : t("email.draft.languageUnavailable")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{t("email.draft.languageReview")}</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-muted-foreground">{t("email.draft.subject")}</label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-6 gap-1 text-[0.6875rem] px-2"
                onClick={() => runDraft()}
                disabled={drafting || sending}
              >
                <Sparkles size={11} /> {drafting ? t("email.draft.drafting") : t("email.draft.regenerate")}
              </Button>
            </div>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={drafting ? t("email.draft.drafting") : t("email.draft.subjectPlaceholder")} disabled={sending || drafting} />
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">{t("email.draft.message")}</label>
            <Textarea
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={drafting ? t("email.draft.drafting") : t("email.draft.messagePlaceholder")}
              disabled={sending || drafting}
            />
            <p className="mt-1 text-[0.6875rem] text-muted-foreground">{linkHint ?? t("email.draft.linkHint")}</p>
          </div>

          {draftError && <p className="text-xs text-destructive">{draftError}</p>}
          {sendError && <p className="text-xs text-destructive">{sendError}</p>}
        </div>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={sending}>
            {t("email.draft.cancel")}
          </Button>
          <Button onClick={sendEmail} disabled={!canSend} className="gap-1.5">
            <Mail size={14} /> {sending ? t("email.draft.sending") : sendLabel ?? t("email.draft.send")}
          </Button>
        </div>
      </div>
    </div>
  );
}
