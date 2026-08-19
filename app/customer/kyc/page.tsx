"use client";

import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useEffect, useRef, useState } from "react";
import {
  ShieldCheck, Upload, CheckCircle2, Clock, FileCheck2,
  UserCircle, Info, AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { useAuth } from "@/components/providers/auth";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { CustomerPageShell, CustomerPageTitle } from "@/components/customer/customer-page-shell";
import { validateKycFile, KYC_ACCEPTED_TYPES } from "@/backend/domains/identity";
import { Button } from "@/components/ui/button";
import type { CustomerKycSubmission } from "@/backend/core/types";
import { useSearchParams } from "next/navigation";
import { GuestAccountEmptyState } from "@/components/customer/guest-account-empty-state";
import { postLoginPath } from "@/lib/auth/guest-mode";

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
const TIER_STEPS = [
  { value: "email_verified",  labelKey: "ui.kyc.tiers.emailVerified" },
  { value: "phone_verified",  labelKey: "ui.kyc.tiers.phoneVerified" },
  { value: "profile_complete", labelKey: "ui.kyc.tiers.profileComplete" },
  { value: "kyc_verified",    labelKey: "ui.kyc.tiers.kycVerified" },
] as const;

function localizedKycFileError(file: File | null, t: TFunction<"customer">): string | null {
  const error = validateKycFile(file);
  if (!error) return null;
  if (!file) return t("ui.kyc.uploadRequired");
  if (!KYC_ACCEPTED_TYPES.includes(file.type)) return t("ui.kyc.invalidFileType");
  return t("ui.kyc.fileTooLarge", { size: (file.size / 1024 / 1024).toFixed(1) });
}

export default function KycPage() {
  const { t: tCustomer, i18n } = useTranslation("customer");
  const { currentUser, refreshUser } = useAuth();
  const searchParams = useSearchParams();
  const continuation = postLoginPath(searchParams.get("next"));
  const { showFeedback } = useActionFeedback();
  const [submitting,        setSubmitting]        = useState(false);
  const [form,              setForm]              = useState({ icNumber: "", docType: "national_id" });
  const [formError,         setFormError]         = useState<string | null>(null);
  const [fileErrors,        setFileErrors]        = useState<{ front: string | null; back: string | null }>({ front: null, back: null });
  const [submitError,       setSubmitError]       = useState<string | null>(null);
  const [frontFile,         setFrontFile]         = useState<File | null>(null);
  const [backFile,          setBackFile]          = useState<File | null>(null);
  const [ocrConsent,        setOcrConsent]        = useState(false);
  const [ocrNotice,         setOcrNotice]         = useState<string | null>(null);
  const [activeSubmission,  setActiveSubmission]  = useState<CustomerKycSubmission | null | undefined>(undefined);
  const frontFileInputRef = useRef<HTMLInputElement>(null);
  const backFileInputRef = useRef<HTMLInputElement>(null);

  const tier      = currentUser?.verificationTier ?? "email_unverified";
  const isVerified       = tier === "kyc_verified";
  const isProfileComplete = tier === "profile_complete" || tier === "kyc_verified";
  const canSubmit        = tier === "profile_complete";
  const loading          = activeSubmission === undefined;

  const tierIndex = TIER_STEPS.findIndex((s) => s.value === tier);

  useEffect(() => {
    if (!currentUser?.id) {
      const timer = window.setTimeout(() => setActiveSubmission(null), 0);
      return () => window.clearTimeout(timer);
    }
    let active = true;
    (async () => {
      try {
        const response = await fetch("/api/kyc/submission");
        const body = await response.json().catch(() => ({}));
        if (!active) return;
        setActiveSubmission(response.ok ? (body.data?.submission ?? null) : null);
      } catch {
        if (active) setActiveSubmission(null);
      }
    })();
    return () => { active = false; };
  }, [currentUser?.id]);

  function handleFileChange(side: "front" | "back", file: File | null) {
    if (side === "front") setFrontFile(file);
    else setBackFile(file);
    setFileErrors((errors) => ({ ...errors, [side]: localizedKycFileError(file, tCustomer) }));
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
    if (!ocrConsent) { setSubmitError(tCustomer("ui.kyc.consentRequired")); return; }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("icNumber", result.data.icNumber.toUpperCase());
      fd.append("docType",  result.data.docType);
      fd.append("frontFile", frontFile!);
      fd.append("backFile", backFile!);
      fd.append("ocrConsent", "true");
      const res = await fetch("/api/kyc/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: { message?: string } })?.error?.message ?? tCustomer("ui.kyc.submissionFailed"));
      }
      const { data: resData } = await res.json() as { data: { submissionId: string; status: "pending"; manualReviewRequired?: boolean } };
      setOcrNotice(resData.manualReviewRequired ? tCustomer("ui.kyc.manualReview") : null);
      await refreshUser();
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
      setFrontFile(null);
      setBackFile(null);
      setOcrConsent(false);
      setForm({ icNumber: "", docType: "national_id" });
      showFeedback("success", tCustomer("ui.kyc.submitted"));
    } catch (err) {
      const message = err instanceof Error ? err.message : tCustomer("ui.kyc.submissionFailed");
      setSubmitError(message);
      showFeedback("error", message);
    } finally {
      setSubmitting(false);
    }
  }

  const canStartNewSubmission = !activeSubmission || ["rejected", "info_requested", "superseded"].includes(activeSubmission.status);
  const showForm = canSubmit && !isVerified && !loading && canStartNewSubmission;
  const submitDisabled = submitting || !frontFile || !backFile || Boolean(fileErrors.front || fileErrors.back);

  if (!currentUser) return <CustomerPageShell><GuestAccountEmptyState title={tCustomer("ui.kyc.guestTitle")} description={tCustomer("ui.kyc.guestDescription")} nextPath={continuation ?? "/customer/kyc"} /></CustomerPageShell>;

  return (
    <>
      <CustomerPageTitle
        eyebrow={tCustomer("accountGroups.account")}
        title={tCustomer("ui.kyc.verified")}
        description={tCustomer("ui.kyc.description")}
        icon={<ShieldCheck size={14} />}
      />

      <CustomerPageShell className="pt-0 sm:pt-0">

      {isVerified && continuation && <div className="mb-6"><Button asChild><Link href={continuation}>{tCustomer("ui.kyc.continue")}</Link></Button></div>}

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
              : isProfileComplete
              ? tCustomer("ui.kyc.ready")
              : tCustomer("ui.kyc.completeFirst")}
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

      {/* Verification steps progress */}
      <div className="space-y-2 mb-8">
        {TIER_STEPS.map(({ value, labelKey }, i) => {
          const done = tierIndex >= i;
          return (
            <div key={value} className="flex min-h-[52px] items-center gap-3 rounded-xl border border-border bg-card p-3">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  backgroundColor: done ? "var(--primary)" : "var(--secondary)",
                  color:           done ? "white"           : "var(--muted-foreground)",
                }}
              >
                {i + 1}
              </div>
              <p className="text-sm text-foreground">{tCustomer(labelKey)}</p>
              {done && <CheckCircle2 size={14} className="text-primary ml-auto" />}
            </div>
          );
        })}
      </div>

      {/* Profile CTA — shown for non-profile-complete users */}
      {!isProfileComplete && !isVerified && (
        <div className="rounded-2xl border border-border bg-card p-5 mb-6 flex items-start gap-4">
          <UserCircle size={22} className="text-accent shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground mb-1">{tCustomer("ui.kyc.profileTitle")}</p>
            <p className="text-xs text-muted-foreground mb-3">{tCustomer("ui.kyc.profileDescription")}</p>
            <Link href="/customer/profile">
              <Button size="sm" variant="outline">{tCustomer("ui.kyc.completeProfile")}</Button>
            </Link>
          </div>
        </div>
      )}

      {/* KYC submission form */}
      {showForm && (
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
              onChange={(e) => setForm((f) => ({ ...f, docType: e.target.value }))}
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
                {file ? <><FileCheck2 size={22} className="text-primary" /><p className="text-sm font-semibold text-primary">{file.name}</p><p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB · {tCustomer("ui.kyc.clickChange")}</p></>
                  : <><Upload size={20} className="text-muted-foreground" /><p className="text-sm text-muted-foreground">{tCustomer("ui.kyc.clickUpload", { side: side === "front" ? tCustomer("ui.kyc.frontOf") : tCustomer("ui.kyc.backOf") })}</p><p className="text-xs text-muted-foreground">{tCustomer("ui.kyc.fileHint")}</p></>}
              </button>
              {fileError && <p className="text-xs text-destructive">{fileError}</p>}
            </div>;
          })}

          <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-xs text-muted-foreground">
            <input type="checkbox" checked={ocrConsent} onChange={(e) => setOcrConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
            <span>{tCustomer("ui.kyc.consent")}</span>
          </label>

          {submitError && <p className="text-xs text-destructive text-center">{submitError}</p>}
          {ocrNotice && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{ocrNotice}</p>}

          <Button type="submit" disabled={submitDisabled || !ocrConsent} className="w-full">
            {submitting ? tCustomer("ui.kyc.submitting") : activeSubmission?.status === "rejected" || activeSubmission?.status === "info_requested" ? tCustomer("ui.kyc.startNew") : tCustomer("ui.kyc.submitForReview")}
          </Button>
        </form>
      )}
      </CustomerPageShell>
    </>
  );
}
