"use client";

import { useEffect, useRef, useState } from "react";
import { ShieldCheck, Upload, CheckCircle2, Clock, FileCheck2, UserCircle } from "lucide-react";
import Link from "next/link";
import { z } from "zod";
import { useAuth } from "@/components/providers/auth";
import { validateKycFile, KYC_ACCEPTED_TYPES } from "@/backend/domains/identity";
import { Button } from "@/components/ui/button";
import type { User } from "@/backend/core/types";

const IC_PATTERNS: Record<string, { regex: RegExp; hint: string }> = {
  national_id:      { regex: /^\d{6}-?\d{2}-?\d{4}$/, hint: "MyKad: 12 digits e.g. 900101-14-5678" },
  driving_license:  { regex: /^\d{6}-?\d{2}-?\d{4}$/, hint: "MyPolis / Driving License: 12 digits e.g. 900101-14-5678" },
  passport:         { regex: /^[A-Z]{1,2}[0-9]{6,8}$/, hint: "Passport: 1–2 letters + 6–8 digits e.g. A12345678" },
};

const kycSchema = z.object({
  icNumber: z.string().min(1, "IC / Passport number is required"),
  docType: z.enum(["national_id", "passport", "driving_license"]),
}).superRefine((val, ctx) => {
  const pattern = IC_PATTERNS[val.docType];
  if (pattern && !pattern.regex.test(val.icNumber.toUpperCase())) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["icNumber"], message: pattern.hint });
  }
});

// phone_verified is kept in DB but skipped in the user-facing flow
const TIER_ORDER: User["verificationTier"][] = [
  "guest",
  "registered",
  "profile_complete",
  "kyc_verified",
];

const TIER_LABEL: Record<User["verificationTier"], string> = {
  guest: "Guest",
  registered: "Registered",
  phone_verified: "Phone Verified",
  profile_complete: "Profile Complete",
  kyc_submitted: "KYC Under Review",
  kyc_verified: "KYC Verified",
};

export default function KycPage() {
  const { currentUser, refreshUser } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ icNumber: "", docType: "national_id" });
  const [formError, setFormError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentUser?.verificationTier === "kyc_submitted") setSubmitted(true);
  }, [currentUser]);

  const tier = currentUser?.verificationTier ?? "guest";
  const isVerified = tier === "kyc_verified";
  const isPending = tier === "kyc_submitted";
  // kyc_submitted maps to profile_complete position in the 4-step progress bar
  const displayTier = tier === "kyc_submitted" ? "profile_complete" : tier;
  const canSubmit = tier === "profile_complete";

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
    if (!result.success) {
      setFormError(result.error.issues[0].message);
      return;
    }
    const fileErr = validateKycFile(docFile);
    if (fileErr) {
      setFileError(fileErr);
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('icNumber', result.data.icNumber.toUpperCase());
      fd.append('docType', result.data.docType);
      fd.append('file', docFile!);
      const res = await fetch('/api/kyc/upload', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? 'Submission failed.');
      }
      await refreshUser();
      setSubmitted(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : (err as { message?: string })?.message ?? "Submission failed.";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <div className="flex items-center gap-3 mb-2">
        <ShieldCheck size={28} className="text-primary" />
        <h1 className="text-2xl font-bold text-foreground font-[family-name:var(--font-display)]">KYC Verification</h1>
      </div>
      <p className="text-sm text-muted-foreground mb-8">
        Submit your identity documents to unlock higher wallet limits and trusted vendor status.
      </p>

      {/* Status badge */}
      <div
        className="flex items-center gap-3 p-4 rounded-2xl mb-8 border"
        style={{
          backgroundColor: isVerified
            ? "color-mix(in srgb, var(--primary) 8%, transparent)"
            : isPending
            ? "color-mix(in srgb, var(--accent) 10%, transparent)"
            : "var(--card)",
          borderColor: isVerified
            ? "color-mix(in srgb, var(--primary) 30%, transparent)"
            : isPending
            ? "color-mix(in srgb, var(--accent) 30%, transparent)"
            : "var(--border)",
        }}
      >
        {isVerified ? (
          <CheckCircle2 size={20} className="text-primary shrink-0" />
        ) : (
          <Clock size={20} className="text-accent shrink-0" />
        )}
        <div>
          <p className="text-sm font-semibold" style={{ color: isVerified ? "var(--primary)" : "var(--foreground)" }}>
            {TIER_LABEL[tier]}
          </p>
          {isPending && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Our team will review your documents within 1–2 business days.
            </p>
          )}
        </div>
      </div>

      {/* Verification steps */}
      <div className="space-y-2 mb-8">
        {TIER_ORDER.map((t, i) => {
          const done = TIER_ORDER.indexOf(displayTier) > i || displayTier === t;
          return (
            <div key={t} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                style={{
                  backgroundColor: done ? "var(--primary)" : "var(--secondary)",
                  color: done ? "white" : "var(--muted-foreground)",
                }}
              >
                {i + 1}
              </div>
              <p className="text-sm text-foreground">{TIER_LABEL[t]}</p>
              {done && <CheckCircle2 size={14} className="text-primary ml-auto" />}
            </div>
          );
        })}
      </div>

      {/* Profile CTA — shown when user hasn't filled profile yet */}
      {tier === "registered" && (
        <div className="rounded-2xl border border-border bg-card p-5 mb-6 flex items-start gap-4">
          <UserCircle size={22} className="text-accent shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-foreground mb-1">Complete your profile first</p>
            <p className="text-xs text-muted-foreground mb-3">Fill in your full name, city, and phone number to unlock KYC submission.</p>
            <Link href="/customer/profile">
              <Button size="sm" variant="outline">Complete Profile</Button>
            </Link>
          </div>
        </div>
      )}

      {/* Submission form — only for profile_complete users */}
      {canSubmit && (
        <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <h2 className="font-bold text-foreground">Submit KYC Documents</h2>

          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">IC / Passport Number</label>
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
                borderColor: fileError ? "var(--destructive)" : docFile ? "var(--primary)" : "var(--border)",
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
                  <p className="text-xs text-muted-foreground">JPG, PNG or PDF · max 5 MB · required</p>
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
