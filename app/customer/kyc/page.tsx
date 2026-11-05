"use client";

import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ShieldCheck, Upload, CheckCircle2, Clock, FileCheck2,
  Info, AlertTriangle, ArrowLeft,
} from "lucide-react";
import Link from "next/link";
import { BackLink } from "@/components/shared/back-link";
import { z } from "zod";
import { useAuth } from "@/components/providers/auth";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { CustomerPageShell, CustomerPageTitle } from "@/components/customer/customer-page-shell";
import { validateKycFile, KYC_ACCEPTED_TYPES } from "@/backend/domains/identity";
import { KycPhotoPreview } from "@/components/customer/kyc-photo-preview";
import { Button } from "@/components/ui/button";
import type { CustomerKycSubmission } from "@/backend/core/types";
import { useSearchParams } from "next/navigation";
import { GuestAccountEmptyState } from "@/components/customer/guest-account-empty-state";
import { postLoginPath } from "@/lib/auth/guest-mode";
import { ApiErrorNotice } from "@/components/shared/api-error-notice";
import { compareKycDraftValues } from "@/lib/kyc/draft-client";

const IC_PATTERNS: Record<string, { regex: RegExp; hintKey: string }> = {
  national_id:     { regex: /^\d{6}-?\d{2}-?\d{4}$/, hintKey: "ui.kyc.myKadHint" },
  driving_license: { regex: /^\d{6}-?\d{2}-?\d{4}$/, hintKey: "ui.kyc.drivingLicenseHint" },
  passport:        { regex: /^[A-Z]{1,2}[0-9]{6,8}$/, hintKey: "ui.kyc.passportHint" },
};

function createKycSchema(t: TFunction<"customer">) {
  return z.object({
    icNumber: z.string().min(1, t("ui.kyc.idRequired")),
    docType:  z.enum(["national_id", "passport", "driving_license"]),
  }).superRefine((val, ctx) => {
    const pattern = IC_PATTERNS[val.docType];
    if (pattern && !pattern.regex.test(val.icNumber.toUpperCase())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["icNumber"], message: t(pattern.hintKey) });
    }
  });
}
function localizedKycFileError(file: File | null, t: TFunction<"customer">): string | null {
  const error = validateKycFile(file);
  if (!error) return null;
  if (!file) return t("ui.kyc.uploadRequired");
  if (!KYC_ACCEPTED_TYPES.includes(file.type)) return t("ui.kyc.invalidFileType");
  return t("ui.kyc.fileTooLarge", { size: (file.size / 1024 / 1024).toFixed(1) });
}

export default function KycPage() {
  const { t: tCustomer, i18n } = useTranslation("customer");
  const { currentUser, refreshUser, verificationFacts } = useAuth();
  const searchParams = useSearchParams();
  const continuation = postLoginPath(searchParams.get("next"));
  const { showFeedback } = useActionFeedback();
  const [submitting,        setSubmitting]        = useState(false);
  const [form,              setForm]              = useState<{ icNumber: string; docType: "national_id" | "passport" | "driving_license" }>({ icNumber: "", docType: "national_id" });
  const [holderName,        setHolderName]        = useState("");
  const [ocrFields,         setOcrFields]          = useState<{ holderName: string | null; documentNumber: string | null; status: string } | null>(null);
  const [previewing,        setPreviewing]         = useState(false);
  const [savingDraft,       setSavingDraft]        = useState(false);
  const [draftId,           setDraftId]            = useState<string | null>(null);
  const [draftVersion,      setDraftVersion]       = useState<number | null>(null);
  const [draftNotice,       setDraftNotice]        = useState<string | null>(null);
  const [draftBaseline,     setDraftBaseline]      = useState<{ documentType: "national_id" | "passport" | "driving_license"; holderName: string } | null>(null);
  const [frontChanged,      setFrontChanged]       = useState(false);
  const [backChanged,       setBackChanged]        = useState(false);
  const [submitUncertain,   setSubmitUncertain]    = useState(false);
  const [operationChecking, setOperationChecking]  = useState(false);
  const [submitRequestId,   setSubmitRequestId]     = useState<string | null>(null);
  const submitOperationIdRef = useRef<string | null>(null);
  const [formError,         setFormError]         = useState<string | null>(null);
  const [fileErrors,        setFileErrors]        = useState<{ front: string | null; back: string | null }>({ front: null, back: null });
  const [submitError,       setSubmitError]       = useState<string | null>(null);
  const [frontFile,         setFrontFile]         = useState<File | null>(null);
  const [backFile,          setBackFile]          = useState<File | null>(null);
  const [ocrConsent,        setOcrConsent]        = useState(false);
  const [withdrawing,       setWithdrawing]       = useState(false);
  const [confirmWithdrawal, setConfirmWithdrawal] = useState(false);
  const [statusChecking,    setStatusChecking]    = useState(false);
  const [ocrNotice,         setOcrNotice]         = useState<string | null>(null);
  const [activeSubmission,  setActiveSubmission]  = useState<CustomerKycSubmission | null | undefined>(undefined);
  const frontFileInputRef = useRef<HTMLInputElement>(null);
  const backFileInputRef = useRef<HTMLInputElement>(null);

  const kycStatus = verificationFacts?.kycStatus ?? "unverified";
  const isVerified = kycStatus === "approved";
  const canSubmit = verificationFacts?.emailVerified === true
    && verificationFacts.accountStatus === "active";
  const loading          = activeSubmission === undefined;

  const refreshSubmissionStatus = useCallback(async () => {
    setStatusChecking(true);
    try {
      const response = await fetch("/api/kyc/submission", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error("status_unavailable");
      setActiveSubmission(body.data?.submission ?? null);
      setSubmitError(null);
    } catch {
      setSubmitError(tCustomer("ui.kyc.statusCheckFailed"));
    } finally {
      setStatusChecking(false);
    }
  }, [tCustomer]);

  useEffect(() => {
    if (!currentUser?.id) {
      const timer = window.setTimeout(() => setActiveSubmission(null), 0);
      return () => window.clearTimeout(timer);
    }
    let active = true;
    (async () => {
      try {
        const operationKey = `mylawatan:kyc-operation:${currentUser.id}`;
        const savedOperationId = window.localStorage.getItem(operationKey);
        if (savedOperationId && /^[0-9a-f-]{36}$/i.test(savedOperationId)) {
          submitOperationIdRef.current = savedOperationId;
          setSubmitUncertain(true);
        }
        const [response, draftResponse] = await Promise.all([
          fetch("/api/kyc/submission", { cache: "no-store" }),
          fetch("/api/kyc/draft", { cache: "no-store" }),
        ]);
        const body = await response.json().catch(() => ({}));
        const draftBody = await draftResponse.json().catch(() => ({}));
        if (!active) return;
        setActiveSubmission(response.ok ? (body.data?.submission ?? null) : null);
        if (savedOperationId && /^[0-9a-f-]{36}$/i.test(savedOperationId)) {
          const operationResponse = await fetch(`/api/kyc/operation/${savedOperationId}`, { cache: "no-store" });
          const operationBody = await operationResponse.json().catch(() => ({}));
          const operation = operationBody.data?.operation;
          if (active && operationResponse.ok && operation?.state === "succeeded") {
            window.localStorage.removeItem(operationKey); submitOperationIdRef.current = null; setSubmitUncertain(false);
            if (!response.ok || !body.data?.submission) await refreshSubmissionStatus();
          }
        }
        const draft = draftResponse.ok ? draftBody.data?.draft : null;
        if (draft?.id && typeof draft.version === "number") {
          setDraftId(draft.id);
          setDraftVersion(draft.version);
          setHolderName(typeof draft.holderName === "string" ? draft.holderName : "");
          setForm((value) => ({ ...value, docType: draft.documentType }));
          setDraftBaseline({ documentType: draft.documentType, holderName: typeof draft.holderName === "string" ? draft.holderName : "" });
          setFrontChanged(false);
          setBackChanged(false);
          const restore = async (side: "front" | "back") => {
            const image = await fetch(`/api/kyc/draft/documents/${draft.id}/${side}`, { cache: "no-store" });
            if (!image.ok) return null;
            const blob = await image.blob();
            return new File([blob], `${side}.${blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg"}`, { type: blob.type });
          };
          const [front, back] = await Promise.all([restore("front"), restore("back")]);
          if (active) {
            if (front) setFrontFile(front);
            if (back) setBackFile(back);
            setDraftNotice(tCustomer("ui.kyc.draftRestored"));
          }
        }
      } catch {
        if (active) setActiveSubmission(null);
      }
    })();
    return () => { active = false; };
  }, [currentUser?.id, refreshSubmissionStatus, tCustomer]);

  function handleFileChange(side: "front" | "back", file: File | null) {
    setOcrFields(null);
    setDraftNotice(null);
    if (side === "front") { setFrontFile(file); setFrontChanged(Boolean(file)); }
    else { setBackFile(file); setBackChanged(Boolean(file)); }
    setFileErrors((errors) => ({ ...errors, [side]: localizedKycFileError(file, tCustomer) }));
  }

  async function previewDocument() {
    if (!frontFile || !backFile || previewing || !ocrConsent) return;
    setPreviewing(true); setFormError(null); setOcrNotice(null);
    try {
      const saved = await saveDraft();
      if (!saved) throw new Error(tCustomer("ui.kyc.draftSaveFailed"));
      const response = await fetch("/api/kyc/preview", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId: saved.id, version: saved.version }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message ?? tCustomer("ui.kyc.previewUnavailable"));
      const preview = body.data?.preview;
      if (!preview) throw new Error(tCustomer("ui.kyc.previewUnavailable"));
      setOcrFields({ holderName: preview.holderName ?? null, documentNumber: preview.documentNumber ?? null, status: preview.status });
      if (preview.holderName) setHolderName(preview.holderName);
      if (preview.documentNumber) setForm((value) => ({ ...value, icNumber: preview.documentNumber }));
      if (preview.status !== "extracted") setOcrNotice(tCustomer("ui.kyc.previewManualEntry"));
    } catch (error) {
      setOcrNotice(error instanceof Error ? error.message : tCustomer("ui.kyc.previewUnavailable"));
    } finally { setPreviewing(false); }
  }

  async function saveDraft(): Promise<{ id: string; version: number } | null> {
    if (!frontFile || !backFile || savingDraft) return null;
    if (draftId && draftVersion !== null && draftBaseline) {
      const comparison = compareKycDraftValues({
        documentType: form.docType,
        holderName,
        frontChanged,
        backChanged,
      }, { ...draftBaseline, frontChanged: false, backChanged: false });
      if (!comparison.changed) return { id: draftId, version: draftVersion };
    }
    setSavingDraft(true); setDraftNotice(null);
    try {
      const data = new FormData();
      data.append("draftId", draftId ?? ""); if (draftVersion !== null) data.append("version", String(draftVersion));
      data.append("documentType", form.docType); data.append("holderName", holderName.trim());
      if (frontChanged) data.append("frontFile", frontFile); else data.append("reuseFront", "true");
      if (backChanged) data.append("backFile", backFile); else data.append("reuseBack", "true");
      const response = await fetch("/api/kyc/draft", { method: "POST", body: data });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message ?? tCustomer("ui.kyc.draftSaveFailed"));
      setDraftId(body.data.draft.id); setDraftVersion(body.data.draft.version); setDraftNotice(tCustomer("ui.kyc.draftSaved"));
      setDraftBaseline({ documentType: form.docType, holderName: holderName.trim() });
      setFrontChanged(false); setBackChanged(false);
      return { id: body.data.draft.id as string, version: body.data.draft.version as number };
    } catch (error) { setDraftNotice(error instanceof Error ? error.message : tCustomer("ui.kyc.draftSaveFailed")); return null; }
    finally { setSavingDraft(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    setFormError(null);
    setFileErrors({ front: null, back: null });
    setSubmitError(null);

    const result = createKycSchema(tCustomer).safeParse(form);
    if (!result.success) { setFormError(result.error.issues[0].message); return; }
    const frontError = localizedKycFileError(frontFile, tCustomer);
    const backError = localizedKycFileError(backFile, tCustomer);
    if (frontError || backError) { setFileErrors({ front: frontError, back: backError }); return; }
    if (!ocrConsent && !submitUncertain) { setSubmitError(tCustomer("ui.kyc.consentRequired")); return; }

    setSubmitting(true);
    try {
      const savedDraft = submitUncertain && draftId && draftVersion !== null
        ? { id: draftId, version: draftVersion }
        : await saveDraft();
      if (!savedDraft) { setSubmitting(false); return; }
      const fd = new FormData();
      const operationId = submitOperationIdRef.current ?? crypto.randomUUID();
      submitOperationIdRef.current = operationId;
      window.localStorage.setItem(`mylawatan:kyc-operation:${currentUser.id}`, operationId);
      fd.append("operationId", operationId);
      fd.append("icNumber", result.data.icNumber.toUpperCase());
      fd.append("holderName", holderName.trim());
      fd.append("docType",  result.data.docType);
      fd.append("draftId", savedDraft.id);
      fd.append("draftVersion", String(savedDraft.version));
      fd.append("ocrConsent", "true");
      const res = await fetch("/api/kyc/upload", { method: "POST", headers: { "Idempotency-Key": operationId }, body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setSubmitRequestId(body.error?.requestId ?? null);
        if (res.status >= 500) setSubmitUncertain(true);
        else { submitOperationIdRef.current = null; window.localStorage.removeItem(`mylawatan:kyc-operation:${currentUser.id}`); }
        throw new Error((body as { error?: { message?: string } })?.error?.message ?? tCustomer("ui.kyc.submissionFailed"));
      }
      const { data: resData } = await res.json() as { data: { submissionId: string; status: "pending"; manualReviewRequired?: boolean } };
      setOcrNotice(resData.manualReviewRequired ? tCustomer("ui.kyc.manualReview") : null);
      await refreshUser();
      submitOperationIdRef.current = null;
      window.localStorage.removeItem(`mylawatan:kyc-operation:${currentUser.id}`);
      setSubmitUncertain(false);
      setSubmitRequestId(null);
      setActiveSubmission({
        id:            resData.submissionId,
        status:        "pending",
        docType:       result.data.docType,
        queuePosition: null,
        submittedAt:   new Date().toISOString(),
        reviewedAt:    null,
        reviewReasonCode: null,
        reviewReasonDetail: null,
      });
      await refreshSubmissionStatus();
      setFrontFile(null);
      setBackFile(null);
      setOcrConsent(false);
      setForm({ icNumber: "", docType: "national_id" });
      setHolderName(""); setOcrFields(null); setDraftId(null); setDraftVersion(null);
      showFeedback("success", tCustomer("ui.kyc.submitted"));
    } catch (err) {
      const message = err instanceof Error ? err.message : tCustomer("ui.kyc.submissionFailed");
      setSubmitError(message);
      if (submitOperationIdRef.current) setSubmitUncertain(true);
      showFeedback("error", message);
    } finally {
      setSubmitting(false);
    }
  }

  const canStartNewSubmission = !activeSubmission || ["rejected", "info_requested", "superseded", "withdrawn"].includes(activeSubmission.status);
  const showForm = canSubmit && !isVerified && !loading && canStartNewSubmission;
  const submitDisabled = submitting || !frontFile || !backFile || !holderName.trim() || Boolean(fileErrors.front || fileErrors.back);

  async function refreshOperationStatus() {
    const operationId = submitOperationIdRef.current;
    if (!operationId || operationChecking) return;
    setOperationChecking(true);
    try {
      const response = await fetch(`/api/kyc/operation/${operationId}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error("operation_unavailable");
      if (body.data?.operation?.state === "succeeded") {
        window.localStorage.removeItem(`mylawatan:kyc-operation:${currentUser?.id}`);
        submitOperationIdRef.current = null; setSubmitUncertain(false); setSubmitError(null);
        await refreshSubmissionStatus();
      }
    } catch { setSubmitError(tCustomer("ui.kyc.statusCheckFailed")); }
    finally { setOperationChecking(false); }
  }

  async function withdrawSubmission() {
    if (!activeSubmission || activeSubmission.status !== "pending" || typeof activeSubmission.reviewVersion !== "number" || withdrawing) return;
    setWithdrawing(true);
    setSubmitError(null);
    const operationId = crypto.randomUUID();
    try {
      const response = await fetch("/api/kyc/submission/withdraw", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ submissionId: activeSubmission.id, expectedVersion: activeSubmission.reviewVersion, operationId }),
      });
      if (!response.ok) {
        await refreshSubmissionStatus();
        return;
      }
      setActiveSubmission({ ...activeSubmission, status: "withdrawn" });
      setConfirmWithdrawal(false);
      showFeedback("success", tCustomer("ui.kyc.withdrawn"));
    } catch {
      // Resolve the case state instead of encouraging a blind resubmission.
      await refreshSubmissionStatus();
    } finally {
      setWithdrawing(false);
    }
  }

  if (!currentUser) return <CustomerPageShell><GuestAccountEmptyState title={tCustomer("ui.kyc.guestTitle")} description={tCustomer("ui.kyc.guestDescription")} nextPath={continuation ?? "/customer/kyc"} /></CustomerPageShell>;

  return (
    <>
      <CustomerPageTitle
        eyebrow={tCustomer("accountGroups.account")}
        title={tCustomer("ui.profileSections.identityVerification")}
        description={tCustomer("ui.kyc.description")}
        icon={<ShieldCheck size={14} />}
        actions={
          <Button asChild variant="outline">
            <BackLink fallbackHref="/customer/profile">
              <ArrowLeft size={16} />
              {tCustomer("actions.back", { ns: "common" })}
            </BackLink>
          </Button>
        }
      />

      <CustomerPageShell wide className="pt-0 sm:pt-0">

      {(isVerified || activeSubmission?.status === "pending") && continuation && <div className="mb-6"><Button asChild><Link href={continuation}>{tCustomer("ui.kyc.continue")}</Link></Button></div>}

      {/* Status badge */}
      <div
        className="flex items-center gap-3 p-4 rounded-2xl mb-8 border"
        style={{
          backgroundColor: isVerified
            ? "color-mix(in srgb, var(--primary) 8%, transparent)"
            : activeSubmission?.status === "info_requested"
            ? "color-mix(in srgb, orange 8%, transparent)"
            : activeSubmission?.status === "rejected"
            ? "color-mix(in srgb, var(--destructive) 8%, transparent)"
            : activeSubmission?.status === "pending"
            ? "color-mix(in srgb, var(--accent) 10%, transparent)"
            : "var(--card)",
          borderColor: isVerified
            ? "color-mix(in srgb, var(--primary) 30%, transparent)"
            : activeSubmission?.status === "info_requested"
            ? "color-mix(in srgb, orange 30%, transparent)"
            : activeSubmission?.status === "rejected"
            ? "color-mix(in srgb, var(--destructive) 30%, transparent)"
            : activeSubmission?.status === "pending"
            ? "color-mix(in srgb, var(--accent) 30%, transparent)"
            : "var(--border)",
        }}
      >
        {isVerified ? (
          <CheckCircle2 size={20} className="text-primary shrink-0" />
        ) : activeSubmission?.status === "info_requested" ? (
          <AlertTriangle size={20} className="shrink-0" style={{ color: "orange" }} />
        ) : activeSubmission?.status === "rejected" ? (
          <AlertTriangle size={20} className="text-destructive shrink-0" />
        ) : activeSubmission?.status === "pending" ? (
          <Clock size={20} className="text-accent shrink-0" />
        ) : (
          <Info size={20} className="text-muted-foreground shrink-0" />
        )}
        <div>
          <p className="text-sm font-semibold text-foreground">
            {isVerified
              ? tCustomer("ui.kyc.verified")
              : activeSubmission?.status === "info_requested"
              ? tCustomer("ui.kyc.infoRequired")
              : activeSubmission?.status === "rejected"
              ? tCustomer("ui.kyc.rejected")
              : activeSubmission?.status === "pending"
              ? tCustomer("ui.kyc.underReview")
              : activeSubmission?.status === "withdrawn"
              ? tCustomer("ui.kyc.withdrawn")
              : canSubmit
              ? tCustomer("ui.kyc.ready")
              : tCustomer("ui.kyc.baseAccountRequired")}
          </p>
          {activeSubmission?.status === "pending" && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {tCustomer("ui.kyc.reviewWindow")}
              {activeSubmission.queuePosition != null && ` ${tCustomer("ui.kyc.queue", { position: activeSubmission.queuePosition })}`}
            </p>
          )}
          {activeSubmission?.status === "info_requested" && (
            <div className="mt-0.5">
              <p className="text-xs" style={{ color: "darkorange" }}>
                {tCustomer(`ui.kyc.reviewReasons.${activeSubmission.reviewReasonCode ?? "default"}`)}
              </p>
              {activeSubmission.reviewReasonDetail && <p className="text-xs text-muted-foreground mt-1">{tCustomer("ui.kyc.reviewerNote", { note: activeSubmission.reviewReasonDetail })}</p>}
              {activeSubmission.reviewedAt && <p className="text-xs text-muted-foreground mt-1">{tCustomer("ui.kyc.reviewed", { date: new Date(activeSubmission.reviewedAt).toLocaleString(i18n.language === "en" ? "en-MY" : i18n.language) })}</p>}
            </div>
          )}
          {activeSubmission?.status === "rejected" && (
            <div className="mt-0.5">
              <p className="text-xs text-destructive">{tCustomer(`ui.kyc.reviewReasons.${activeSubmission.reviewReasonCode ?? "default"}`)}</p>
              {activeSubmission.reviewReasonDetail && <p className="text-xs text-muted-foreground mt-1">{tCustomer("ui.kyc.reviewerNote", { note: activeSubmission.reviewReasonDetail })}</p>}
              {activeSubmission.reviewedAt && <p className="text-xs text-muted-foreground mt-1">{tCustomer("ui.kyc.reviewed", { date: new Date(activeSubmission.reviewedAt).toLocaleString(i18n.language === "en" ? "en-MY" : i18n.language) })}</p>}
            </div>
          )}
        </div>
      </div>

      {activeSubmission?.status === "pending" && <section className="mb-6 rounded-2xl border border-border bg-card p-4">
        {!confirmWithdrawal ? <Button variant="outline" disabled={withdrawing || Boolean(submitError)} onClick={() => setConfirmWithdrawal(true)}>{tCustomer("ui.kyc.withdrawApplication")}</Button> : <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{tCustomer("ui.kyc.withdrawConfirm")}</p>
          <div className="flex gap-2"><Button variant="destructive" disabled={withdrawing || Boolean(submitError)} onClick={() => void withdrawSubmission()}>{withdrawing ? tCustomer("ui.kyc.submitting") : tCustomer("ui.kyc.confirmWithdraw")}</Button><Button variant="outline" disabled={withdrawing} onClick={() => setConfirmWithdrawal(false)}>{tCustomer("actions.cancel", { ns: "common" })}</Button></div>
        </div>}
      </section>}
      {submitUncertain && <div className="mb-6 rounded-xl border border-amber-500/30 p-3 text-sm" role="status">
        <p>{tCustomer("ui.kyc.submissionChecking")}</p>
        {submitError && <div className="mt-1"><ApiErrorNotice message={submitError} requestId={submitRequestId ?? undefined} /></div>}
        <Button variant="outline" size="sm" disabled={operationChecking} onClick={() => void refreshOperationStatus()} className="mt-2">{operationChecking ? tCustomer("ui.kyc.checkingStatus") : tCustomer("ui.kyc.checkStatus")}</Button>
        {!form.icNumber && <div className="mt-3 space-y-1"><label htmlFor="kyc-retry-ic-number" className="text-xs font-semibold text-muted-foreground">{tCustomer("ui.kyc.reenterNumberForRetry")}</label>
          <input id="kyc-retry-ic-number" value={form.icNumber} onChange={(event) => setForm((value) => ({ ...value, icNumber: event.target.value }))}
            className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" /></div>}
        <Button variant="outline" size="sm" disabled={submitting || !form.icNumber || !frontFile || !backFile} onClick={() => void handleSubmit({ preventDefault() {} } as React.FormEvent)} className="mt-2">
          {tCustomer("ui.kyc.retrySameOperation")}
        </Button>
      </div>}
      {submitError && activeSubmission?.status === "pending" && !submitUncertain && <div className="mb-6 rounded-xl border border-destructive/30 p-3 text-sm text-destructive" role="alert">
        <p>{submitError}</p><Button variant="outline" size="sm" disabled={statusChecking} onClick={() => void refreshSubmissionStatus()} className="mt-2">{statusChecking ? tCustomer("ui.kyc.checkingStatus") : tCustomer("ui.kyc.checkStatus")}</Button>
      </div>}

      {/* KYC submission form */}
      {showForm && !submitUncertain && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <h2 className="font-bold text-foreground">
            {activeSubmission?.status === "info_requested" || activeSubmission?.status === "rejected" ? tCustomer("ui.kyc.newSubmission") : tCustomer("ui.kyc.submitDocuments")}
          </h2>

          {(activeSubmission?.status === "info_requested" || activeSubmission?.status === "rejected") && (
            <div className="flex items-start gap-2 p-3 rounded-xl border text-xs" style={{ backgroundColor: "color-mix(in srgb, orange 8%, transparent)", borderColor: "color-mix(in srgb, orange 30%, transparent)", color: "darkorange" }}>
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>
                <><strong>{activeSubmission.status === "rejected" ? tCustomer("ui.kyc.previousRejected") : tCustomer("ui.kyc.moreInfo")}</strong> {tCustomer(`ui.kyc.reviewReasons.${activeSubmission.reviewReasonCode ?? "default"}`)}</>
              </span>
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="kyc-holder-name" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCustomer("ui.kyc.holderName")}</label>
            <input id="kyc-holder-name" value={holderName} onChange={(event) => setHolderName(event.target.value)} maxLength={100}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30" />
          </div>

          <div className="space-y-1">
            <label htmlFor="kyc-ic-number" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {tCustomer("ui.kyc.idNumber")}
            </label>
            <input
              id="kyc-ic-number"
              value={form.icNumber}
              onChange={(e) => { setForm((f) => ({ ...f, icNumber: e.target.value })); setFormError(null); }}
              placeholder={tCustomer(IC_PATTERNS[form.docType]?.hintKey ?? "ui.kyc.idPlaceholder")}
              className="w-full px-3 py-2.5 text-sm rounded-xl border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              style={{ borderColor: formError ? "var(--destructive)" : "var(--border)" }}
            />
            {formError && <p className="text-xs text-destructive">{formError}</p>}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCustomer("ui.kyc.documentType")}</label>
            <select
              value={form.docType}
              onChange={(e) => { setForm((f) => ({ ...f, docType: e.target.value as typeof f.docType })); setOcrFields(null); }}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="national_id">{tCustomer("ui.kyc.myKad")}</option>
              <option value="passport">{tCustomer("ui.kyc.passport")}</option>
              <option value="driving_license">{tCustomer("ui.kyc.drivingLicense")}</option>
            </select>
          </div>

          {(["front", "back"] as const).map((side) => {
            const file = side === "front" ? frontFile : backFile;
            const inputRef = side === "front" ? frontFileInputRef : backFileInputRef;
            const fileError = fileErrors[side];
            return <div className="space-y-1" key={side}>
              <label htmlFor={`kyc-${side}-file`} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCustomer(side === "front" ? "ui.kyc.frontOf" : "ui.kyc.backOf")}</label>
              <input id={`kyc-${side}-file`} ref={inputRef} type="file" accept={KYC_ACCEPTED_TYPES.join(",")} className="sr-only"
                onChange={(e) => handleFileChange(side, e.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => inputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed transition-colors"
                style={{ borderColor: fileError ? "var(--destructive)" : file ? "var(--primary)" : "var(--border)", backgroundColor: file ? "color-mix(in srgb, var(--primary) 6%, transparent)" : "transparent" }}>
                {file ? <><FileCheck2 size={22} className="text-primary" /><p className="text-sm font-semibold text-primary">{file.name}</p><p className="text-xs text-muted-foreground">{tCustomer("strictMigration.kyc.fileMeta", { size: (file.size / 1024 / 1024).toFixed(2), type: tCustomer("ui.kyc.clickChange") })}</p></>
                  : <><Upload size={20} className="text-muted-foreground" /><p className="text-sm text-muted-foreground">{tCustomer("ui.kyc.clickUpload", { side: side === "front" ? tCustomer("ui.kyc.frontOf") : tCustomer("ui.kyc.backOf") })}</p><p className="text-xs text-muted-foreground">{tCustomer("ui.kyc.fileHint")}</p></>}
              </button>
              <KycPhotoPreview file={fileError ? null : file} label={tCustomer(side === "front" ? "ui.kyc.frontOf" : "ui.kyc.backOf")} />
              {fileError && <p className="text-xs text-destructive">{fileError}</p>}
            </div>;
          })}

          <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-xs text-muted-foreground">
            <input type="checkbox" checked={ocrConsent} onChange={(e) => setOcrConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
            <span>{tCustomer("ui.kyc.consent")}</span>
          </label>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={!frontFile || !backFile || previewing || !ocrConsent} onClick={() => void previewDocument()}>
              {previewing ? tCustomer("ui.kyc.previewing") : tCustomer("ui.kyc.recognizeDocument")}
            </Button>
            <Button type="button" variant="outline" disabled={!frontFile || !backFile || savingDraft} onClick={() => void saveDraft()}>
              {savingDraft ? tCustomer("ui.kyc.savingDraft") : tCustomer("ui.kyc.saveDraft")}
            </Button>
          </div>
          {ocrFields && <p className="text-xs text-muted-foreground">{tCustomer("ui.kyc.ocrEditableNotice")}</p>}
          {draftNotice && <p className="text-xs text-muted-foreground" role="status">{draftNotice}</p>}

          {submitError && <ApiErrorNotice message={submitError} requestId={submitRequestId ?? undefined} />}
          {ocrNotice && <p className="text-xs text-amber-700 dark:text-amber-200 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-lg px-3 py-2">{ocrNotice}</p>}

          <Button type="submit" disabled={submitDisabled || !ocrConsent} className="w-full">
            {submitting ? tCustomer("ui.kyc.submitting") : activeSubmission?.status === "rejected" || activeSubmission?.status === "info_requested" ? tCustomer("ui.kyc.startNew") : tCustomer("ui.kyc.submitForReview")}
          </Button>
        </form>
      )}
      </CustomerPageShell>
    </>
  );
}
