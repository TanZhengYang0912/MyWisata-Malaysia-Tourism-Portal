"use client";

import { useEffect, useRef, useState } from "react";
import {
  ShieldCheck, Upload, CheckCircle2, Clock, FileCheck2,
  UserCircle, Info, AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { useAuth } from "@/components/providers/auth";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { validateKycFile, KYC_ACCEPTED_TYPES } from "@/backend/domains/identity";
import { Button } from "@/components/ui/button";
import type { CustomerKycSubmission } from "@/backend/core/types";
import { safeKycReasonCopy } from "@/lib/kyc/customer-submission";

const IC_PATTERNS: Record<string, { regex: RegExp; hint: string }> = {
  national_id:     { regex: /^\d{6}-?\d{2}-?\d{4}$/, hint: "MyKad: 12 digits e.g. 900101-14-5678" },
  driving_license: { regex: /^\d{6}-?\d{2}-?\d{4}$/, hint: "Driving License: 12 digits e.g. 900101-14-5678" },
  passport:        { regex: /^[A-Z]{1,2}[0-9]{6,8}$/, hint: "Passport: 1–2 letters + 6–8 digits e.g. A12345678" },
};

const kycSchema = z.object({
  icNumber: z.string().min(1, "IC / Passport number is required"),
  docType:  z.enum(["national_id", "passport", "driving_license"]),
}).superRefine((val, ctx) => {
  const pattern = IC_PATTERNS[val.docType];
  if (pattern && !pattern.regex.test(val.icNumber.toUpperCase())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["icNumber"], message: pattern.hint });
  }
});

const TIER_STEPS = [
  { value: "email_verified",  label: "Email Verified" },
  { value: "phone_verified",  label: "Phone Verified" },
  { value: "profile_complete", label: "Profile Complete" },
  { value: "kyc_verified",    label: "KYC Verified" },
] as const;

export default function KycPage() {
  const { currentUser, refreshUser } = useAuth();
  const { showFeedback } = useActionFeedback();
  const [submitting,        setSubmitting]        = useState(false);
  const [form,              setForm]              = useState({ icNumber: "", docType: "national_id" });
  const [formError,         setFormError]         = useState<string | null>(null);
  const [fileErrors,        setFileErrors]        = useState<{ front: string | null; back: string | null }>({ front: null, back: null });
  const [submitError,       setSubmitError]       = useState<string | null>(null);
  const [frontFile,         setFrontFile]         = useState<File | null>(null);
  const [backFile,          setBackFile]          = useState<File | null>(null);
  const [ocrConsent,        setOcrConsent]        = useState(false);
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
    setFileErrors((errors) => ({ ...errors, [side]: file ? validateKycFile(file) : "Please upload a document photo" }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    setFormError(null);
    setFileErrors({ front: null, back: null });
    setSubmitError(null);

    const result = kycSchema.safeParse(form);
    if (!result.success) { setFormError(result.error.issues[0].message); return; }
    const frontError = validateKycFile(frontFile);
    const backError = validateKycFile(backFile);
    if (frontError || backError) { setFileErrors({ front: frontError, back: backError }); return; }
    if (!ocrConsent) { setSubmitError('Please consent to AI-assisted document reading before submitting.'); return; }

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
        throw new Error((body as { error?: { message?: string } })?.error?.message ?? "Submission failed.");
      }
      const { data: resData } = await res.json() as { data: { submissionId: string; status: "pending" } };
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
      showFeedback("success", "KYC documents submitted for review.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Submission failed.";
      setSubmitError(message);
      showFeedback("error", message);
    } finally {
      setSubmitting(false);
    }
  }

  const canStartNewSubmission = !activeSubmission || ["rejected", "info_requested", "superseded"].includes(activeSubmission.status);
  const showForm = canSubmit && !isVerified && !loading && canStartNewSubmission;
  const submitDisabled = submitting || !frontFile || !backFile || Boolean(fileErrors.front || fileErrors.back);

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center gap-3 mb-2">
        <ShieldCheck size={28} className="text-primary" />
        <h1 className="text-2xl font-bold text-foreground font-[family-name:var(--font-display)]">
          KYC Verification
        </h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        Submit your identity documents to unlock wallet withdrawals and full affiliate earnings.
      </p>

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
              ? "KYC Verified"
              : activeSubmission?.status === "info_requested"
              ? "Additional Information Required"
              : activeSubmission?.status === "rejected"
              ? "KYC Submission Rejected"
              : activeSubmission?.status === "pending"
              ? "Under Review"
              : isProfileComplete
              ? "Ready to Submit"
              : "Complete Profile First"}
          </p>
          {activeSubmission?.status === "pending" && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Our team reviews within 1–2 business days.
              {activeSubmission.queuePosition != null && ` You are #${activeSubmission.queuePosition} in the queue.`}
            </p>
          )}
          {activeSubmission?.status === "info_requested" && (
            <div className="mt-0.5">
              <p className="text-xs" style={{ color: "darkorange" }}>
                {safeKycReasonCopy(activeSubmission.reviewReasonCode)}
              </p>
              {activeSubmission.reviewReasonDetail && <p className="text-xs text-muted-foreground mt-1">Reviewer note: {activeSubmission.reviewReasonDetail}</p>}
              {activeSubmission.reviewedAt && <p className="text-xs text-muted-foreground mt-1">Reviewed {new Date(activeSubmission.reviewedAt).toLocaleString()}</p>}
            </div>
          )}
          {activeSubmission?.status === "rejected" && (
            <div className="mt-0.5">
              <p className="text-xs text-destructive">{safeKycReasonCopy(activeSubmission.reviewReasonCode)}</p>
              {activeSubmission.reviewReasonDetail && <p className="text-xs text-muted-foreground mt-1">Reviewer note: {activeSubmission.reviewReasonDetail}</p>}
              {activeSubmission.reviewedAt && <p className="text-xs text-muted-foreground mt-1">Reviewed {new Date(activeSubmission.reviewedAt).toLocaleString()}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Verification steps progress */}
      <div className="space-y-2 mb-8">
        {TIER_STEPS.map(({ value, label }, i) => {
          const done = tierIndex >= i;
          return (
            <div key={value} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  backgroundColor: done ? "var(--primary)" : "var(--secondary)",
                  color:           done ? "white"           : "var(--muted-foreground)",
                }}
              >
                {i + 1}
              </div>
              <p className="text-sm text-foreground">{label}</p>
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
            <p className="text-sm font-semibold text-foreground mb-1">Complete your profile first</p>
            <p className="text-xs text-muted-foreground mb-3">
              You need to verify your phone, upload a photo, add a bio, and fill in travel preferences before submitting KYC documents.
            </p>
            <Link href="/customer/profile">
              <Button size="sm" variant="outline">Complete Profile</Button>
            </Link>
          </div>
        </div>
      )}

      {/* KYC submission form */}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <h2 className="font-bold text-foreground">
            {activeSubmission?.status === "info_requested" || activeSubmission?.status === "rejected" ? "Start New KYC Submission" : "Submit KYC Documents"}
          </h2>

          {(activeSubmission?.status === "info_requested" || activeSubmission?.status === "rejected") && (
            <div className="flex items-start gap-2 p-3 rounded-xl border text-xs" style={{ backgroundColor: "color-mix(in srgb, orange 8%, transparent)", borderColor: "color-mix(in srgb, orange 30%, transparent)", color: "darkorange" }}>
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>
                <><strong>{activeSubmission.status === "rejected" ? "Previous submission rejected." : "More information needed."}</strong> {safeKycReasonCopy(activeSubmission.reviewReasonCode)}</>
              </span>
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="kyc-ic-number" className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              IC / Passport Number
            </label>
            <input
              id="kyc-ic-number"
              value={form.icNumber}
              onChange={(e) => { setForm((f) => ({ ...f, icNumber: e.target.value })); setFormError(null); }}
              placeholder={IC_PATTERNS[form.docType]?.hint ?? "e.g. 900101-14-5678"}
              className="w-full px-3 py-2.5 text-sm rounded-xl border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              style={{ borderColor: formError ? "var(--destructive)" : "var(--border)" }}
            />
            {formError && <p className="text-xs text-destructive">{formError}</p>}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Document Type</label>
            <select
              value={form.docType}
              onChange={(e) => setForm((f) => ({ ...f, docType: e.target.value }))}
              className="w-full px-3 py-2.5 text-sm rounded-xl border border-border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="national_id">MyKad (Malaysian IC)</option>
              <option value="passport">Passport</option>
              <option value="driving_license">Driving License / MyPolis</option>
            </select>
          </div>

          {(["front", "back"] as const).map((side) => {
            const file = side === "front" ? frontFile : backFile;
            const inputRef = side === "front" ? frontFileInputRef : backFileInputRef;
            const fileError = fileErrors[side];
            return <div className="space-y-1" key={side}>
              <label htmlFor={`kyc-${side}-file`} className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{side} of document</label>
              <input id={`kyc-${side}-file`} ref={inputRef} type="file" accept={KYC_ACCEPTED_TYPES.join(",")} className="sr-only"
                onChange={(e) => handleFileChange(side, e.target.files?.[0] ?? null)} />
              <button type="button" onClick={() => inputRef.current?.click()}
                className="w-full flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed transition-colors"
                style={{ borderColor: fileError ? "var(--destructive)" : file ? "var(--primary)" : "var(--border)", backgroundColor: file ? "color-mix(in srgb, var(--primary) 6%, transparent)" : "transparent" }}>
                {file ? <><FileCheck2 size={22} className="text-primary" /><p className="text-sm font-semibold text-primary">{file.name}</p><p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB · click to change</p></>
                  : <><Upload size={20} className="text-muted-foreground" /><p className="text-sm text-muted-foreground">Click to upload {side} of document</p><p className="text-xs text-muted-foreground">JPG, PNG or WebP · max 5 MB</p></>}
              </button>
              {fileError && <p className="text-xs text-destructive">{fileError}</p>}
            </div>;
          })}

          <label className="flex items-start gap-3 rounded-xl border border-border p-3 text-xs text-muted-foreground">
            <input type="checkbox" checked={ocrConsent} onChange={(e) => setOcrConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
            <span>I agree that MyWisata may use a third-party AI service to assist with reading my document. A human administrator makes the final KYC decision.</span>
          </label>

          {submitError && <p className="text-xs text-destructive text-center">{submitError}</p>}

          <Button type="submit" disabled={submitDisabled || !ocrConsent} className="w-full">
            {submitting ? "Submitting…" : activeSubmission?.status === "rejected" || activeSubmission?.status === "info_requested" ? "Start New Submission" : "Submit for Review"}
          </Button>
        </form>
      )}
    </div>
  );
}
