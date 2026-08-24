"use client";

import { useEffect, useState } from "react";
import { CheckSquare, ExternalLink, FileWarning, MessageSquare, ShieldCheck, X, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AdminKycSubmission, User } from "@/backend/core/types";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { adminFilterControlClassName } from "@/components/admin/filter-bar";
import { Button } from "@/components/ui/button";
import { KYC_REVIEW_REASON_CODES, type KycReviewReasonCode } from "@/lib/kyc/types";

export type KycReviewDecision = {
  action: "approve" | "reject" | "request_info";
  reasonCode?: KycReviewReasonCode;
  reasonDetail?: string;
};

type KycReviewDrawerProps = {
  user: User | null;
  submission: AdminKycSubmission | null;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onOpenDocument: (side: "front" | "back") => void;
  onDecision: (decision: KycReviewDecision) => void;
};

type ReasonAction = "reject" | "request_info";

export function KycReviewDrawer({
  user,
  submission,
  busy,
  error,
  onClose,
  onOpenDocument,
  onDecision,
}: KycReviewDrawerProps) {
  const { t } = useTranslation("admin");
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [reasonCode, setReasonCode] = useState<KycReviewReasonCode | "">("");
  const [reasonDetail, setReasonDetail] = useState("");
  const [confirmDecision, setConfirmDecision] = useState<KycReviewDecision | null>(null);

  useEffect(() => {
    if (!user || !submission) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy && !confirmDecision) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, confirmDecision, onClose, submission, user]);

  if (!user || !submission) return null;

  const readOnly = submission.status !== "pending";
  const canContinue = Boolean(reasonCode) && (reasonCode !== "other" || reasonDetail.trim().length >= 10);

  function beginReasonAction(action: ReasonAction) {
    setReasonAction(action);
    setReasonCode("");
    setReasonDetail("");
  }

  function prepareReasonDecision() {
    if (!reasonAction || !reasonCode || !canContinue) return;
    setConfirmDecision({
      action: reasonAction,
      reasonCode,
      ...(reasonDetail.trim() ? { reasonDetail: reasonDetail.trim() } : {}),
    });
  }

  const confirmTitle = confirmDecision?.action === "approve"
    ? "kyc.confirm.approveTitle"
    : confirmDecision?.action === "reject"
      ? "kyc.confirm.rejectTitle"
      : "kyc.confirm.infoTitle";
  const confirmDescription = confirmDecision?.action === "approve"
    ? "kyc.confirm.approveDescription"
    : confirmDecision?.action === "reject"
      ? "kyc.confirm.rejectDescription"
      : "kyc.confirm.infoDescription";
  const confirmLabel = confirmDecision?.action === "approve"
    ? "kyc.confirm.approve"
    : confirmDecision?.action === "reject"
      ? "kyc.confirm.reject"
      : "kyc.confirm.info";

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/35" role="dialog" aria-modal="true" aria-label={t("kyc.accessibility.details")}>
      <button type="button" aria-label={t("kyc.drawer.close")} className="absolute inset-0 cursor-default" onClick={() => { if (!busy) onClose(); }} disabled={busy} />
      <aside className="relative z-10 h-full w-full max-w-3xl overflow-y-auto border-l border-border bg-card shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-border bg-card px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><ShieldCheck size={15} /> {t("kyc.drawer.eyebrow")}</p>
            <h2 className="mt-1 truncate text-xl font-bold text-foreground">{user.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t(`kyc.documents.${submission.docType}`)} · {t(`kyc.status.${submission.status === "info_requested" ? "infoRequested" : "pending"}`)}</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={busy} aria-label={t("kyc.drawer.close")}><X size={18} /></Button>
        </div>

        <div className="space-y-5 p-5 sm:p-6">
          {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

          <section className="rounded-2xl border border-border p-4 sm:p-5">
            <h3 className="font-semibold text-foreground">{t("kyc.drawer.documents")}</h3>
            <div className="mt-3 flex flex-wrap gap-2">
              {submission.documents.map(({ side }) => (
                <Button key={side} variant="outline" size="sm" onClick={() => onOpenDocument(side)}>
                  <ExternalLink size={14} />
                  {t("kyc.drawer.openDocument", { side: t(`kyc.drawer.${side}`) })}
                </Button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border p-4 sm:p-5">
            <h3 className="font-semibold text-foreground">{t("kyc.drawer.automatedChecks")}</h3>
            {submission.ocr ? (
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-xl bg-secondary/60 p-3">
                  <p className="font-medium text-foreground">{t("kyc.drawer.ocrStatus", { status: t(`kyc.ocr.status.${submission.ocr.status}`) })}</p>
                  <p className="mt-1 text-muted-foreground">{t("kyc.ocr.extractedName", { name: submission.ocr.holderName ?? t("kyc.fallback.notAvailable") })}</p>
                  <p className="text-muted-foreground">{t("kyc.ocr.documentEnding", { number: submission.ocr.documentNumberLast4 ?? t("kyc.fallback.notAvailable") })}</p>
                </div>
                <div className="rounded-xl bg-secondary/60 p-3">
                  <p className="text-muted-foreground">{t("kyc.ocr.expiryDate", { date: submission.ocr.expiryDate ?? t("kyc.fallback.notAvailable") })}</p>
                  {submission.ocr.mismatchFields.length > 0 ? (
                    <p className="mt-1 flex items-start gap-1 text-destructive"><FileWarning size={14} className="mt-0.5 shrink-0" /> {t("kyc.ocr.mismatch", { fields: submission.ocr.mismatchFields.join(", ").replaceAll("_", " ") })}</p>
                  ) : (
                    <p className="mt-1 text-primary">{t("kyc.ocr.noMismatch")}</p>
                  )}
                </div>
              </div>
            ) : <p className="mt-3 text-sm text-muted-foreground">{t("kyc.drawer.noAutomatedChecks")}</p>}
          </section>

          {readOnly ? (
            <section className="rounded-2xl border border-border bg-muted/50 p-4 sm:p-5">
              <h3 className="font-semibold text-foreground">{t("kyc.drawer.waitingTitle")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t("kyc.drawer.waitingDescription")}</p>
            </section>
          ) : (
            <section className="rounded-2xl border border-border p-4 sm:p-5">
              <h3 className="font-semibold text-foreground">{t("kyc.drawer.decision")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t("kyc.drawer.decisionDescription")}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" disabled={busy} onClick={() => setConfirmDecision({ action: "approve" })}><CheckSquare size={14} /> {t("kyc.drawer.approve")}</Button>
                <Button size="sm" variant="outline" disabled={busy} onClick={() => beginReasonAction("request_info")}><MessageSquare size={14} /> {t("kyc.drawer.requestInfo")}</Button>
                <Button size="sm" variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" disabled={busy} onClick={() => beginReasonAction("reject")}><XCircle size={14} /> {t("kyc.drawer.reject")}</Button>
              </div>

              {reasonAction && (
                <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
                  <p className="text-sm font-semibold text-foreground">{reasonAction === "reject" ? t("kyc.action.rejectionReason") : t("kyc.action.informationRequested")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("kyc.action.chooseReason")}</p>
                  <select aria-label={t("kyc.accessibility.reason")} value={reasonCode} onChange={(event) => { const next = event.target.value as KycReviewReasonCode | ""; setReasonCode(next); if (next !== "other") setReasonDetail(""); }} className={`${adminFilterControlClassName} mt-3 w-full`}>
                    <option value="">{t("kyc.action.selectReason")}</option>
                    {KYC_REVIEW_REASON_CODES.filter((code) => reasonAction === "reject" || code !== "document_suspected_tampering").map((code) => <option key={code} value={code}>{t(`kyc.reasons.${code}`)}</option>)}
                  </select>
                  {reasonCode === "other" && <textarea aria-label={t("kyc.accessibility.details")} rows={3} value={reasonDetail} onChange={(event) => setReasonDetail(event.target.value)} placeholder={t("kyc.action.detailPlaceholder")} className="mt-3 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm" />}
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => { setReasonAction(null); setReasonCode(""); setReasonDetail(""); }}>{t("common.actions.cancel")}</Button>
                    <Button size="sm" variant={reasonAction === "reject" ? "destructive" : "default"} disabled={busy || !canContinue} onClick={prepareReasonDecision}>{t("kyc.action.review")}</Button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </aside>

      <AdminConfirmDialog
        open={Boolean(confirmDecision)}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={confirmLabel}
        confirmVariant={confirmDecision?.action === "reject" ? "destructive" : "default"}
        busy={busy}
        onCancel={() => setConfirmDecision(null)}
        onConfirm={() => { if (confirmDecision) onDecision(confirmDecision); }}
      />
    </div>
  );
}
