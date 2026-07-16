"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Phone, User, Camera, MessageSquare, ClipboardList,
  Store, Upload, Loader2, ChevronRight, CheckCircle2,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { Button } from "@/components/ui/button";
import { InternationalPhoneInput } from "@/components/profile/international-phone-input";
import { ProfileSections } from "@/components/profile/profile-sections";
import { parseInternationalPhone } from "@/lib/phone/international";

const STEPS = [
  { id: "phone",    label: "Phone" },
  { id: "identity", label: "Identity" },
  { id: "avatar",   label: "Avatar" },
  { id: "bio",      label: "Bio" },
  { id: "survey",   label: "Survey" },
] as const;

const INTERESTS = ["Adventure", "Culture", "Food", "Shopping", "Wellness", "Nature", "Art", "Sports", "Photography", "Nightlife"];

const TRAVEL_STYLES = [
  { value: "solo",   label: "Solo Traveller" },
  { value: "couple", label: "Couple" },
  { value: "family", label: "Family" },
  { value: "group",  label: "Group" },
] as const;

const BUDGET_RANGES = [
  { value: "budget",    label: "Budget (< RM 100/day)" },
  { value: "mid_range", label: "Mid-range (RM 100–500/day)" },
  { value: "luxury",    label: "Luxury (> RM 500/day)" },
] as const;

const MOBILITY_NEEDS = [
  { value: "none",       label: "No restrictions" },
  { value: "limited",    label: "Some restrictions" },
  { value: "wheelchair", label: "Wheelchair accessible required" },
] as const;

function initialStep(tier: string): number {
  if (tier === "email_verified") return 0;
  if (tier === "phone_verified") return 1;
  return -1;
}

export default function ProfilePage() {
  const { currentUser, refreshUser } = useAuth();
  const { showFeedback } = useActionFeedback();

  const tier = currentUser?.verificationTier ?? "email_unverified";
  const startStep = tier === "email_verified" ? 0 : 1;
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

  // ── Survey ─────────────────────────────────────────────────────────────────
  const [interests,     setInterests]     = useState<string[]>([]);
  const [travelStyle,   setTravelStyle]   = useState("solo");
  const [budgetRange,   setBudgetRange]   = useState("mid_range");
  const [mobilityNeeds, setMobilityNeeds] = useState("none");
  const [surveyError,   setSurveyError]   = useState<string | null>(null);
  const [surveyBusy,    setSurveyBusy]    = useState(false);

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
    if (bio.trim().length < 10) { setBioError("Bio must be at least 10 characters"); return; }
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

  // ── Survey handler ─────────────────────────────────────────────────────────
  async function submitSurvey() {
    if (interests.length === 0) { setSurveyError("Select at least one interest"); return; }
    setSurveyError(null);
    setSurveyBusy(true);
    try {
      const res = await fetch("/api/profile/survey", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interests, travelStyle, budgetRange, mobilityNeeds }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as any)?.error?.message ?? "Failed to submit survey");
      }
      await refreshUser();
      setStep(-1);
      showFeedback("success", "Travel preferences saved.");
    } catch (err) {
      setSurveyError(err instanceof Error ? err.message : "Failed to submit survey");
    } finally {
      setSurveyBusy(false);
    }
  }

  // ── Done state ─────────────────────────────────────────────────────────────
  const isDone = step === -1 || tier === "profile_complete" || tier === "kyc_verified";

  if (isDone) return <ProfileSections />;

  // ── Progress bar ───────────────────────────────────────────────────────────
  const visibleSteps = STEPS.slice(startStep);
  const currentProgress = step - startStep;

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
            A short bio appears on your public profile and recommendation posts. Min 10, max 500 characters.
          </p>
          <div className="space-y-1">
            <textarea
              value={bio}
              onChange={(e) => { setBio(e.target.value); setBioError(null); }}
              placeholder="e.g. Malaysian travel enthusiast who loves discovering hidden gems and authentic local food…"
              rows={4}
              maxLength={500}
              className="w-full px-3 py-2.5 text-sm rounded-xl border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              style={{ borderColor: bioError ? "var(--destructive)" : "var(--border)" }}
            />
            <div className="flex justify-between items-center">
              {bioError ? <p className="text-xs text-destructive">{bioError}</p> : <span />}
              <p className="text-xs text-muted-foreground">{bio.length}/500</p>
            </div>
          </div>
          <Button onClick={submitBio} disabled={bioBusy} className="w-full">
            {bioBusy && <Loader2 size={14} className="animate-spin mr-1.5" />}
            {bioBusy ? "Saving…" : "Continue"}
          </Button>
        </div>
      )}

      {/* ── Step 4: Survey ───────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center gap-2">
            <ClipboardList size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">Travel Preferences</h2>
          </div>
          <p className="text-xs text-muted-foreground">Help us personalise your experience with a quick survey.</p>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Interests (select all that apply)</p>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((it) => {
                const key = it.toLowerCase();
                const sel = interests.includes(key);
                return (
                  <button
                    key={it}
                    type="button"
                    onClick={() => setInterests((prev) => sel ? prev.filter((x) => x !== key) : [...prev, key])}
                    className="px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors"
                    style={{
                      backgroundColor: sel ? "var(--primary)" : "transparent",
                      borderColor:     sel ? "var(--primary)" : "var(--border)",
                      color:           sel ? "white"           : "var(--foreground)",
                    }}
                  >
                    {it}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Travel Style</p>
            <div className="grid grid-cols-2 gap-2">
              {TRAVEL_STYLES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTravelStyle(value)}
                  className="px-3 py-2 text-sm rounded-xl border transition-colors text-left"
                  style={{
                    backgroundColor: travelStyle === value ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent",
                    borderColor:     travelStyle === value ? "var(--primary)" : "var(--border)",
                    color:           travelStyle === value ? "var(--primary)" : "var(--foreground)",
                    fontWeight:      travelStyle === value ? 600 : 400,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Budget Range</p>
            <div className="space-y-1.5">
              {BUDGET_RANGES.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setBudgetRange(value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border transition-colors text-left flex items-center gap-2"
                  style={{
                    backgroundColor: budgetRange === value ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent",
                    borderColor:     budgetRange === value ? "var(--primary)" : "var(--border)",
                    color:           budgetRange === value ? "var(--primary)" : "var(--foreground)",
                    fontWeight:      budgetRange === value ? 600 : 400,
                  }}
                >
                  {budgetRange === value && <CheckCircle2 size={13} />}
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Mobility Needs</p>
            <div className="space-y-1.5">
              {MOBILITY_NEEDS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setMobilityNeeds(value)}
                  className="w-full px-3 py-2 text-sm rounded-xl border transition-colors text-left flex items-center gap-2"
                  style={{
                    backgroundColor: mobilityNeeds === value ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "transparent",
                    borderColor:     mobilityNeeds === value ? "var(--primary)" : "var(--border)",
                    color:           mobilityNeeds === value ? "var(--primary)" : "var(--foreground)",
                    fontWeight:      mobilityNeeds === value ? 600 : 400,
                  }}
                >
                  {mobilityNeeds === value && <CheckCircle2 size={13} />}
                  {label}
                </button>
              ))}
            </div>
          </div>

          {surveyError && <p className="text-xs text-destructive">{surveyError}</p>}
          <Button onClick={submitSurvey} disabled={surveyBusy || interests.length === 0} className="w-full">
            {surveyBusy && <Loader2 size={14} className="animate-spin mr-1.5" />}
            {surveyBusy ? "Submitting…" : "Complete Profile"}
          </Button>
        </div>
      )}
    </div>
  );
}
