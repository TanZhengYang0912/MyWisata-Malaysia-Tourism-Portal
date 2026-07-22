"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Phone, User, Camera, MessageSquare, ClipboardList,
  Store, Upload, Loader2, ChevronRight,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { Button } from "@/components/ui/button";
import { InternationalPhoneInput } from "@/components/profile/international-phone-input";
import { ProfileSections } from "@/components/profile/profile-sections";
import { PreferencesEditor } from "@/components/profile/preferences-editor";
import { parseInternationalPhone } from "@/lib/phone/international";
import { computeProfileCompletion } from "@/lib/verification/eligibility";
import { getWizardProgress, WIZARD_STEPS } from "./wizard-progress";

function initialStep(tier: string): number {
  if (tier === "email_verified") return 0;
  if (tier === "phone_verified") return 1;
  return -1;
}

function ProfileCompletionCard({ percentage, missing }: { percentage: number; missing: string[] }) {
  return (
    <section aria-label="Profile completion" className="mb-6 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-foreground">Profile completion</p>
        <p className="font-semibold text-primary">{percentage}%</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percentage}%` }} />
      </div>
      {missing.length > 0 && <p className="mt-2 text-xs text-muted-foreground">Still needed: {missing.join(", ")}</p>}
    </section>
  );
}

export default function ProfilePage() {
  const { currentUser, refreshUser } = useAuth();
  const { showFeedback } = useActionFeedback();

  const tier = currentUser?.verificationTier ?? "email_unverified";
  const [step, setStep] = useState<number>(() => initialStep(tier));

  // ── Phone ──────────────────────────────────────────────────────────────────
  const [phonePhase, setPhonePhase] = useState<"enter" | "verify">("enter");
  const [phone, setPhone]           = useState("");
  const [otp,   setOtp]             = useState("");
  const [phoneError,  setPhoneError]  = useState<string | null>(null);
  const [phoneBusy,   setPhoneBusy]   = useState(false);

  // ── Identity ───────────────────────────────────────────────────────────────
  const [fullName, setFullName]         = useState(currentUser?.name !== currentUser?.email ? (currentUser?.name ?? "") : "");
  const [city,     setCity]             = useState(currentUser?.city ?? "");
  const [country,  setCountry]          = useState(currentUser?.country ?? "Malaysia");
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identityBusy,  setIdentityBusy]  = useState(false);

  // ── Avatar ─────────────────────────────────────────────────────────────────
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarFile,    setAvatarFile]    = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarError,   setAvatarError]   = useState<string | null>(null);
  const [avatarBusy,    setAvatarBusy]    = useState(false);

  useEffect(() => {
    return () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); };
  }, [avatarPreview]);

  // ── Bio ────────────────────────────────────────────────────────────────────
  const [bio,      setBio]      = useState("");
  const [bioError, setBioError] = useState<string | null>(null);
  const [bioBusy,  setBioBusy]  = useState(false);

  const profileCompletion = computeProfileCompletion({
    fullName,
    avatarUrl: avatarPreview,
    bio,
    city,
    country,
  });

  useEffect(() => {
    fetch("/api/profile/me")
      .then((response) => response.ok ? response.json() : null)
      .then((body: { data?: { fullName?: string | null; avatarUrl?: string | null; bio?: string | null; city?: string | null; country?: string | null } } | null) => {
        const profile = body?.data;
        if (!profile) return;
        setFullName(profile.fullName ?? "");
        setCity(profile.city ?? "");
        setCountry(profile.country ?? "");
        setBio(profile.bio ?? "");
        if (profile.avatarUrl) setAvatarPreview(profile.avatarUrl);
      })
      .catch(() => undefined);
  }, []);

  // ── Phone handlers ─────────────────────────────────────────────────────────
  async function sendOtp() {
    const parsedPhone = parseInternationalPhone(phone);
    if (!parsedPhone.ok) { setPhoneError(parsedPhone.message); return; }
    setPhone(parsedPhone.e164);
    setPhoneError(null);
    setPhoneBusy(true);
    try {
      const res = await fetch("/api/phone/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: parsedPhone.e164 }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as any)?.error?.message ?? "Failed to send OTP");
      }
      setPhonePhase("verify");
      showFeedback("success", "Verification code sent.");
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : "Failed to send OTP");
    } finally {
      setPhoneBusy(false);
    }
  }

  async function verifyOtp() {
    if (!otp.trim()) { setPhoneError("Enter the OTP code"); return; }
    const parsedPhone = parseInternationalPhone(phone);
    if (!parsedPhone.ok) { setPhoneError(parsedPhone.message); return; }
    setPhone(parsedPhone.e164);
    setPhoneError(null);
    setPhoneBusy(true);
    try {
      const res = await fetch("/api/phone/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: parsedPhone.e164, code: otp.trim() }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as any)?.error?.message ?? "Invalid OTP");
      }
      await refreshUser();
      setStep(1);
      showFeedback("success", "Phone number verified.");
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : "Invalid OTP");
    } finally {
      setPhoneBusy(false);
    }
  }

  // ── Identity handler ───────────────────────────────────────────────────────
  async function submitIdentity() {
    if (!fullName.trim() || fullName.trim().length < 2) { setIdentityError("Full name must be at least 2 characters"); return; }
    if (!city.trim()) { setIdentityError("City is required"); return; }
    if (!country.trim()) { setIdentityError("Country is required"); return; }
    setIdentityError(null);
    setIdentityBusy(true);
    try {
      const res = await fetch("/api/profile/identity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: fullName.trim(), city: city.trim(), country: country.trim() }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as any)?.error?.message ?? "Failed to save identity");
      }
      await refreshUser();
      setStep(2);
      showFeedback("success", "Identity details saved.");
    } catch (err) {
      setIdentityError(err instanceof Error ? err.message : "Failed to save identity");
    } finally {
      setIdentityBusy(false);
    }
  }

  // ── Avatar handlers ────────────────────────────────────────────────────────
  function handleFileSelect(file: File | null) {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) { setAvatarError("Only JPG, PNG, or WebP images are accepted"); return; }
    if (file.size > 2 * 1024 * 1024) { setAvatarError("Image must be under 2 MB"); return; }
    setAvatarError(null);
    setAvatarFile(file);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function submitAvatar() {
    if (!avatarFile) { setAvatarError("Please select a photo"); return; }
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      const signRes = await fetch(`/api/profile/avatar?type=${encodeURIComponent(avatarFile.type)}`, { method: "PUT" });
      if (!signRes.ok) {
        const b = await signRes.json().catch(() => ({}));
        throw new Error((b as any)?.error?.message ?? "Failed to get upload URL");
      }
      const { data: { uploadUrl, path } } = await signRes.json() as { data: { uploadUrl: string; path: string } };

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": avatarFile.type },
        body: avatarFile,
      });
      if (!uploadRes.ok) throw new Error("Upload to storage failed");

      const confirmRes = await fetch("/api/profile/avatar/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!confirmRes.ok) {
        const b = await confirmRes.json().catch(() => ({}));
        throw new Error((b as any)?.error?.message ?? "Failed to confirm avatar");
      }
      await refreshUser();
      setStep(3);
      showFeedback("success", "Profile photo updated.");
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setAvatarBusy(false);
    }
  }

  // ── Bio handler ────────────────────────────────────────────────────────────
  async function submitBio() {
    if (bio.trim().length < 30) { setBioError("Bio must be between 30 and 200 characters"); return; }
    setBioError(null);
    setBioBusy(true);
    try {
      const res = await fetch("/api/profile/bio", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bio: bio.trim() }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as any)?.error?.message ?? "Failed to save bio");
      }
      setStep(4);
      showFeedback("success", "Bio saved.");
    } catch (err) {
      setBioError(err instanceof Error ? err.message : "Failed to save bio");
    } finally {
      setBioBusy(false);
    }
  }

  // ── Done state ─────────────────────────────────────────────────────────────
  const isDone = step === -1 || tier === "profile_complete" || tier === "kyc_verified";
  const wizardProgress = getWizardProgress(isDone ? -1 : step);

  if (isDone) return (
    <>
      <div className="mx-auto max-w-2xl px-4 pt-8 text-sm font-semibold text-primary" aria-label="Verification wizard complete">
        Step 5 of 5 · Current: Complete · 100% complete
      </div>
      <div className="mx-auto max-w-2xl px-4 pt-4"><ProfileCompletionCard percentage={profileCompletion.percentage} missing={profileCompletion.missing} /></div>
      <ProfileSections />
    </>
  );

  // ── Progress bar ───────────────────────────────────────────────────────────
  const visibleSteps = WIZARD_STEPS;
  const currentProgress = wizardProgress.currentStep - 1;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      <h1 className="text-2xl font-bold text-foreground mb-1 font-[family-name:var(--font-display)]">
        Complete Your Profile
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Finish all steps to unlock recommendation submissions and affiliate links.
      </p>
      <Link href="/customer/profile/register-vendor" className="mb-8 flex items-center justify-between gap-4 rounded-2xl border border-primary/15 bg-primary/[0.04] p-4 text-left transition hover:border-primary/30 hover:bg-primary/[0.08]">
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white"><Store size={18} /></span>
          <span><span className="block text-sm font-bold text-foreground">Have a business to share?</span><span className="mt-0.5 block text-xs text-muted-foreground">Start a vendor application after your profile setup</span></span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-primary" />
      </Link>

      <ProfileCompletionCard percentage={profileCompletion.percentage} missing={profileCompletion.missing} />

      {/* Progress */}
      <div className="flex items-end gap-1.5 mb-8">
        {visibleSteps.map(({ id, label }, i) => {
          const done   = i < currentProgress;
          const active = i === currentProgress;
          return (
            <div key={id} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full h-1.5 rounded-full transition-colors"
                style={{ backgroundColor: done || active ? "var(--primary)" : "var(--secondary)" }}
              />
              <span
                className="text-[10px] font-semibold"
                style={{ color: active ? "var(--primary)" : done ? "var(--primary)" : "var(--muted-foreground)", opacity: done ? 0.6 : 1 }}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mb-6 rounded-xl bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">Step {wizardProgress.currentStep} of {wizardProgress.totalSteps}</p>
        <p className="mt-1">Current: {wizardProgress.currentLabel}</p>
        {wizardProgress.nextLabel && <p className="mt-1">Next: {wizardProgress.nextLabel}</p>}
        <p className="mt-1 font-semibold text-primary">{wizardProgress.percentage}% complete</p>
      </div>

      {/* ── Step 0: Phone Verification ───────────────────────────────────── */}
      {step === 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Phone size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">Verify Your Phone Number</h2>
          </div>

          {phonePhase === "enter" ? (
            <>
              <p className="text-xs text-muted-foreground">Enter your phone number in international format. We&apos;ll send a 6-digit OTP.</p>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phone Number</label>
                <InternationalPhoneInput
                  id="profile-phone"
                  value={phone}
                  onChange={(value) => { setPhone(value); setPhoneError(null); }}
                  disabled={phoneBusy}
                  error={Boolean(phoneError)}
                />
                {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
              </div>
              <Button onClick={sendOtp} disabled={phoneBusy} className="w-full">
                {phoneBusy && <Loader2 size={14} className="animate-spin mr-1.5" />}
                {phoneBusy ? "Sending…" : "Send OTP"}
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">Enter the 6-digit code sent to <strong>{phone}</strong>.</p>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">OTP Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => { setOtp(e.target.value); setPhoneError(null); }}
                  placeholder="123456"
                  className="w-full px-3 py-2.5 text-sm rounded-xl border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30 tracking-widest text-center"
                  style={{ borderColor: phoneError ? "var(--destructive)" : "var(--border)" }}
                />
                {phoneError && <p className="text-xs text-destructive">{phoneError}</p>}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => { setPhonePhase("enter"); setOtp(""); setPhoneError(null); }}
                >
                  Change Number
                </Button>
                <Button onClick={verifyOtp} disabled={phoneBusy} className="flex-1">
                  {phoneBusy && <Loader2 size={14} className="animate-spin mr-1.5" />}
                  {phoneBusy ? "Verifying…" : "Verify OTP"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Step 1: Identity ─────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <User size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">Your Identity</h2>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Full Name</label>
            <input
              value={fullName}
              onChange={(e) => { setFullName(e.target.value); setIdentityError(null); }}
              placeholder="e.g. Ahmad Bin Ali"
              className="w-full px-3 py-2.5 text-sm rounded-xl border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              style={{ borderColor: identityError ? "var(--destructive)" : "var(--border)" }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">City</label>
            <input
              value={city}
              onChange={(e) => { setCity(e.target.value); setIdentityError(null); }}
              placeholder="e.g. Kuala Lumpur"
              className="w-full px-3 py-2.5 text-sm rounded-xl border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              style={{ borderColor: identityError ? "var(--destructive)" : "var(--border)" }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Country</label>
            <input
              value={country}
              onChange={(e) => { setCountry(e.target.value); setIdentityError(null); }}
              placeholder="e.g. Malaysia"
              className="w-full px-3 py-2.5 text-sm rounded-xl border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              style={{ borderColor: identityError ? "var(--destructive)" : "var(--border)" }}
            />
          </div>
          {identityError && <p className="text-xs text-destructive">{identityError}</p>}
          <Button onClick={submitIdentity} disabled={identityBusy} className="w-full">
            {identityBusy && <Loader2 size={14} className="animate-spin mr-1.5" />}
            {identityBusy ? "Saving…" : "Continue"}
          </Button>
        </div>
      )}

      {/* ── Step 2: Avatar ───────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">Profile Photo</h2>
          </div>
          <p className="text-xs text-muted-foreground">Upload a clear photo of yourself. JPG, PNG, or WebP · max 2 MB.</p>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => handleFileSelect(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full flex flex-col items-center justify-center gap-3 p-8 rounded-xl border-2 border-dashed transition-colors"
            style={{
              borderColor: avatarError ? "var(--destructive)" : avatarFile ? "var(--primary)" : "var(--border)",
              backgroundColor: avatarFile ? "color-mix(in srgb, var(--primary) 6%, transparent)" : "transparent",
            }}
          >
            {avatarPreview ? (
              <>
                <img src={avatarPreview} alt="preview" className="w-20 h-20 rounded-full object-cover border-2 border-primary" />
                <p className="text-xs text-muted-foreground">Click to change photo</p>
              </>
            ) : (
              <>
                <Upload size={24} className="text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Click to upload photo</p>
              </>
            )}
          </button>
          {avatarError && <p className="text-xs text-destructive">{avatarError}</p>}
          <Button onClick={submitAvatar} disabled={avatarBusy || !avatarFile} className="w-full">
            {avatarBusy && <Loader2 size={14} className="animate-spin mr-1.5" />}
            {avatarBusy ? "Uploading…" : "Upload Photo"}
          </Button>
        </div>
      )}

      {/* ── Step 3: Bio ──────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">About You</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            A short bio appears on your public profile and recommendation posts. Recommended length: 30–200 characters.
          </p>
          <div className="space-y-1">
            <textarea
              value={bio}
              onChange={(e) => { setBio(e.target.value); setBioError(null); }}
              placeholder="e.g. Malaysian travel enthusiast who loves discovering hidden gems and authentic local food…"
              rows={4}
              maxLength={200}
              className="w-full px-3 py-2.5 text-sm rounded-xl border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              style={{ borderColor: bioError ? "var(--destructive)" : "var(--border)" }}
            />
            <div className="flex justify-between items-center">
              {bioError ? <p className="text-xs text-destructive">{bioError}</p> : <span />}
              <p className="text-xs text-muted-foreground">{bio.length}/200</p>
            </div>
          </div>
          <Button onClick={submitBio} disabled={bioBusy} className="w-full">
            {bioBusy && <Loader2 size={14} className="animate-spin mr-1.5" />}
            {bioBusy ? "Saving…" : "Continue"}
          </Button>
        </div>
      )}

      {/* ── Step 4: Preferences ──────────────────────────────────────────── */}
      {step === 4 && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center gap-2">
            <ClipboardList size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">Travel Preferences</h2>
          </div>
          <p className="text-xs text-muted-foreground">These personalise your recommendation feed. You can change them anytime under Preferences.</p>
          <PreferencesEditor
            submitLabel="Complete Profile"
            onSaved={() => { void refreshUser(); setStep(-1); showFeedback("success", "Travel preferences saved."); }}
          />
        </div>
      )}
    </div>
  );
}
