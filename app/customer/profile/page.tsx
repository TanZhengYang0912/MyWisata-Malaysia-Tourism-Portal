"use client";

import { useTranslation } from "react-i18next";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import { CustomerPageShell, CustomerPageTitle } from "@/components/customer/customer-page-shell";
import { getWizardProgress, WIZARD_STEPS } from "./wizard-progress";
import { GuestAccountEmptyState } from "@/components/customer/guest-account-empty-state";
import { postLoginPath } from "@/lib/auth/guest-mode";

function initialStep(tier: string): number {
  if (tier === "email_verified") return 0;
  if (tier === "phone_verified") return 1;
  return -1;
}

function ProfileCompletionCard({ percentage, missing, t }: { percentage: number; missing: string[]; t: (key: string, options?: Record<string, unknown>) => string }) {
  return (
    <section aria-label={t("ui.profileWizard.completion")} className="mb-6 rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-foreground">{t("ui.profileWizard.completion")}</p>
        <p className="font-semibold text-primary">{percentage}%</p>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-secondary" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage}>
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percentage}%` }} />
      </div>
      {missing.length > 0 && <p className="mt-2 text-xs text-muted-foreground">{t("ui.profileWizard.stillNeeded", { items: missing.map((item) => t(`ui.profileWizard.fields.${item}`)).join(", ") })}</p>}
    </section>
  );
}

export default function ProfilePage() {
  const { t: tCustomer } = useTranslation("customer");
  const { currentUser, refreshUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const continuation = postLoginPath(searchParams.get("next"));
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
    if (!currentUser) return;
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
  }, [currentUser]);

  // ── Phone handlers ─────────────────────────────────────────────────────────
  async function sendOtp() {
    const parsedPhone = parseInternationalPhone(phone);
    if (!parsedPhone.ok) { setPhoneError(tCustomer("ui.profileWizard.invalidPhone")); return; }
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        throw new Error((b as any)?.error?.message ?? tCustomer("ui.profileWizard.sendOtp"));
      }
      setPhonePhase("verify");
      showFeedback("success", tCustomer("ui.profileWizard.sendOtp"));
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : tCustomer("ui.profileWizard.sendOtp"));
    } finally {
      setPhoneBusy(false);
    }
  }

  async function verifyOtp() {
    if (!/^\d{6}$/.test(otp.trim())) { setPhoneError(tCustomer("ui.profileWizard.invalidOtp")); return; }
    const parsedPhone = parseInternationalPhone(phone);
    if (!parsedPhone.ok) { setPhoneError(tCustomer("ui.profileWizard.invalidPhone")); return; }
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        throw new Error((b as any)?.error?.message ?? tCustomer("ui.profileWizard.verifyOtp"));
      }
      await refreshUser();
      setStep(1);
      showFeedback("success", tCustomer("ui.profileWizard.verifyOtp"));
      if (continuation === "/customer/checkout") router.push(continuation);
    } catch (err) {
      setPhoneError(err instanceof Error ? err.message : tCustomer("ui.profileWizard.verifyOtp"));
    } finally {
      setPhoneBusy(false);
    }
  }

  // ── Identity handler ───────────────────────────────────────────────────────
  async function submitIdentity() {
    if (!fullName.trim() || fullName.trim().length < 2) { setIdentityError(tCustomer("ui.profileWizard.fullNameValidation")); return; }
    if (!city.trim()) { setIdentityError(tCustomer("ui.profileWizard.cityValidation")); return; }
    if (!country.trim()) { setIdentityError(tCustomer("ui.profileWizard.countryValidation")); return; }
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        throw new Error((b as any)?.error?.message ?? tCustomer("ui.profileWizard.saveDetails"));
      }
      await refreshUser();
      setStep(2);
      showFeedback("success", tCustomer("ui.profileWizard.saveDetails"));
    } catch (err) {
      setIdentityError(err instanceof Error ? err.message : tCustomer("ui.profileWizard.saveDetails"));
    } finally {
      setIdentityBusy(false);
    }
  }

  // ── Avatar handlers ────────────────────────────────────────────────────────
  function handleFileSelect(file: File | null) {
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) { setAvatarError(tCustomer("ui.profileWizard.photoTypeValidation")); return; }
    if (file.size > 2 * 1024 * 1024) { setAvatarError(tCustomer("ui.profileWizard.photoSizeValidation")); return; }
    setAvatarError(null);
    setAvatarFile(file);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function submitAvatar() {
    if (!avatarFile) { setAvatarError(tCustomer("ui.profileWizard.choosePhoto")); return; }
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      const signRes = await fetch(`/api/profile/avatar?type=${encodeURIComponent(avatarFile.type)}`, { method: "PUT" });
      if (!signRes.ok) {
        const b = await signRes.json().catch(() => ({}));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        throw new Error((b as any)?.error?.message ?? tCustomer("ui.profileWizard.avatarUploadUrlError"));
      }
      const { data: { uploadUrl, path } } = await signRes.json() as { data: { uploadUrl: string; path: string } };

      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": avatarFile.type },
        body: avatarFile,
      });
      if (!uploadRes.ok) throw new Error(tCustomer("ui.profileWizard.avatarStorageError"));

      const confirmRes = await fetch("/api/profile/avatar/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!confirmRes.ok) {
        const b = await confirmRes.json().catch(() => ({}));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        throw new Error((b as any)?.error?.message ?? tCustomer("ui.profileWizard.avatarConfirmError"));
      }
      await refreshUser();
      setStep(3);
      showFeedback("success", tCustomer("ui.profileWizard.savePhoto"));
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : tCustomer("ui.profileWizard.savePhoto"));
    } finally {
      setAvatarBusy(false);
    }
  }

  // ── Bio handler ────────────────────────────────────────────────────────────
  async function submitBio() {
    if (bio.trim().length < 30 || bio.trim().length > 200) { setBioError(tCustomer("ui.profileWizard.bioValidation", { min: 30, max: 200 })); return; }
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        throw new Error((b as any)?.error?.message ?? tCustomer("ui.profileWizard.saveDetails"));
      }
      setStep(4);
      showFeedback("success", tCustomer("ui.profileWizard.saveDetails"));
      if (continuation) router.push(continuation);
    } catch (err) {
      setBioError(err instanceof Error ? err.message : tCustomer("ui.profileWizard.saveDetails"));
    } finally {
      setBioBusy(false);
    }
  }

  // ── Done state ─────────────────────────────────────────────────────────────
  const isDone = step === -1 || tier === "profile_complete" || tier === "kyc_verified";
  const wizardProgress = getWizardProgress(isDone ? -1 : step);
  const localizedStepLabel = (label: string) => tCustomer(`ui.profileWizard.steps.${label.toLowerCase()}`);

  if (!currentUser) return <CustomerPageShell><GuestAccountEmptyState title={tCustomer("ui.states.couldNotLoad")} description={tCustomer("ui.guest.accountHint")} nextPath={continuation ?? "/customer/profile"} /></CustomerPageShell>;

  if (isDone) return (
    <>
      <CustomerPageTitle
        eyebrow={tCustomer("accountGroups.account")}
        title={tCustomer("ui.profileWizard.title")}
        description={tCustomer("ui.profileWizard.description")}
      />
      <CustomerPageShell className="pt-0 pb-0 sm:pt-0">
        <div className="text-sm font-semibold text-primary" aria-label={tCustomer("ui.profileWizard.verificationComplete")}>
          {tCustomer("ui.profileWizard.stepOf", { current: 5, total: 5 })} · {tCustomer("ui.profileWizard.current", { label: tCustomer("ui.profileWizard.steps.complete") })} · {tCustomer("ui.profileWizard.percentComplete", { percent: 100 })}
        </div>
        <div className="pt-4"><ProfileCompletionCard percentage={profileCompletion.percentage} missing={profileCompletion.missing} t={tCustomer} /></div>
        {continuation && <Button asChild className="mt-4"><Link href={continuation}>{tCustomer("ui.profileWizard.continue")}</Link></Button>}
      </CustomerPageShell>
      <ProfileSections shellClassName="pt-0 sm:pt-0" showHeader={false} />
    </>
  );

  // ── Progress bar ───────────────────────────────────────────────────────────
  const visibleSteps = WIZARD_STEPS;
  const currentProgress = wizardProgress.currentStep - 1;

  return (
    <>
      <CustomerPageTitle
        eyebrow={tCustomer("accountGroups.account")}
        title={tCustomer("ui.profileWizard.completeTitle")}
        description={tCustomer("ui.profileWizard.completeDescription")}
      />
      <CustomerPageShell className="pt-0 sm:pt-0">
      <Link href="/customer/profile/register-vendor" className="mb-8 flex items-center justify-between gap-4 rounded-2xl border border-primary/15 bg-primary/[0.04] p-4 text-left transition hover:border-primary/30 hover:bg-primary/[0.08]">
        <span className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-white"><Store size={18} /></span>
          <span><span className="block text-sm font-bold text-foreground">{tCustomer("ui.profileWizard.businessPrompt")}</span><span className="mt-0.5 block text-xs text-muted-foreground">{tCustomer("ui.profileWizard.businessDescription")}</span></span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-primary" />
      </Link>

      <ProfileCompletionCard percentage={profileCompletion.percentage} missing={profileCompletion.missing} t={tCustomer} />

      {/* Progress */}
      <div className="flex items-end gap-1.5 mb-8">
        {visibleSteps.map(({ id }, i) => {
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
                {tCustomer(`ui.profileWizard.steps.${id}`)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mb-6 rounded-xl bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">{tCustomer("ui.profileWizard.stepOf", { current: wizardProgress.currentStep, total: wizardProgress.totalSteps })}</p>
        <p className="mt-1">{tCustomer("ui.profileWizard.current", { label: localizedStepLabel(wizardProgress.currentLabel) })}</p>
        {wizardProgress.nextLabel && <p className="mt-1">{tCustomer("ui.profileWizard.next", { label: localizedStepLabel(wizardProgress.nextLabel) })}</p>}
        <p className="mt-1 font-semibold text-primary">{tCustomer("ui.profileWizard.percentComplete", { percent: wizardProgress.percentage })}</p>
      </div>

      {/* ── Step 0: Phone Verification ───────────────────────────────────── */}
      {step === 0 && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Phone size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">{tCustomer("ui.profileWizard.verifyPhone")}</h2>
          </div>

          {phonePhase === "enter" ? (
            <>
              <p className="text-xs text-muted-foreground">{tCustomer("ui.profileWizard.phoneDescription")}</p>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCustomer("ui.profileWizard.phoneNumber")}</label>
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
                {phoneBusy ? tCustomer("ui.profileWizard.sending") : tCustomer("ui.profileWizard.sendOtp")}
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{tCustomer("ui.profileWizard.otpDescription", { phone })}</p>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCustomer("ui.profileWizard.otpCode")}</label>
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
                  {tCustomer("ui.profileWizard.changeNumber")}
                </Button>
                <Button onClick={verifyOtp} disabled={phoneBusy} className="flex-1">
                  {phoneBusy && <Loader2 size={14} className="animate-spin mr-1.5" />}
                  {phoneBusy ? tCustomer("ui.profileWizard.verifying") : tCustomer("ui.profileWizard.verifyOtp")}
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
            <h2 className="font-bold text-foreground">{tCustomer("ui.profileWizard.identity")}</h2>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCustomer("ui.profileWizard.fullName")}</label>
            <input
              value={fullName}
              onChange={(e) => { setFullName(e.target.value); setIdentityError(null); }}
              placeholder={tCustomer("ui.profileWizard.fullNamePlaceholder")}
              className="w-full px-3 py-2.5 text-sm rounded-xl border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              style={{ borderColor: identityError ? "var(--destructive)" : "var(--border)" }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCustomer("ui.profileWizard.city")}</label>
            <input
              value={city}
              onChange={(e) => { setCity(e.target.value); setIdentityError(null); }}
              placeholder={tCustomer("ui.profileWizard.cityPlaceholder")}
              className="w-full px-3 py-2.5 text-sm rounded-xl border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              style={{ borderColor: identityError ? "var(--destructive)" : "var(--border)" }}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{tCustomer("ui.profileWizard.country")}</label>
            <input
              value={country}
              onChange={(e) => { setCountry(e.target.value); setIdentityError(null); }}
              placeholder={tCustomer("ui.profileWizard.countryPlaceholder")}
              className="w-full px-3 py-2.5 text-sm rounded-xl border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30"
              style={{ borderColor: identityError ? "var(--destructive)" : "var(--border)" }}
            />
          </div>
          {identityError && <p className="text-xs text-destructive">{identityError}</p>}
          <Button onClick={submitIdentity} disabled={identityBusy} className="w-full">
            {identityBusy && <Loader2 size={14} className="animate-spin mr-1.5" />}
            {identityBusy ? tCustomer("ui.preferencesEditor.saving") : tCustomer("ui.profileWizard.continue")}
          </Button>
        </div>
      )}

      {/* ── Step 2: Avatar ───────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">{tCustomer("ui.profileWizard.profilePhoto")}</h2>
          </div>
          <p className="text-xs text-muted-foreground">{tCustomer("ui.profileWizard.photoDescription")}</p>
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
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={avatarPreview} alt={tCustomer("ui.profileWizard.profilePhoto")} className="w-20 h-20 rounded-full object-cover border-2 border-primary" />
                <p className="text-xs text-muted-foreground">{tCustomer("ui.profileWizard.choosePhoto")}</p>
              </>
            ) : (
              <>
                <Upload size={24} className="text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{tCustomer("ui.profileWizard.choosePhoto")}</p>
              </>
            )}
          </button>
          {avatarError && <p className="text-xs text-destructive">{avatarError}</p>}
          <Button onClick={submitAvatar} disabled={avatarBusy || !avatarFile} className="w-full">
            {avatarBusy && <Loader2 size={14} className="animate-spin mr-1.5" />}
            {avatarBusy ? tCustomer("ui.states.submitting") : tCustomer("ui.profileWizard.choosePhoto")}
          </Button>
        </div>
      )}

      {/* ── Step 3: Bio ──────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">{tCustomer("ui.profileWizard.bio")}</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {tCustomer("ui.profileWizard.bio")}
          </p>
          <div className="space-y-1">
            <textarea
              value={bio}
              onChange={(e) => { setBio(e.target.value); setBioError(null); }}
              placeholder={tCustomer("ui.profileWizard.bioPlaceholder")}
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
            {bioBusy ? tCustomer("ui.preferencesEditor.saving") : tCustomer("ui.profileWizard.continue")}
          </Button>
        </div>
      )}

      {/* ── Step 4: Preferences ──────────────────────────────────────────── */}
      {step === 4 && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center gap-2">
            <ClipboardList size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">{tCustomer("ui.preferencesPage.title")}</h2>
          </div>
          <p className="text-xs text-muted-foreground">{tCustomer("ui.preferencesPage.description")}</p>
          <PreferencesEditor
            submitLabel={tCustomer("ui.kyc.completeProfile")}
            onSaved={() => { void refreshUser(); setStep(-1); showFeedback("success", tCustomer("ui.preferencesEditor.saved")); }}
          />
        </div>
      )}
      </CustomerPageShell>
    </>
  );
}
