"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  CheckSquare,
  ExternalLink,
  FileWarning,
  MessageSquare,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AdminKycReviewDetail, AdminKycSubmission } from "@/backend/core/types";
import { AdminPageHeader } from "@/components/admin/admin-page-shell";
import { AdminConfirmDialog } from "@/components/admin/confirm-dialog";
import { adminFilterControlClassName } from "@/components/admin/filter-bar";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { Button } from "@/components/ui/button";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { KYC_REVIEW_REASON_CODES, type KycReviewReasonCode } from "@/lib/kyc/types";

export type KycReviewDecision = {
  action: "approve" | "reject" | "request_info";
  reasonCode?: KycReviewReasonCode;
  reasonDetail?: string;
};

type ReasonAction = "reject" | "request_info";

type KycReviewDetailContentProps = {
  detail: AdminKycReviewDetail;
  busy: boolean;
  error: string | null;
  onOpenDocument: (side: "front" | "back") => void;
  onDecision: (decision: KycReviewDecision) => void;
};

function statusKey(status: AdminKycSubmission["status"]) {
  return status === "info_requested" ? "infoRequested" : status;
}

export function KycReviewDetailContent({
  detail,
  busy,
  error,
  onOpenDocument,
  onDecision,
}: KycReviewDetailContentProps) {
  const { t, i18n } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const { customer, submission } = detail;
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [reasonCode, setReasonCode] = useState<KycReviewReasonCode | "">("");
  const [reasonDetail, setReasonDetail] = useState("");
  const [confirmDecision, setConfirmDecision] = useState<KycReviewDecision | null>(null);

  const actionable = submission.status === "pending";
  const canContinue = Boolean(reasonCode) && (reasonCode !== "other" || reasonDetail.trim().length >= 10);
  const statusLabel = t(`kyc.status.${statusKey(submission.status)}`);
  const statusClassName = submission.status === "approved"
    ? "bg-nature-green text-nature-green-ink"
    : submission.status === "rejected"
      ? "bg-destructive/10 text-destructive"
      : submission.status === "info_requested"
        ? "bg-accent text-accent-foreground"
        : "bg-primary/10 text-primary";

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

  function submitConfirmedDecision() {
    if (!confirmDecision) return;
    onDecision(confirmDecision);
    setConfirmDecision(null);
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
  const reviewedAt = submission.reviewedAt
    ? new Date(submission.reviewedAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
    : null;
  const submittedAt = new Date(submission.submittedAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
  const reasonLabel = submission.reviewReasonCode && KYC_REVIEW_REASON_CODES.includes(submission.reviewReasonCode as KycReviewReasonCode)
    ? t(`kyc.reasons.${submission.reviewReasonCode}`)
    : submission.reviewReasonCode;

  return (
    <>
      <Link href="/admin/kyc" className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
        <ArrowLeft size={16} />
        {t("kyc.detail.backToQueue")}
      </Link>

      <AdminPageHeader
        eyebrow={<><ShieldCheck size={18} /> {t("kyc.detail.eyebrow")}</>}
        title={customer.name}
        description={customer.email}
        actions={<span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusClassName}`}>{statusLabel}</span>}
      />

      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.42fr)]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-semibold text-foreground">{t("kyc.detail.documents")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("kyc.detail.documentsDescription")}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {submission.documents.map(({ side }) => (
                <Button key={side} variant="outline" size="sm" disabled={busy} onClick={() => onOpenDocument(side)}>
                  <ExternalLink size={14} />
                  {t("kyc.detail.openDocument", { side: t(`kyc.detail.${side}`) })}
                </Button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-semibold text-foreground">{t("kyc.detail.automatedChecks")}</h2>
            {submission.ocr ? (
              <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div className="rounded-xl bg-secondary/60 p-3">
                  <p className="font-medium text-foreground">{t("kyc.detail.ocrStatus", { status: t(`kyc.ocr.status.${submission.ocr.status}`) })}</p>
                  <p className="mt-1 text-muted-foreground">{t("kyc.ocr.extractedName", { name: submission.ocr.holderName ?? t("kyc.fallback.notAvailable") })}</p>
                  <p className="text-muted-foreground">{t("kyc.ocr.documentEnding", { number: submission.ocr.documentNumberLast4 ?? t("kyc.fallback.notAvailable") })}</p>
                </div>
                <div className="rounded-xl bg-secondary/60 p-3">
                  <p className="text-muted-foreground">{t("kyc.ocr.expiryDate", { date: submission.ocr.expiryDate ?? t("kyc.fallback.notAvailable") })}</p>
                  {submission.ocr.mismatchFields.length > 0 ? (
                    <p className="mt-1 flex items-start gap-1 text-destructive">
                      <FileWarning size={14} className="mt-0.5 shrink-0" />
                      {t("kyc.ocr.mismatch", { fields: submission.ocr.mismatchFields.join(", ").replaceAll("_", " ") })}
                    </p>
                  ) : (
                    <p className="mt-1 text-primary">{t("kyc.ocr.noMismatch")}</p>
                  )}
                </div>
              </div>
            ) : <p className="mt-3 text-sm text-muted-foreground">{t("kyc.detail.noAutomatedChecks")}</p>}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-semibold text-foreground">{t("kyc.detail.submission")}</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div><dt className="text-muted-foreground">{t("kyc.detail.documentType")}</dt><dd className="mt-1 font-medium text-foreground">{t(`kyc.documents.${submission.docType}`)}</dd></div>
              <div><dt className="text-muted-foreground">{t("kyc.detail.submittedAt")}</dt><dd className="mt-1 font-medium text-foreground">{submittedAt}</dd></div>
              <div><dt className="text-muted-foreground">{t("kyc.detail.queuePosition")}</dt><dd className="mt-1 font-medium text-foreground">{submission.queuePosition ?? "—"}</dd></div>
            </dl>
          </section>

          {actionable ? (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-semibold text-foreground">{t("kyc.detail.decision")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("kyc.detail.decisionDescription")}</p>
              <div className="mt-4 grid gap-2">
                <Button disabled={busy} onClick={() => setConfirmDecision({ action: "approve" })}><CheckSquare size={14} /> {t("kyc.detail.approve")}</Button>
                <Button variant="outline" disabled={busy} onClick={() => beginReasonAction("request_info")}><MessageSquare size={14} /> {t("kyc.detail.requestInfo")}</Button>
                <Button variant="outline" className="border-destructive text-destructive hover:bg-destructive/10" disabled={busy} onClick={() => beginReasonAction("reject")}><XCircle size={14} /> {t("kyc.detail.reject")}</Button>
              </div>

              {reasonAction && (
                <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-4">
                  <p className="text-sm font-semibold text-foreground">{reasonAction === "reject" ? t("kyc.action.rejectionReason") : t("kyc.action.informationRequested")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("kyc.action.chooseReason")}</p>
                  <select
                    aria-label={t("kyc.accessibility.reason")}
                    value={reasonCode}
                    onChange={(event) => {
                      const next = event.target.value as KycReviewReasonCode | "";
                      setReasonCode(next);
                      if (next !== "other") setReasonDetail("");
                    }}
                    className={`${adminFilterControlClassName} mt-3 w-full`}
                  >
                    <option value="">{t("kyc.action.selectReason")}</option>
                    {KYC_REVIEW_REASON_CODES
                      .filter((code) => reasonAction === "reject" || code !== "document_suspected_tampering")
                      .map((code) => <option key={code} value={code}>{t(`kyc.reasons.${code}`)}</option>)}
                  </select>
                  {reasonCode === "other" && (
                    <textarea
                      aria-label={t("kyc.accessibility.details")}
                      rows={3}
                      value={reasonDetail}
                      onChange={(event) => setReasonDetail(event.target.value)}
                      placeholder={t("kyc.action.detailPlaceholder")}
                      className="mt-3 w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm"
                    />
                  )}
                  <div className="mt-3 flex justify-end gap-2">
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => { setReasonAction(null); setReasonCode(""); setReasonDetail(""); }}>{tCommon("actions.cancel")}</Button>
                    <Button size="sm" variant={reasonAction === "reject" ? "destructive" : "default"} disabled={busy || !canContinue} onClick={prepareReasonDecision}>{t("kyc.action.review")}</Button>
                  </div>
                </div>
              )}
            </section>
          ) : submission.status === "info_requested" ? (
            <section className="rounded-2xl border border-border bg-muted/50 p-5">
              <h2 className="font-semibold text-foreground">{t("kyc.detail.waitingTitle")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("kyc.detail.waitingDescription")}</p>
            </section>
          ) : (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-semibold text-foreground">{t("kyc.detail.outcome")}</h2>
              <p className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusClassName}`}>{statusLabel}</p>
              {reviewedAt && <p className="mt-3 text-sm text-muted-foreground">{t("kyc.detail.reviewedAt", { date: reviewedAt })}</p>}
              {submission.reviewedBy && <p className="mt-1 text-sm text-muted-foreground">{t("kyc.detail.reviewedBy", { reviewer: submission.reviewedBy })}</p>}
              {reasonLabel && <p className="mt-3 text-sm font-medium text-foreground">{reasonLabel}</p>}
              {submission.reviewReasonDetail && <p className="mt-1 text-sm text-muted-foreground">{submission.reviewReasonDetail}</p>}
              {!reviewedAt && <p className="mt-3 text-sm text-muted-foreground">{t("kyc.detail.readOnlyDescription")}</p>}
            </section>
          )}
        </aside>
      </section>

      <AdminConfirmDialog
        open={Boolean(confirmDecision)}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={confirmLabel}
        confirmVariant={confirmDecision?.action === "reject" ? "destructive" : "default"}
        busy={busy}
        onCancel={() => setConfirmDecision(null)}
        onConfirm={submitConfirmedDecision}
      />
    </>
  );
}

export function KycReviewDetail({ submissionId }: { submissionId: string }) {
  const { t } = useTranslation("admin");
  const { showFeedback } = useActionFeedback();
  const [detail, setDetail] = useState<AdminKycReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/kyc/submissions/${submissionId}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (response.status === 404) {
        setNotFound(true);
        setDetail(null);
        setError(null);
        return;
      }
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? t("kyc.errors.loadSubmissions"));
      setDetail(body.data as AdminKycReviewDetail);
      setNotFound(false);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("kyc.errors.loadSubmissions"));
    } finally {
      setLoading(false);
    }
  }, [submissionId, t]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function openDocument(side: "front" | "back") {
    if (!detail) return;
    try {
      const response = await fetch(`/api/admin/kyc/documents/${detail.submission.id}/${side}`);
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.data?.signedUrl) throw new Error(body.error?.message ?? t("kyc.errors.loadDocument"));
      window.open(body.data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("kyc.errors.loadDocument");
      setError(message);
      showFeedback("error", message);
    }
  }

  async function review(decision: KycReviewDecision) {
    if (!detail || busy || detail.submission.status !== "pending") return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/kyc/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: detail.customer.id,
          action: decision.action,
          ...(decision.reasonCode ? { reasonCode: decision.reasonCode } : {}),
          ...(decision.reasonDetail ? { reasonDetail: decision.reasonDetail } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message ?? t("kyc.errors.reviewFailed"));
      await load();
      showFeedback(
        "success",
        decision.action === "approve"
          ? t("kyc.success.approved")
          : decision.action === "reject"
            ? t("kyc.success.rejected")
            : t("kyc.success.infoRequested"),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : t("kyc.errors.reviewFailed");
      setError(message);
      showFeedback("error", message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("kyc.detail.loading")}</p>;
  }

  if (notFound) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <h1 className="text-xl font-semibold text-foreground">{t("kyc.detail.notFound")}</h1>
        <Link href="/admin/kyc" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"><ArrowLeft size={16} /> {t("kyc.detail.backToQueue")}</Link>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6">
        <p role="alert" className="text-sm text-destructive">{error ?? t("kyc.errors.loadSubmissions")}</p>
        <Button className="mt-4" variant="outline" onClick={() => void load()}>{t("kyc.detail.retry")}</Button>
      </div>
    );
  }

  return (
    <KycReviewDetailContent
      detail={detail}
      busy={busy}
      error={error}
      onOpenDocument={(side) => { void openDocument(side); }}
      onDecision={(decision) => { void review(decision); }}
    />
  );
}
