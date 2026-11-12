"use client";

// P4 — CLAUDE-SUPPORT-MUTE-REPORT.md Feature 3: the report button, generic
// across chat surfaces. Calls the Feature 4 destination (POST
// /api/conduct/report) directly — reused on the user<->admin ticket thread
// (both the customer's and the admin's view). Not used on the user<->vendor
// chat surface: that surface already has its own working "Report
// conversation" flow (components/customer/chat-thread-panel.tsx, into the
// pre-existing chat_reports table with reporter-reputation/ban tooling) —
// left untouched rather than rewired, see the conduct panel's summary for
// why. vendor_admin has no real chat surface yet (confirmed by search), so
// nothing calls this with that chatType today.

import { useRef, useState } from "react";
import Link from "next/link";
import { Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { useTranslation } from "react-i18next";
import { guestLoginHref, postLoginPath } from "@/lib/auth/guest-mode";

interface ReportChatButtonProps {
  chatType: "user_vendor" | "user_admin" | "vendor_admin";
  threadId: string;
  returnPath: string;
  className?: string;
}

export function ReportChatButton({ chatType, threadId, returnPath, className }: ReportChatButtonProps) {
  const { t } = useTranslation("common");
  const { showFeedback } = useActionFeedback();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [reported, setReported] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"copied" | "failed" | null>(null);
  const [resultUnknown, setResultUnknown] = useState(false);
  const sendingRef = useRef(false);
  const safeReturnPath = postLoginPath(returnPath) ?? "/customer/support";

  async function copyReason() {
    if (!reason.trim()) return;
    try {
      await navigator.clipboard.writeText(reason.trim());
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  }

  async function submit() {
    if (sendingRef.current) return;
    sendingRef.current = true;
    setSending(true);
    try {
      const res = await fetch("/api/conduct/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatType, threadId, reason: reason.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { code?: string } };
        if (body.error?.code === "ALREADY_REPORTED") {
          setReported(true);
          setOpen(false);
          setErrorKey(null);
          showFeedback("success", t("conductReport.alreadyReported"));
          return;
        }
        const code = body.error?.code;
        if (code === "UNAUTHORIZED" || res.status === 401) setErrorKey("signInRequired");
        else if (code === "READ_UNAVAILABLE") setErrorKey("readUnavailable");
        else if (code === "NOT_FOUND") setErrorKey("conversationUnavailable");
        else if (code === "VALIDATION_FAILED") setErrorKey("invalidReason");
        else {
          setResultUnknown(true);
          setErrorKey("submitResultUnknown");
        }
        return;
      }
      setReported(true);
      setOpen(false);
      setErrorKey(null);
      showFeedback("success", t("conductReport.success"));
    } catch {
      setResultUnknown(true);
      setErrorKey("submitResultUnknown");
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  if (reported) {
    return <span className={`text-xs text-muted-foreground ${className ?? ""}`}>{t("conductReport.reported")}</span>;
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <button
        type="button"
        disabled={sending}
        aria-expanded={open}
        aria-controls={`conduct-report-${threadId}`}
        onClick={() => {
          if (!resultUnknown) setErrorKey(null);
          setOpen((o) => !o);
        }}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive"
        aria-label={t("conductReport.reportConversation")}
        title={t("conductReport.report")}
      >
        <Flag size={14} />
      </button>
      {open && (
        <div id={`conduct-report-${threadId}`} className="absolute right-0 top-9 z-20 w-64 rounded-2xl border border-border bg-card p-3 shadow-lg">
          <p className="mb-2 text-sm font-semibold text-foreground">{t("conductReport.reportConversation")}</p>
          {errorKey && (
            <div role="alert" className="mb-2 text-xs text-destructive">
              <p>{t(`conductReport.${errorKey}`)}</p>
              {errorKey === "signInRequired" && (
                <Link href={guestLoginHref(returnPath)} className="mt-1 inline-block text-primary underline">
                  {t("account.signIn")}
                </Link>
              )}
              {(errorKey === "submitResultUnknown" || errorKey === "conversationUnavailable") && (
                <Link href={safeReturnPath} className="mt-1 inline-block text-primary underline">
                  {t("conductReport.returnToConversation")}
                </Link>
              )}
            </div>
          )}
          <textarea
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setCopyState(null);
              if (errorKey === "invalidReason") setErrorKey(null);
            }}
            aria-label={t("conductReport.reasonOptional")}
            placeholder={t("conductReport.reasonOptional")}
            rows={2}
            maxLength={500}
            className="mb-2 w-full resize-none rounded-xl border border-border bg-background px-2.5 py-2 text-xs text-foreground"
          />
          {errorKey === "signInRequired" && reason.trim() && (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              <button type="button" onClick={() => void copyReason()} className="text-primary underline">
                {t(`conductReport.${copyState === "copied" ? "reasonCopied" : "copyReason"}`)}
              </button>
              {copyState === "failed" && <span role="status" className="text-destructive">{t("conductReport.copyFailed")}</span>}
            </div>
          )}
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" className="flex-1" disabled={sending || resultUnknown} onClick={() => void submit()}>
              {sending ? t("conductReport.submitting") : t("conductReport.submit")}
            </Button>
            <Button size="sm" variant="outline" disabled={sending} onClick={() => setOpen(false)}>{t("actions.cancel")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
