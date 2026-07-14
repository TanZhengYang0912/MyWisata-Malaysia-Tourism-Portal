"use client";

import { useEffect, useRef, useState, useMemo } from "react";
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
import { createClient } from "@/lib/supabase/client";

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

type ActiveSubmission = {
  id: string;
  status: "pending" | "info_requested";
  queuePosition: number | null;
  submittedAt: string;
  rejectionReason?: string | null;
} | null;

const TIER_STEPS = [
  { value: "email_verified",  label: "Email Verified" },
  { value: "phone_verified",  label: "Phone Verified" },
  { value: "profile_complete", label: "Profile Complete" },
  { value: "kyc_verified",    label: "KYC Verified" },
] as const;

export default function KycPage() {
  const { currentUser, refreshUser } = useAuth();
  const { showFeedback } = useActionFeedback();
  const supabase = useMemo(() => createClient(), []);

  const [submitting,        setSubmitting]        = useState(false);
  const [form,              setForm]              = useState({ icNumber: "", docType: "national_id" });
  const [formError,         setFormError]         = useState<string | null>(null);
  const [fileError,         setFileError]         = useState<string | null>(null);
  const [submitError,       setSubmitError]       = useState<string | null>(null);
  const [docFile,           setDocFile]           = useState<File | null>(null);
  const [activeSubmission,  setActiveSubmission]  = useState<ActiveSubmission | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tier      = currentUser?.verificationTier ?? "email_verified";
  const isVerified       = tier === "kyc_verified";
  const isProfileComplete = tier === "profile_complete" || tier === "kyc_verified";
  const canSubmit        = tier === "profile_complete";
  const loading          = activeSubmission === undefined;

  const tierIndex = TIER_STEPS.findIndex((s) => s.value === tier);

  useEffect(() => {
    if (!currentUser?.id) { setActiveSubmission(null); return; }
    let active = true;
    (async () => {
      try {
        const { data } = await supabase
          .from("kyc_submissions")
          .select("id,status,queue_position,created_at,rejection_reason")
          .eq("user_id", currentUser.id)
          .in("status", ["pending", "info_requested"])
          .maybeSingle();
        if (!active) return;
        if (data) {
          setActiveSubmission({
            id:             data.id,
            status:         data.status as "pending" | "info_requested",
            queuePosition:  (data as any).queue_position ?? null,
            submittedAt:    data.created_at,
            rejectionReason: (data as any).rejection_reason ?? null,
          });
        } else {
          setActiveSubmission(null);
        }
      } catch {
        if (active) setActiveSubmission(null);
      }
    })();
    return () => { active = false; };
  }, [currentUser?.id, supabase]);

  function handleFileChange(file: File | null) {
    setDocFile(file);
    setFileError(file ? validateKycFile(file) : null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    setFormError(null);
    setFileError(null);
    setSubmitError(null);

    const result = kycSchema.safeParse(form);
    if (!result.success) { setFormError(result.error.issues[0].message); return; }
    const fileErr = validateKycFile(docFile);
    if (fileErr) { setFileError(fileErr); return; }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("icNumber", result.data.icNumber.toUpperCase());
      fd.append("docType",  result.data.docType);
      fd.append("file",     docFile!);
      const res = await fetch("/api/kyc/upload", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.error?.message ?? "Submission failed.");
      }
      const { data: resData } = await res.json() as { data: { submissionId: string; queuePosition: number | null } };
      await refreshUser();
      setActiveSubmission({
        id:            resData.submissionId,
        status:        "pending",
        queuePosition: resData.queuePosition,
        submittedAt:   new Date().toISOString(),
      });
      setDocFile(null);
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

  const showForm = canSubmit && !isVerified && !loading && activeSubmission?.status !== "pending";

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
            : activeSubmission?.status === "pending"
            ? "color-mix(in srgb, var(--accent) 10%, transparent)"
            : "var(--card)",
          borderColor: isVerified
            ? "color-mix(in srgb, var(--primary) 30%, transparent)"
            : activeSubmission?.status === "info_requested"
            ? "color-mix(in srgb, orange 30%, transparent)"
            : activeSubmission?.status === "pending"
            ? "color-mix(in srgb, var(--accent) 30%, transparent)"
            : "var(--border)",
        }}
      >
        {isVerified ? (
          <CheckCircle2 size={20} className="text-primary shrink-0" />
        ) : activeSubmission?.status === "info_requested" ? (
          <AlertTriangle size={20} className="shrink-0" style={{ color: "orange" }} />
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
                {activeSubmission.rejectionReason
                  ? `Admin note: ${activeSubmission.rejectionReason}`
                  : "Admin has requested more information. Please re-submit with clear, valid documents below."}
              </p>
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
            {activeSubmission?.status === "info_requested" ? "Re-submit KYC Documents" : "Submit KYC Documents"}
          </h2>

          {activeSubmission?.status === "info_requested" && (
            <div className="flex items-start gap-2 p-3 rounded-xl border text-xs" style={{ backgroundColor: "color-mix(in srgb, orange 8%, transparent)", borderColor: "color-mix(in srgb, orange 30%, transparent)", color: "darkorange" }}>
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>
                {activeSubmission.rejectionReason
                  ? <><strong>Admin note:</strong> {activeSubmission.rejectionReason}</>
                  : "Additional information was requested. Please re-upload clear, legible documents."}
              </span>
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              IC / Passport Number
            </label>
            <input
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

          <div className="space-y-1">
            <input
              ref={fileInputRef}
              type="file"
              accept={KYC_ACCEPTED_TYPES.join(",")}
              className="hidden"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed transition-colors"
              style={{
                borderColor:     fileError ? "var(--destructive)" : docFile ? "var(--primary)" : "var(--border)",
                backgroundColor: docFile ? "color-mix(in srgb, var(--primary) 6%, transparent)" : "transparent",
              }}
            >
              {docFile ? (
                <>
                  <FileCheck2 size={22} className="text-primary" />
                  <p className="text-sm font-semibold text-primary">{docFile.name}</p>
                  <p className="text-xs text-muted-foreground">{(docFile.size / 1024 / 1024).toFixed(2)} MB · click to change</p>
                </>
              ) : (
                <>
                  <Upload size={20} className="text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Click to upload document photo</p>
                  <p className="text-xs text-muted-foreground">JPG, PNG or PDF · max 5 MB</p>
                </>
              )}
            </button>
            {fileError && <p className="text-xs text-destructive">{fileError}</p>}
          </div>

          {submitError && <p className="text-xs text-destructive text-center">{submitError}</p>}

          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Submitting…" : "Submit for Review"}
          </Button>
        </form>
      )}
    </div>
  );
}
