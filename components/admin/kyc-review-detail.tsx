"use client";

import { useVisibleReviewRefresh } from "@/hooks/use-visible-review-refresh";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  CheckSquare,
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
  operationId?: string;
};

type ReasonAction = "reject" | "request_info";

type KycReviewDetailContentProps = {
  detail: AdminKycReviewDetail;
  busy: boolean;
  error: string | null;
  onOpenDocument: (side: "front" | "back") => void;
  documentAccessRefs?: { front?: string; back?: string };
  onDecision: (decision: KycReviewDecision) => void;
  documentPreview?: { side: "front" | "back"; url: string; pdf?: boolean } | null;
  documentLoading?: boolean;
  onCloseDocument?: () => void;
};

function statusKey(status: AdminKycSubmission["status"]) {
  return status === "info_requested" ? "infoRequested" : status;
}

export function KycReviewDetailContent({
  detail,
  busy,
  error,
  onOpenDocument,
  documentAccessRefs,
  onDecision,
  documentPreview,
  documentLoading,
  onCloseDocument,
}: KycReviewDetailContentProps) {
  const { t, i18n } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const currentDocumentAccessRefs = documentAccessRefs ?? {};
  const { customer, submission } = detail;
  const requiredDocumentSides = submission.docType === "passport" ? ["front"] as const : ["front", "back"] as const;
  const requiredDocumentRefs = requiredDocumentSides.map((side) => currentDocumentAccessRefs[side]).filter((ref): ref is string => Boolean(ref));
  const hasViewedRequiredDocuments = requiredDocumentRefs.length === requiredDocumentSides.length;
  const [reasonAction, setReasonAction] = useState<ReasonAction | null>(null);
  const [reasonCode, setReasonCode] = useState<KycReviewReasonCode | "">("");
  const [reasonDetail, setReasonDetail] = useState("");
  const [confirmDecision, setConfirmDecision] = useState<KycReviewDecision | null>(null);
  const [manualIdentity, setManualIdentity] = useState({
    actualDocumentType: submission.docType,
    issuerCountry: submission.docType === "passport" ? "" : "MY",
    identifierKind: submission.docType === "passport" ? "passport" : "my_ic",
    holderName: submission.legalIdentity.fullName ?? customer.name,
    documentNumber: "",
    reasonCode: "ocr_unavailable",
    reasonDetail: "",
    mrzLine1: "", mrzLine2: "", nationality: "CN", birthDate: "", expiryDate: "", sex: "<",
    secondaryReviewerId: "",
  });
  const [primaryConfirmed, setPrimaryConfirmed] = useState(false);
  const [secondReviewComplete, setSecondReviewComplete] = useState(false);
  const [counterSignCandidates, setCounterSignCandidates] = useState<Array<{ id: string; name: string }>>([]);
  const [counterSignCandidatesLoading, setCounterSignCandidatesLoading] = useState(false);
  const [operationId, setOperationId] = useState<string | null>(null);
  const [confirmationBusy, setConfirmationBusy] = useState(false);
  const [confirmationError, setConfirmationError] = useState<string | null>(null);
  const [confirmationPurpose, setConfirmationPurpose] = useState<"primary" | "independent_second">("primary");

  const [confirmationVersion, setConfirmationVersion] = useState<number | null>(null);
  const [resolutionId, setResolutionId] = useState<string | null>(null);
  const [resolutionState, setResolutionState] = useState<{ id: string; kind: string; status: string; version: number; primary: boolean; secondary: boolean; primaryConfirmed: boolean; secondaryConfirmed: boolean; canApply: boolean } | null>(null);
  const [resolutionKind, setResolutionKind] = useState<"replacement" | "legacy_conflict" | "ownership_correction">("legacy_conflict");
  const [resolutionCandidates, setResolutionCandidates] = useState<Array<{ id: string; name: string }>>([]);
  const [resolutionReviewerId, setResolutionReviewerId] = useState("");
  const [resolutionHolderName, setResolutionHolderName] = useState(submission.legalIdentity.fullName ?? customer.name);
  const [resolutionNumber, setResolutionNumber] = useState("");
  const [resolutionReason, setResolutionReason] = useState("");
  const [resolutionCancelReason, setResolutionCancelReason] = useState<"reviewer_declined" | "evidence_unavailable" | "case_changed" | "other">("reviewer_declined");
  const [resolutionBusy, setResolutionBusy] = useState(false);
  const [resolutionError, setResolutionError] = useState<string | null>(null);
  const resolutionStartOperationId = useRef<string | null>(null);
  const resolutionApplyOperationId = useRef<string | null>(null);
  const actionable = submission.status === "pending" && detail.assignment.canDecide;
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
    setConfirmationVersion(detail.assignment.reviewVersion);
    setConfirmDecision({
      action: reasonAction,
      reasonCode,
      ...(reasonDetail.trim() ? { reasonDetail: reasonDetail.trim() } : {}),
    });
  }

  async function loadResolutionState(id: string) {
    const response = await fetch(`/api/admin/kyc/identity-resolutions/${encodeURIComponent(id)}`, { cache: "no-store" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.data) throw new Error(body.error?.message ?? t("kyc.resolution.error"));
    setResolutionState(body.data);
    return body.data as typeof resolutionState;
  }

  async function beginIdentityResolution() {
    setResolutionBusy(true);
    setResolutionError(null);
    try {
      resolutionStartOperationId.current ??= crypto.randomUUID();
      const response = await fetch("/api/admin/kyc/identity-resolutions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: submission.id, kind: resolutionKind,
          reasonCode: resolutionKind === "replacement" ? "identity_replacement" : "legacy_resolution", operationId: resolutionStartOperationId.current }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || typeof body.data?.id !== "string") throw new Error(body.error?.message ?? t("kyc.resolution.error"));
      resolutionStartOperationId.current = null;
      setResolutionId(body.data.id);
      await loadResolutionState(body.data.id);
      const candidatesResponse = await fetch(`/api/admin/kyc/identity-resolutions/${encodeURIComponent(body.data.id)}/candidates?version=${encodeURIComponent(String(body.data.version))}`, { cache: "no-store" });
      const candidatesBody = await candidatesResponse.json().catch(() => ({}));
      if (candidatesResponse.ok && Array.isArray(candidatesBody.data?.candidates)) setResolutionCandidates(candidatesBody.data.candidates);
    } catch (caught) {
      setResolutionError(caught instanceof Error ? caught.message : t("kyc.resolution.error"));
    } finally { setResolutionBusy(false); }
  }

  async function authorizeIdentityResolution() {
    if (!resolutionId || !resolutionState || !resolutionReviewerId) return;
    setResolutionBusy(true); setResolutionError(null);
    try {
      const response = await fetch(`/api/admin/kyc/identity-resolutions/${encodeURIComponent(resolutionId)}/countersign`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: resolutionState.version, secondaryReviewerId: resolutionReviewerId }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message ?? t("kyc.resolution.error"));
      await loadResolutionState(resolutionId);
    } catch (caught) { setResolutionError(caught instanceof Error ? caught.message : t("kyc.resolution.error")); }
    finally { setResolutionBusy(false); }
  }

  async function confirmIdentityResolution() {
    if (!resolutionId || !resolutionState || !currentDocumentAccessRefs.front || !currentDocumentAccessRefs.back || !resolutionNumber.trim() || resolutionReason.trim().length < 10) return;
    setResolutionBusy(true); setResolutionError(null);
    try {
      const response = await fetch(`/api/admin/kyc/identity-resolutions/${encodeURIComponent(resolutionId)}/confirm`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: resolutionState.version, documentAccessRefs: [currentDocumentAccessRefs.front, currentDocumentAccessRefs.back],
          actualDocumentType: manualIdentity.actualDocumentType, issuerCountry: "MY", identifierKind: "my_ic", holderName: resolutionHolderName,
          documentNumber: resolutionNumber, reasonDetail: resolutionReason }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message ?? t("kyc.resolution.error"));
      setResolutionNumber("");
      await loadResolutionState(resolutionId);
    } catch (caught) { setResolutionError(caught instanceof Error ? caught.message : t("kyc.resolution.error")); }
    finally { setResolutionBusy(false); }
  }

  async function applyIdentityResolution() {
    if (!resolutionId || !resolutionState) return;
    setResolutionBusy(true); setResolutionError(null);
    try {
      resolutionApplyOperationId.current ??= crypto.randomUUID();
      const response = await fetch(`/api/admin/kyc/identity-resolutions/${encodeURIComponent(resolutionId)}/apply`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: resolutionState.version, operationId: resolutionApplyOperationId.current }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message ?? t("kyc.resolution.error"));
      await loadResolutionState(resolutionId);
      resolutionApplyOperationId.current = null;
      setResolutionNumber("");
    } catch (caught) { setResolutionError(caught instanceof Error ? caught.message : t("kyc.resolution.error")); }
    finally { setResolutionBusy(false); }
  }

  async function cancelIdentityResolution() {
    if (!resolutionId || !resolutionState || !window.confirm(t("kyc.resolution.cancelConfirm"))) return;
    setResolutionBusy(true); setResolutionError(null);
    try {
      const response = await fetch(`/api/admin/kyc/identity-resolutions/${encodeURIComponent(resolutionId)}/cancel`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: resolutionState.version, reasonCode: resolutionCancelReason }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message ?? t("kyc.resolution.error"));
      await loadResolutionState(resolutionId);
    } catch (caught) { setResolutionError(caught instanceof Error ? caught.message : t("kyc.resolution.error")); }
    finally { setResolutionBusy(false); }
  }

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/admin/kyc/identity-resolutions?submissionId=${encodeURIComponent(submission.id)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => ({ response, body: await response.json().catch(() => ({})) }))
      .then(async ({ response, body }) => {
        if (!response.ok || typeof body.data?.id !== "string") return;
        setResolutionId(body.data.id);
        setResolutionState(body.data);
        if (body.data.primary === true && body.data.status === "open") {
          const candidateResponse = await fetch(`/api/admin/kyc/identity-resolutions/${encodeURIComponent(body.data.id)}/candidates?version=${encodeURIComponent(String(body.data.version))}`, { cache: "no-store", signal: controller.signal });
          const candidateBody = await candidateResponse.json().catch(() => ({}));
          if (candidateResponse.ok && Array.isArray(candidateBody.data?.candidates)) setResolutionCandidates(candidateBody.data.candidates);
        }
      }).catch(() => undefined);
    return () => controller.abort();
  }, [submission.id]);

  function manualPassportPayload() {
    return manualIdentity.actualDocumentType === "passport" ? { passport: {
      mrzLine1: manualIdentity.mrzLine1, mrzLine2: manualIdentity.mrzLine2, nationality: manualIdentity.nationality,
      birthDate: manualIdentity.birthDate, expiryDate: manualIdentity.expiryDate, sex: manualIdentity.sex,
    } } : {};
  }

  async function submitConfirmedDecision() {
    if (!confirmDecision || (confirmationPurpose === "primary" && !actionable) || confirmationVersion !== detail.assignment.reviewVersion) return;
    if (confirmDecision.action === "approve") {
      if (!hasViewedRequiredDocuments) {
        setConfirmationError(t("kyc.confirm.openBothDocuments"));
        return;
      }
      if (confirmationPurpose === "independent_second") {
        setConfirmationBusy(true);
        setConfirmationError(null);
        try {
          const proofResponse = await fetch("/api/admin/kyc/review/confirm", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              submissionId: submission.id,
              expectedVersion: detail.assignment.reviewVersion,
              purpose: "independent_second",
              documentAccessRefs: requiredDocumentRefs,
              actualDocumentType: manualIdentity.actualDocumentType,
              issuerCountry: manualIdentity.issuerCountry,
              identifierKind: manualIdentity.identifierKind,
              holderName: manualIdentity.holderName,
              documentNumber: manualIdentity.documentNumber,
              reasonCode: manualIdentity.reasonCode,
              ...(manualIdentity.reasonCode === "ocr_transcription_error" ? { reasonDetail: manualIdentity.reasonDetail } : {}),
              ...manualPassportPayload(),
            }),
          });
          const proofBody = await proofResponse.json().catch(() => ({}));
          if (!proofResponse.ok || proofBody.data?.confirmed !== true) throw new Error(proofBody.error?.message ?? t("kyc.errors.reviewFailed"));
          setManualIdentity((value) => ({ ...value, documentNumber: "", mrzLine1: "", mrzLine2: "", birthDate: "" }));
          setConfirmationError(t("kyc.confirm.secondReviewRecorded"));
        } catch (reason) {
          setConfirmationError(reason instanceof Error ? reason.message : t("kyc.errors.reviewFailed"));
        } finally {
          setConfirmationBusy(false);
        }
        return;
      }
      if (!primaryConfirmed) {
        if (!manualIdentity.secondaryReviewerId) {
          setConfirmationError(t("kyc.confirm.secondaryReviewerRequired"));
          return;
        }
        setConfirmationBusy(true);
        setConfirmationError(null);
        try {
          const countersignResponse = await fetch("/api/admin/kyc/review/countersign", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              submissionId: submission.id,
              expectedVersion: detail.assignment.reviewVersion,
              secondaryReviewerId: manualIdentity.secondaryReviewerId,
            }),
          });
          const countersignBody = await countersignResponse.json().catch(() => ({}));
          if (!countersignResponse.ok) throw new Error(countersignBody.error?.message ?? t("kyc.errors.reviewFailed"));
          const proofResponse = await fetch("/api/admin/kyc/review/confirm", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              submissionId: submission.id,
              expectedVersion: detail.assignment.reviewVersion,
              documentAccessRefs: requiredDocumentRefs,
              actualDocumentType: manualIdentity.actualDocumentType,
              issuerCountry: manualIdentity.issuerCountry,
              identifierKind: manualIdentity.identifierKind,
              holderName: manualIdentity.holderName,
              documentNumber: manualIdentity.documentNumber,
              reasonCode: manualIdentity.reasonCode,
              ...(manualIdentity.reasonCode === "ocr_transcription_error" ? { reasonDetail: manualIdentity.reasonDetail } : {}),
              ...manualPassportPayload(),
            }),
          });
          const proofBody = await proofResponse.json().catch(() => ({}));
          if (!proofResponse.ok || proofBody.data?.confirmed !== true) throw new Error(proofBody.error?.message ?? t("kyc.errors.reviewFailed"));
          setPrimaryConfirmed(true);
          setSecondReviewComplete(false);
          setManualIdentity((value) => ({ ...value, documentNumber: "", mrzLine1: "", mrzLine2: "", birthDate: "" }));
        } catch (reason) {
          setConfirmationError(reason instanceof Error ? reason.message : t("kyc.errors.reviewFailed"));
        } finally {
          setConfirmationBusy(false);
        }
        return;
      }
      const stableOperationId = operationId ?? crypto.randomUUID();
      setOperationId(stableOperationId);
      onDecision({ ...confirmDecision, operationId: stableOperationId });
    } else {
      onDecision(confirmDecision);
    }
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

  useEffect(() => {
    if (confirmDecision?.action !== "approve" || confirmationPurpose !== "primary") return;
    const controller = new AbortController();
    void fetch(`/api/admin/kyc/review/countersign/candidates?submissionId=${encodeURIComponent(submission.id)}&expectedVersion=${detail.assignment.reviewVersion}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error?.message ?? t("kyc.errors.reviewFailed"));
        const reviewers = body.data?.reviewers;
        setCounterSignCandidates(Array.isArray(reviewers) ? reviewers.filter((item: unknown): item is { id: string; name: string } =>
          Boolean(item && typeof item === "object" && "id" in item && typeof item.id === "string" && "name" in item && typeof item.name === "string")) : []);
        setPrimaryConfirmed(body.data?.primaryConfirmed === true);
        setSecondReviewComplete(body.data?.secondReviewComplete === true);
      })
      .catch(() => { if (!controller.signal.aborted) setCounterSignCandidates([]); })
      .finally(() => { if (!controller.signal.aborted) setCounterSignCandidatesLoading(false); });
    return () => controller.abort();
  }, [confirmDecision?.action, confirmationPurpose, submission.id, detail.assignment.reviewVersion, t]);

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
                  {t("kyc.detail.openDocument", { side: t(`kyc.detail.${side}`) })}
                </Button>
              ))}
            </div>
            {documentLoading && <p role="status" className="mt-4 text-sm text-muted-foreground">{t("kyc.detail.loading")}</p>}
            {documentPreview && <div className="mt-4 space-y-3">
              {documentPreview.pdf ? <div className="space-y-2">
                <p className="text-sm text-muted-foreground">{t("kyc.detail.pdfNote")}</p>
                <Button asChild variant="outline" size="sm"><a href={documentPreview.url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{t("kyc.detail.openPdf")}</a></Button>
              </div> : <>
                {/* Authenticated bytes only; never send private evidence to an optimizer. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={documentPreview.url} alt={t("kyc.detail.previewAlt", { side: t(`kyc.detail.${documentPreview.side}`) })} className="max-h-[60dvh] w-full rounded-lg border border-border object-contain" />
              </>}
              <Button variant="outline" size="sm" onClick={onCloseDocument}>{t("kyc.detail.closePreview")}</Button>
            </div>}
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
                  {submission.docType === "passport" && <>
                    <p className="text-muted-foreground">{t("kyc.ocr.passportCountry", { issuer: submission.ocr.issuerCountry ?? t("kyc.fallback.notAvailable"), nationality: submission.ocr.nationality ?? t("kyc.fallback.notAvailable") })}</p>
                    <p className="text-muted-foreground">{t("kyc.ocr.mrzStatus", { status: submission.ocr.mrzStatus ?? t("kyc.fallback.notAvailable"), comparison: submission.ocr.visualComparisonStatus ?? t("kyc.fallback.notAvailable") })}</p>
                  </>}
                  {submission.ocr.mismatchFields.length > 0 ? (
                    <p className="mt-1 flex items-start gap-1 text-destructive">
                      <FileWarning size={14} className="mt-0.5 shrink-0" />
                      {t("kyc.ocr.mismatch", { fields: submission.ocr.mismatchFields.map((field) => {
                        const issueKey = `kyc.ocr.issueCodes.${field}`;
                        return i18n.exists(issueKey, { ns: "admin" }) ? t(issueKey) : t("kyc.ocr.issueCodes.unknown");
                      }).join(", ") })}
                    </p>
                  ) : submission.ocr.status === "matched" && (submission.docType !== "passport" || submission.ocr.visualComparisonStatus === "consistent") ? (
                    <p className="mt-1 text-primary">{t("kyc.ocr.noMismatch")}</p>
                  ) : <p className="mt-1 text-muted-foreground">{t("kyc.ocr.reviewRequired")}</p>}
                </div>
              </div>
            ) : <p className="mt-3 text-sm text-muted-foreground">{t("kyc.detail.noAutomatedChecks")}</p>}
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-semibold text-foreground">{t("kyc.detail.identitySnapshot")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("kyc.detail.identitySnapshotDescription")}</p>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div className="min-w-0"><dt className="text-muted-foreground">{t("kyc.detail.legalName")}</dt><dd className="mt-1 break-words font-medium text-foreground">{submission.legalIdentity.fullName ?? "—"}</dd></div>
              <div className="min-w-0"><dt className="text-muted-foreground">{t("kyc.detail.snapshotEmail")}</dt><dd className="mt-1 break-all font-medium text-foreground">{submission.legalIdentity.email ?? "—"}</dd></div>
              <div className="min-w-0"><dt className="text-muted-foreground">{t("kyc.detail.snapshotPhone")}</dt><dd className="mt-1 break-all font-medium text-foreground">{submission.legalIdentity.phone ?? "—"}</dd></div>
            </dl>
          </section>
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-semibold text-foreground">{t("kyc.operations.precheck")}</h2>
            <p className="mt-2 text-sm">{t(`kyc.operations.precheckStatus.${submission.precheck?.status ?? "none"}`)}</p>
            {submission.precheck?.outcome && <p className="mt-2 text-sm">{t(`kyc.operations.precheckOutcome.${submission.precheck.outcome}`)}</p>}
            <p className="mt-2 text-xs text-muted-foreground">{t("kyc.operations.precheckNote")}</p>
          </section>
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-semibold text-foreground">{t("kyc.detail.submission")}</h2>
            <dl className="mt-4 space-y-3 text-sm">
              <div><dt className="text-muted-foreground">{t("kyc.detail.documentType")}</dt><dd className="mt-1 font-medium text-foreground">{t(`kyc.documents.${submission.docType}`)}</dd></div>
              <div><dt className="text-muted-foreground">{t("kyc.detail.submittedAt")}</dt><dd className="mt-1 font-medium text-foreground">{submittedAt}</dd></div>
              <div><dt className="text-muted-foreground">{t("kyc.detail.queuePosition")}</dt><dd className="mt-1 font-medium text-foreground">{submission.queuePosition ?? "—"}</dd></div>
            </dl>
          </section>

          {(actionable || Boolean(resolutionState)) && submission.docType !== "passport" && <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="font-semibold text-foreground">{t("kyc.resolution.title")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("kyc.resolution.description")}</p>
            {(!resolutionState || resolutionState.status === "cancelled") && actionable && <div className="mt-4 space-y-3">
              <label className="block text-xs">{t("kyc.resolution.kind")}
                <select value={resolutionKind} onChange={(event) => setResolutionKind(event.target.value as typeof resolutionKind)} className={`${adminFilterControlClassName} mt-1 w-full`}>
                  <option value="legacy_conflict">{t("kyc.resolution.legacyConflict")}</option>
                  <option value="ownership_correction">{t("kyc.resolution.ownershipCorrection")}</option>
                  <option value="replacement">{t("kyc.resolution.replacement")}</option>
                </select>
              </label>
              <Button variant="outline" disabled={busy || resolutionBusy} onClick={beginIdentityResolution}>{t("kyc.resolution.start")}</Button>
            </div>}
            {resolutionState && <div className="mt-4 space-y-3">
              <p className="text-sm">{t("kyc.resolution.status", { status: t(`kyc.resolution.statuses.${resolutionState.status}`) })}</p>
              {resolutionState.status === "open" && resolutionState.primary && <div className="space-y-3">
                <label className="block text-xs">{t("kyc.resolution.secondReviewer")}
                  <select value={resolutionReviewerId} onChange={(event) => setResolutionReviewerId(event.target.value)} className={`${adminFilterControlClassName} mt-1 w-full`}>
                    <option value="">{t("kyc.resolution.selectReviewer")}</option>
                    {resolutionCandidates.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.name}</option>)}
                  </select>
                </label>
                <Button variant="outline" disabled={busy || resolutionBusy || !resolutionReviewerId} onClick={authorizeIdentityResolution}>{t("kyc.resolution.assignSecond")}</Button>
              </div>}
              {resolutionState.status === "second_review" && <div className="space-y-3">
                <p className="text-xs text-muted-foreground">{t("kyc.resolution.evidenceHint")}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => onOpenDocument("front")}>{t("kyc.detail.openDocument", { side: t("kyc.detail.front") })}</Button>
                  <Button size="sm" variant="outline" onClick={() => onOpenDocument("back")}>{t("kyc.detail.openDocument", { side: t("kyc.detail.back") })}</Button>
                </div>
                <p className="text-xs text-muted-foreground">{t("kyc.resolution.documentsViewed", { count: Number(Boolean(currentDocumentAccessRefs.front)) + Number(Boolean(currentDocumentAccessRefs.back)) })}</p>
                <label className="block text-xs">{t("kyc.confirm.actualType")}
                  <select value={manualIdentity.actualDocumentType === "national_id" || manualIdentity.actualDocumentType === "driving_license" ? manualIdentity.actualDocumentType : "national_id"}
                    onChange={(event) => setManualIdentity((value) => ({ ...value, actualDocumentType: event.target.value as "national_id" | "driving_license" }))} className={`${adminFilterControlClassName} mt-1 w-full`}>
                    <option value="national_id">{t("kyc.documents.national_id")}</option><option value="driving_license">{t("kyc.documents.driving_license")}</option>
                  </select>
                </label>
                <label className="block text-xs">{t("kyc.confirm.holderName")}
                  <input value={resolutionHolderName} onChange={(event) => setResolutionHolderName(event.target.value)} maxLength={100} autoComplete="off" className={`${adminFilterControlClassName} mt-1 w-full`} />
                </label>
                <label className="block text-xs">{t("kyc.confirm.documentNumber")}
                  <input value={resolutionNumber} onChange={(event) => setResolutionNumber(event.target.value)} maxLength={32} autoComplete="off" className={`${adminFilterControlClassName} mt-1 w-full`} />
                </label>
                <label className="block text-xs">{t("kyc.resolution.reason")}
                  <textarea value={resolutionReason} onChange={(event) => setResolutionReason(event.target.value)} maxLength={500} rows={3} className={`${adminFilterControlClassName} mt-1 w-full`} />
                </label>
                <Button variant="outline" disabled={busy || resolutionBusy || !currentDocumentAccessRefs.front || !currentDocumentAccessRefs.back || resolutionReason.trim().length < 10 || resolutionNumber.trim().length < 6}
                  onClick={confirmIdentityResolution}>{t("kyc.resolution.confirmEvidence")}</Button>
                <p className="text-xs text-muted-foreground">{t("kyc.resolution.confirmations", { primary: resolutionState.primaryConfirmed ? t("kyc.resolution.confirmed") : t("kyc.resolution.pending"), secondary: resolutionState.secondaryConfirmed ? t("kyc.resolution.confirmed") : t("kyc.resolution.pending") })}</p>
                {resolutionState.primary && resolutionState.canApply && <Button disabled={busy || resolutionBusy} onClick={applyIdentityResolution}>{t("kyc.resolution.apply")}</Button>}
              </div>}
              {resolutionState.status === "applied" && <p role="status" className="text-sm text-muted-foreground">{t(resolutionState.kind === "replacement" ? "kyc.resolution.appliedNote" : "kyc.resolution.conflictHeldNote")}</p>}
              {resolutionState.status === "cancelled" && <p role="status" className="text-sm text-muted-foreground">{t("kyc.resolution.cancelledNote")}</p>}
              {resolutionState.primary && ["open", "evidence_required", "second_review"].includes(resolutionState.status) && <div className="space-y-2">
                <label className="block text-xs">{t("kyc.resolution.cancelReason")}
                  <select value={resolutionCancelReason} onChange={(event) => setResolutionCancelReason(event.target.value as typeof resolutionCancelReason)} className={`${adminFilterControlClassName} mt-1 w-full`}>
                    <option value="reviewer_declined">{t("kyc.resolution.cancelReasons.reviewer_declined")}</option>
                    <option value="evidence_unavailable">{t("kyc.resolution.cancelReasons.evidence_unavailable")}</option>
                    <option value="case_changed">{t("kyc.resolution.cancelReasons.case_changed")}</option>
                    <option value="other">{t("kyc.resolution.cancelReasons.other")}</option>
                  </select>
                </label>
                <Button variant="outline" disabled={busy || resolutionBusy} onClick={() => void cancelIdentityResolution()}>{t("kyc.resolution.cancel")}</Button>
              </div>}
            </div>}
            {resolutionError && <p role="alert" className="mt-3 text-xs text-destructive">{resolutionError}</p>}
          </section>}

          {submission.status === "pending" && !detail.assignment.canDecide ? (
            <section className="rounded-2xl border border-border bg-muted/50 p-5">
              <h2 className="font-semibold text-foreground">{t("kyc.detail.assignedElsewhere")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("kyc.detail.assignedElsewhereDescription")}</p>
              <Button className="mt-4" variant="outline" disabled={busy} onClick={() => {
                setConfirmationPurpose("independent_second");
                setConfirmationError(null);
                setConfirmationVersion(detail.assignment.reviewVersion);
                setCounterSignCandidatesLoading(true);
                setConfirmDecision({ action: "approve" });
              }}>{t("kyc.confirm.independentReview")}</Button>
            </section>
          ) : actionable ? (
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="font-semibold text-foreground">{t("kyc.detail.decision")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("kyc.detail.decisionDescription")}</p>
              <div className="mt-4 grid gap-2">
                <Button disabled={busy} onClick={() => { setConfirmationVersion(detail.assignment.reviewVersion); setCounterSignCandidatesLoading(true); setConfirmDecision({ action: "approve" }); }}><CheckSquare size={14} /> {t("kyc.detail.approve")}</Button>
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

      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold text-foreground">{t("kyc.detail.reviewHistory")}</h2>
        {detail.reviewEvents.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("kyc.detail.noReviewHistory")}</p>
        ) : (
          <ol className="mt-4 space-y-3">
            {detail.reviewEvents.map((event) => (
              <li key={event.id} className="rounded-xl border border-border bg-secondary/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">{t(`kyc.actions.${event.action}`)}</p>
                  <time className="text-xs text-muted-foreground">{new Date(event.createdAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</time>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{event.fromStatus} → {event.toStatus} · {event.actorRole}</p>
                {event.customerMessage && <p className="mt-2 text-sm text-foreground">{event.customerMessage}</p>}
                {event.internalNote && <p className="mt-1 text-xs text-muted-foreground">{event.internalNote}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <AdminConfirmDialog
        open={Boolean(confirmDecision) && (actionable || confirmationPurpose === "independent_second") && confirmationVersion === detail.assignment.reviewVersion}
        title={confirmTitle}
        description={confirmDescription}
        confirmLabel={confirmLabel}
        confirmVariant={confirmDecision?.action === "reject" ? "destructive" : "default"}
        busy={busy || confirmationBusy}
        onCancel={() => { setConfirmDecision(null); setConfirmationError(null); setManualIdentity((value) => ({ ...value, documentNumber: "", mrzLine1: "", mrzLine2: "", birthDate: "" })); }}
        onConfirm={submitConfirmedDecision}
        content={confirmDecision?.action === "approve" ? <div className="mt-4 space-y-3">
          <p className="text-xs text-muted-foreground">{t(confirmationPurpose === "primary" ? "kyc.confirm.identityEvidenceHint" : "kyc.confirm.independentEvidenceHint")}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs">{t("kyc.confirm.actualType")}
              <select value={manualIdentity.actualDocumentType} onChange={(event) => setManualIdentity((value) => ({ ...value, actualDocumentType: event.target.value as typeof value.actualDocumentType, identifierKind: event.target.value === "passport" ? "passport" : "my_ic", issuerCountry: event.target.value === "passport" ? "" : "MY" }))} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm">
                <option value="national_id">{t("kyc.documents.national_id")}</option><option value="driving_license">{t("kyc.documents.driving_license")}</option><option value="passport">{t("kyc.documents.passport")}</option>
              </select>
            </label>
            {manualIdentity.reasonCode === "ocr_transcription_error" && <label className="text-xs sm:col-span-2">{t("kyc.confirm.transcriptionCorrection")}
              <textarea value={manualIdentity.reasonDetail} maxLength={500} onChange={(event) => setManualIdentity((value) => ({ ...value, reasonDetail: event.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm" rows={2} />
            </label>}
            <label className="text-xs">{t("kyc.confirm.issuerCountry")}
              <input value={manualIdentity.issuerCountry} maxLength={2} onChange={(event) => setManualIdentity((value) => ({ ...value, issuerCountry: event.target.value.toUpperCase() }))} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm" autoComplete="off" />
            </label>
            <label className="text-xs sm:col-span-2">{t("kyc.confirm.holderName")}
              <input value={manualIdentity.holderName} maxLength={100} onChange={(event) => setManualIdentity((value) => ({ ...value, holderName: event.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm" autoComplete="off" />
            </label>
            <label className="text-xs sm:col-span-2">{t("kyc.confirm.documentNumber")}
              <input value={manualIdentity.documentNumber} maxLength={32} onChange={(event) => setManualIdentity((value) => ({ ...value, documentNumber: event.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm" autoComplete="off" inputMode="text" />
            </label>
            <label className="text-xs sm:col-span-2">{t("kyc.confirm.manualReason")}
              <select value={manualIdentity.reasonCode} onChange={(event) => setManualIdentity((value) => ({ ...value, reasonCode: event.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm">
                <option value="ocr_number_mismatch">{t("kyc.confirm.numberMismatch")}</option>
                <option value="ocr_name_mismatch">{t("kyc.confirm.nameMismatch")}</option>
                <option value="ocr_unavailable">{t("kyc.confirm.ocrUnavailable")}</option>
                <option value="ocr_unreadable">{t("kyc.confirm.ocrUnreadable")}</option>
                <option value="ocr_source_unavailable">{t("kyc.confirm.ocrSourceUnavailable")}</option>
                <option value="ocr_viz_incomplete">{t("kyc.confirm.ocrVisibleFieldsIncomplete")}</option>
                <option value="ocr_transcription_error">{t("kyc.confirm.ocrTranscriptionError")}</option>
              </select>
            </label>
            {manualIdentity.actualDocumentType === "passport" && <>
              <label className="text-xs">{t("kyc.confirm.nationality")}
                <input value={manualIdentity.nationality} maxLength={2} onChange={(event) => setManualIdentity((value) => ({ ...value, nationality: event.target.value.toUpperCase() }))} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm" />
              </label>
              <label className="text-xs">{t("kyc.confirm.birthDate")}
                <input type="date" value={manualIdentity.birthDate} onChange={(event) => setManualIdentity((value) => ({ ...value, birthDate: event.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm" />
              </label>
              <label className="text-xs">{t("kyc.confirm.expiryDate")}
                <input type="date" value={manualIdentity.expiryDate} onChange={(event) => setManualIdentity((value) => ({ ...value, expiryDate: event.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm" />
              </label>
              <label className="text-xs">{t("kyc.confirm.sex")}
                <select value={manualIdentity.sex} onChange={(event) => setManualIdentity((value) => ({ ...value, sex: event.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm"><option value="M">M</option><option value="F">F</option><option value="<">&lt;</option></select>
              </label>
              <label className="text-xs sm:col-span-2">{t("kyc.confirm.mrzLine1")}
                <input value={manualIdentity.mrzLine1} maxLength={44} onChange={(event) => setManualIdentity((value) => ({ ...value, mrzLine1: event.target.value.toUpperCase() }))} className="mt-1 w-full font-mono rounded-lg border border-border bg-background px-2 py-2 text-sm" autoComplete="off" />
              </label>
              <label className="text-xs sm:col-span-2">{t("kyc.confirm.mrzLine2")}
                <input value={manualIdentity.mrzLine2} maxLength={44} onChange={(event) => setManualIdentity((value) => ({ ...value, mrzLine2: event.target.value.toUpperCase() }))} className="mt-1 w-full font-mono rounded-lg border border-border bg-background px-2 py-2 text-sm" autoComplete="off" />
              </label>
            </>}
            {confirmationPurpose === "primary" && !primaryConfirmed && <label className="text-xs sm:col-span-2">{t("kyc.confirm.secondaryReviewer")}
              <select value={manualIdentity.secondaryReviewerId} onChange={(event) => setManualIdentity((value) => ({ ...value, secondaryReviewerId: event.target.value }))} className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-2 text-sm" disabled={counterSignCandidatesLoading || counterSignCandidates.length === 0}>
                <option value="">{counterSignCandidatesLoading ? t("kyc.confirm.loadingReviewers") : t("kyc.confirm.selectReviewer")}</option>
                {counterSignCandidates.map((reviewer) => <option key={reviewer.id} value={reviewer.id}>{reviewer.name}</option>)}
              </select>
            </label>}
          </div>
          {confirmationError && <p role="alert" className="text-xs text-destructive">{confirmationError}</p>}
          {confirmationPurpose === "primary" && primaryConfirmed && <p className="text-xs text-muted-foreground">{t(secondReviewComplete ? "kyc.confirm.secondReviewReady" : "kyc.confirm.waitingForSecondReview")}</p>}
        </div> : undefined}
      />
    </>
  );
}

export function KycReviewDetail({ submissionId }: { submissionId: string }) {
  const router = useRouter();
  const { t } = useTranslation("admin");
  const { showFeedback } = useActionFeedback();
  const [detail, setDetail] = useState<AdminKycReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [continueNext, setContinueNext] = useState(false);
  const workSequence = useRef(0);

  const [documentPreview, setDocumentPreview] = useState<{ side: "front" | "back"; url: string; pdf?: boolean; submissionId: string } | null>(null);
  const [documentAccessRefs, setDocumentAccessRefs] = useState<{ front?: string; back?: string }>({});
  const [documentLoading, setDocumentLoading] = useState(false);
  const documentResource = useRef<{ url: string | null; request: AbortController | null; epoch: number }>({ url: null, request: null, epoch: 0 });
  const disposeDocument = useCallback(() => {
    const resource = documentResource.current;
    resource.epoch += 1;
    resource.request?.abort();
    resource.request = null;
    if (resource.url) URL.revokeObjectURL(resource.url);
    resource.url = null;
  }, []);
  const clearDocument = useCallback(() => {
    disposeDocument();
    setDocumentPreview(null);
    setDocumentLoading(false);
  }, [disposeDocument]);
  const handlePermissionFailure = useCallback((status: number, code?: string) => {
    if (status !== 401 && status !== 403 && code !== "KYC_MFA_REQUIRED") return false;
    clearDocument();
    setDetail(null);
    setRecording(false);
    router.replace(code === "KYC_MFA_REQUIRED" ? `/admin/kyc/mfa?next=${encodeURIComponent(`/admin/kyc/${submissionId}`)}` : "/admin/kyc");
    return true;
  }, [clearDocument, router, submissionId]);
  useEffect(() => {
    const hide = () => { if (document.visibilityState !== "visible") clearDocument(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", clearDocument);
    return () => {
      disposeDocument();
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", clearDocument);
    };
  }, [submissionId, clearDocument, disposeDocument]);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!signal) setLoading(true);
    try {
      const response = await fetch(`/api/admin/kyc/submissions/${submissionId}${signal ? "?refresh=1" : ""}`, { cache: "no-store", signal });
      const body = await response.json().catch(() => ({}));
      if (handlePermissionFailure(response.status, body?.error?.code)) { if (signal) throw Object.assign(new Error(t("reviewRefresh.denied")), { status: response.status }); return; }
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
      if (signal) throw err;
    } finally {
      if (!signal) setLoading(false);
    }
  }, [submissionId, t, handlePermissionFailure]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const reviewRefresh = useVisibleReviewRefresh({ enabled: true, onRefresh: load });

  async function openDocument(side: "front" | "back") {
    if (!detail || detail.submission.id !== submissionId) return;
    clearDocument();
    const resource = documentResource.current;
    const epoch = resource.epoch;
    const controller = new AbortController();
    resource.request = controller;
    setDocumentLoading(true);
    try {
      const response = await fetch(`/api/admin/kyc/documents/${submissionId}/${side}`, { cache: "no-store", signal: controller.signal });
      if (epoch !== resource.epoch) return;
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (handlePermissionFailure(response.status, body?.error?.code)) return;
        throw new Error(t("kyc.errors.loadDocument"));
      }
      const accessId = response.headers.get("x-kyc-document-access-id");
      if (accessId) setDocumentAccessRefs((value) => ({ ...value, [side]: accessId }));
      if (response.headers.get("content-type")?.split(";")[0] === "application/pdf") {
        await response.body?.cancel();
        if (epoch !== resource.epoch || controller.signal.aborted) return;
        // Legacy PDFs retain a browser viewer via a fresh authenticated request.
        // The URL is this guarded API, never a Storage or signed URL.
        setDocumentPreview({ side, url: `/api/admin/kyc/documents/${submissionId}/${side}`, pdf: true, submissionId });
        return;
      }
      const blob = await response.blob();
      if (epoch !== resource.epoch || controller.signal.aborted) return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(blob.type) || blob.size > 5 * 1024 * 1024) throw new Error(t("kyc.errors.loadDocument"));
      const url = URL.createObjectURL(blob);
      resource.url = url;
      setDocumentPreview({ side, url, submissionId });
    } catch {
      if (epoch !== resource.epoch || controller.signal.aborted) return;
      clearDocument();
      setError(t("kyc.errors.loadDocument"));
      showFeedback("error", t("kyc.errors.loadDocument"));
    } finally {
      if (epoch === resource.epoch) setDocumentLoading(false);
    }
  }

  async function review(decision: KycReviewDecision) {
    if (!detail || busy || detail.submission.status !== "pending") return;
    clearDocument();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/kyc/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionId: detail.submission.id,
          userId: detail.customer.id,
          expectedVersion: detail.assignment.reviewVersion,
          action: decision.action,
          ...(decision.reasonCode ? { reasonCode: decision.reasonCode } : {}),
          ...(decision.reasonDetail ? { reasonDetail: decision.reasonDetail } : {}),
          ...(decision.operationId ? { operationId: decision.operationId } : {}),
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (handlePermissionFailure(response.status, body?.error?.code)) return;
      if (response.status === 409) {
        // Refresh in place so the review form retains its draft after a conflict.
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 15_000);
        try { await load(controller.signal); }
        finally { window.clearTimeout(timeout); }
      }
      if (!response.ok) throw new Error(body.error?.message ?? t("kyc.errors.reviewFailed"));
      setRecording(false);
      await load();
      if (continueNext) await work("next");
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

  async function work(action: "next" | "release" | "start" | "pause") {
    if (action === "next" || action === "release") clearDocument();
    setBusy(true);
    const sequence = ++workSequence.current;
    try {
      const response = await fetch("/api/admin/kyc/work", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...(action === "next" ? {} : { submissionId, expectedVersion: detail?.assignment.reviewVersion, ...(action === "pause" ? { sessionId } : {}) }) }) });
      const body = await response.json().catch(() => ({}));
      if (handlePermissionFailure(response.status, body?.error?.code)) return;
      if (!response.ok) throw new Error(t("kyc.operations.workFailed"));
      if (action === "next") router.push(body.data?.submissionId ? `/admin/kyc/${body.data.submissionId}` : "/admin/kyc");
      else if (action === "release") router.push("/admin/kyc");
      else if (sequence === workSequence.current) { setSessionId(body.data.sessionId ?? null); setRecording(action === "start"); }
    } catch { setError(t("kyc.operations.workFailed")); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!recording || !sessionId) return;
    const pause = () => {
      ++workSequence.current;
      setRecording(false);
      void fetch("/api/admin/kyc/work", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause", submissionId, sessionId, expectedVersion: detail?.assignment.reviewVersion }) }).then(async (response) => {
          if (response.status === 401 || response.status === 403) {
            const body = await response.json().catch(() => ({}));
            handlePermissionFailure(response.status, body?.error?.code);
            return;
          }
          if (!response.ok) setError(t("kyc.operations.recordingInterrupted"));
        }).catch(() => setError(t("kyc.operations.recordingInterrupted")));
    };
    const hide = () => { if (document.visibilityState !== "visible") pause(); };
    window.addEventListener("blur", pause);
    window.addEventListener("pagehide", pause);
    document.addEventListener("visibilitychange", hide);
    return () => {
      window.removeEventListener("blur", pause); window.removeEventListener("pagehide", pause);
      document.removeEventListener("visibilitychange", hide);
      // Closing/navigation may fail to reach the server. Unclosed intervals are
      // explicitly excluded from completed timing statistics.
      void fetch("/api/admin/kyc/work", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "pause", submissionId, sessionId, expectedVersion: detail?.assignment.reviewVersion }) }).catch(() => undefined);
    };
  }, [recording, sessionId, submissionId, detail?.assignment.reviewVersion, t, handlePermissionFailure]);

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
    <>
      <div className="col-span-full flex flex-wrap items-center gap-3 py-2 text-xs text-muted-foreground"><Button type="button" size="sm" variant="outline" onClick={reviewRefresh.refresh}>{t("actions.refresh")}</Button><span role="status">{reviewRefresh.hasRefreshError ? t("reviewRefresh.stale") : t("dashboard.lastRefreshed")} · {reviewRefresh.lastSuccessAt ? new Date(reviewRefresh.lastSuccessAt).toLocaleTimeString() : "—"}</span></div>
      <section className="mb-5 space-y-3 rounded-2xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-2">
          {detail.assignment.isAssignedToCurrentUser && detail.submission.status === "pending" && <>
            <Button variant="outline" disabled={busy} onClick={() => void work(recording ? "pause" : "start")}>{t(recording ? "kyc.operations.pause" : "kyc.operations.start")}</Button>
          </>}
          {detail.assignment.canDecide && detail.submission.status === "pending" && <Button variant="outline" disabled={busy} onClick={() => void work("release")}>{t("kyc.operations.release")}</Button>}
          {detail.submission.status !== "pending" && <Button disabled={busy} onClick={() => void work("next")}>{t("kyc.operations.next")}</Button>}
        </div>
        <p role="status" className="text-xs text-muted-foreground">{t(recording ? "kyc.operations.recording" : "kyc.operations.notRecording")}</p>
        {detail.assignment.canDecide && detail.submission.status === "pending" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={continueNext} onChange={(event) => setContinueNext(event.target.checked)} />{t("kyc.operations.continueNext")}</label>}
      </section>
      <KycReviewDetailContent
      detail={detail}
      documentPreview={documentPreview?.submissionId === submissionId ? documentPreview : null}
      documentLoading={documentLoading}
      onCloseDocument={clearDocument}
      busy={busy}
      error={error}
      onOpenDocument={(side) => { void openDocument(side); }}
      documentAccessRefs={documentAccessRefs}
      onDecision={(decision) => { void review(decision); }}
      />
    </>
  );
}
