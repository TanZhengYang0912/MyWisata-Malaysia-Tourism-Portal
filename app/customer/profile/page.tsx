"use client";

import { useTranslation } from "react-i18next";
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  User, Camera, MessageSquare,
  Loader2, ArrowLeft, ArrowRight,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { Button } from "@/components/ui/button";
import { BusinessShareBanner } from "@/components/profile/business-share-banner";
import { VerificationPathCards } from "@/components/profile/verification-path-cards";
import { ProfileLocationFields } from "@/components/profile/profile-location-fields";
import { ProfilePhotoPicker } from "@/components/profile/profile-photo-picker";
import { ProfileSections } from "@/components/profile/profile-sections";
import { CustomerPageShell, CustomerPageTitle } from "@/components/customer/customer-page-shell";
import { canVisitWizardStep, getWizardProgress, WIZARD_STEPS, type WizardStep } from "./wizard-progress";
import { GuestAccountEmptyState } from "@/components/customer/guest-account-empty-state";
import { postLoginPath } from "@/lib/auth/guest-mode";
import { identitySchema, bioSchema } from "@/lib/validation/profile-schemas";
import { PROFILE_BIO_MIN_LENGTH, PROFILE_BIO_MAX_LENGTH } from "@/lib/verification/eligibility";
import type { ProfileSummary } from "@/backend/core/types";
import { AVATAR_MAX_BYTES, formatAvatarFileSize, getAvatarUploadStartFailure } from "@/lib/profile/avatar-validation";

export default function ProfilePage() {
  const { currentUser } = useAuth();
  return <ProfileWizard key={currentUser?.id ?? "guest"} userId={currentUser?.id ?? null} />;
}

function ProfileWizard({ userId }: { userId: string | null }) {
  const { t: tCustomer } = useTranslation("customer");
  const { currentUser, refreshUser } = useAuth();
  const searchParams = useSearchParams();
  const continuation = postLoginPath(searchParams.get("next"));
  const { showFeedback } = useActionFeedback();

  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [selectedStep, setSelectedStep] = useState<WizardStep | null>(null);
  const mounted = useRef(false);
  const profileRequest = useRef(0);

  // ── Identity ───────────────────────────────────────────────────────────────
  const [fullName, setFullName]         = useState(currentUser?.name !== currentUser?.email ? (currentUser?.name ?? "") : "");
  const [city,     setCity]             = useState(currentUser?.city ?? "");
  const [country,  setCountry]          = useState(currentUser?.country ?? "Malaysia");
  const [cityId, setCityId]             = useState<string | null>(null);
  const [countryCode, setCountryCode]   = useState<string | null>(currentUser?.country === "Malaysia" ? "MY" : null);
  const [identityError, setIdentityError] = useState<string | null>(null);
  const [identityBusy,  setIdentityBusy]  = useState(false);

  // ── Avatar ─────────────────────────────────────────────────────────────────
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

  const loadProfile = useCallback(async (hydrateDrafts = false) => {
    if (!userId) {
      setProfile(null);
      setProfileLoading(false);
      return null;
    }
    if (!mounted.current) return null;
    const requestId = ++profileRequest.current;
    if (hydrateDrafts) setProfileLoading(true);
    try {
      const response = await fetch("/api/profile/me", { cache: "no-store" });
      const body = await response.json() as { data?: ProfileSummary };
      if (!mounted.current || requestId !== profileRequest.current || !response.ok || body.data?.id !== userId) return null;
      const nextProfile = body.data;
      setProfile(nextProfile);
      // Background saves refresh completion evidence without replacing other drafts.
      if (hydrateDrafts) {
        setFullName(nextProfile.fullName ?? "");
        setCity(nextProfile.city ?? "");
        setCountry(nextProfile.country ?? "");
        setCityId(nextProfile.cityId);
        setCountryCode(nextProfile.countryCode);
        setBio(nextProfile.bio ?? "");
      }
      return nextProfile;
    } catch {
      return null;
    } finally {
      if (mounted.current && requestId === profileRequest.current) setProfileLoading(false);
    }
  }, [userId]);

  // This effect starts the initial request for the signed-in user’s saved profile.
  useEffect(() => {
    mounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProfile(true);
    return () => { mounted.current = false; profileRequest.current += 1; };
  }, [loadProfile]);

  function advanceTo(step: WizardStep, savedProfile = profile) {
    if (!mounted.current || !savedProfile) return;
    setSelectedStep(canVisitWizardStep(savedProfile.verification, step) ? step : savedProfile.verification.currentStep);
  }

  // ── Identity handler ───────────────────────────────────────────────────────
  async function submitIdentity() {
    const parsed = identitySchema.safeParse({ fullName, city, country, cityId, countryCode });
    if (!parsed.success) { setIdentityError(tCustomer("ui.profileWizard.fullNameValidation")); return; }
    setIdentityError(null);
    if (profile?.verification.completedSteps.includes("identity")
      && parsed.data.fullName === profile.fullName && parsed.data.city === profile.city
      && parsed.data.country === profile.country && cityId === profile.cityId && countryCode === profile.countryCode) {
      advanceTo("avatar");
      return;
    }
    setIdentityBusy(true);
    try {
      const res = await fetch("/api/profile/identity", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        throw new Error(tCustomer("ui.profileWizard.saveDetails"));
      }
      if (!mounted.current) return;
      setSelectedStep("identity");
      const [, savedProfile] = await Promise.all([refreshUser(), loadProfile()]);
      if (!mounted.current) return;
      if (!savedProfile) throw new Error("Profile refresh failed");
      advanceTo("avatar", savedProfile);
      showFeedback("success", tCustomer("ui.profileWizard.saveDetails"));
    } catch {
      setIdentityError(tCustomer("ui.profileWizard.saveDetails"));
    } finally {
      setIdentityBusy(false);
    }
  }

  // ── Avatar handlers ────────────────────────────────────────────────────────
  function handleFileSelect(file: File | null) {
    if (!file) return;
    setAvatarError(null);
    setAvatarFile(file);
    if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function submitAvatar() {
    if (!avatarFile && profile?.verification.completedSteps.includes("avatar")) { advanceTo("bio"); return; }
    if (!avatarFile) { setAvatarError(tCustomer("ui.profileWizard.choosePhoto")); return; }
    setAvatarError(null);
    setAvatarBusy(true);
    let failureMessage = tCustomer("ui.profileWizard.avatarUploadUrlError");
    try {
      const signRes = await fetch(`/api/profile/avatar?type=${encodeURIComponent(avatarFile.type)}`, { method: "PUT" });
      if (!mounted.current) return;
      if (!signRes.ok) {
        const failure = await getAvatarUploadStartFailure(signRes);
        const message = failure === "session-expired"
          ? tCustomer("ui.profileWizard.avatarSessionExpired")
          : failure === "unsupported-type"
            ? tCustomer("ui.profileWizard.photoTypeValidation")
            : failure === "service-unavailable"
              ? tCustomer("ui.profileWizard.avatarUploadUnavailable")
              : failureMessage;
        setAvatarError(message);
        return;
      }
      const { data: { uploadUrl, path } } = await signRes.json() as { data: { uploadUrl: string; path: string } };

      failureMessage = tCustomer("ui.profileWizard.avatarStorageError");
      const uploadRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": avatarFile.type },
        body: avatarFile,
      });
      if (!mounted.current) return;
      if (!uploadRes.ok) {
        if (uploadRes.status === 413 && avatarFile.size > AVATAR_MAX_BYTES) {
          setAvatarError(tCustomer("ui.profileWizard.photoSizeValidation", { size: formatAvatarFileSize(avatarFile.size) }));
          return;
        }
        setAvatarError(failureMessage);
        return;
      }

      failureMessage = tCustomer("ui.profileWizard.avatarConfirmError");
      const confirmRes = await fetch("/api/profile/avatar/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      if (!mounted.current) return;
      if (!confirmRes.ok) {
        const body = await confirmRes.json().catch(() => null) as { error?: { code?: string } } | null;
        if (body?.error?.code === "INVALID_IMAGE") {
          const message = avatarFile.size > AVATAR_MAX_BYTES
            ? tCustomer("ui.profileWizard.photoSizeValidation", { size: formatAvatarFileSize(avatarFile.size) })
            : tCustomer("ui.profileWizard.photoInvalidValidation");
          setAvatarError(message);
          return;
        }
        setAvatarError(failureMessage);
        return;
      }
      setSelectedStep("avatar");
      const [, savedProfile] = await Promise.all([refreshUser(), loadProfile()]);
      if (!mounted.current) return;
      if (!savedProfile) throw new Error("Profile refresh failed");
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarFile(null);
      setAvatarPreview(null);
      advanceTo("bio", savedProfile);
      showFeedback("success", tCustomer("ui.profileWizard.savePhoto"));
    } catch {
      setAvatarError(failureMessage);
    } finally {
      setAvatarBusy(false);
    }
  }

  // ── Bio handler ────────────────────────────────────────────────────────────
  async function submitBio() {
    if (profile?.verification.completedSteps.includes("bio") && bio.trim() === (profile.bio ?? "").trim()) {
      advanceTo("bio");
      return;
    }
    const parsed = bioSchema.safeParse({ bio });
    if (!parsed.success) { setBioError(tCustomer("ui.profileWizard.bioValidation", { min: PROFILE_BIO_MIN_LENGTH, max: PROFILE_BIO_MAX_LENGTH })); return; }
    setBioError(null);
    setBioBusy(true);
    try {
      const res = await fetch("/api/profile/bio", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error?.code === "PERSONAL_DATA_REMOVE"
          ? tCustomer("ui.profileWizard.privacyBlocked")
          : tCustomer("ui.profileWizard.saveDetails"));
      }
      if (!mounted.current) return;
      setSelectedStep("bio");
      const [, savedProfile] = await Promise.all([refreshUser(), loadProfile()]);
      if (!mounted.current) return;
      if (!savedProfile) throw new Error("Profile refresh failed");
      advanceTo("bio", savedProfile);
      showFeedback("success", tCustomer("ui.profileWizard.saveDetails"));
    } catch (cause) {
      setBioError(cause instanceof Error ? cause.message : tCustomer("ui.profileWizard.saveDetails"));
    } finally {
      setBioBusy(false);
    }
  }

  if (!currentUser) return <CustomerPageShell><GuestAccountEmptyState title={tCustomer("ui.states.couldNotLoad")} description={tCustomer("ui.guest.accountHint")} nextPath={continuation ?? "/customer/profile"} /></CustomerPageShell>;
  if (profileLoading) return <CustomerPageShell><div className="py-8 text-center text-sm text-muted-foreground">{tCustomer("ui.states.loading")}</div></CustomerPageShell>;
  if (!profile) return <CustomerPageShell><div className="py-8 text-center text-sm text-destructive">{tCustomer("ui.states.couldNotLoad")}</div></CustomerPageShell>;

  // ── Done state ─────────────────────────────────────────────────────────────
  const isDone = profile.verification.complete && selectedStep == null;
  const activeStep = selectedStep && canVisitWizardStep(profile.verification, selectedStep) ? selectedStep : profile.verification.currentStep;
  const wizardProgress = getWizardProgress(profile.verification, isDone ? null : activeStep);
  const isSaving = identityBusy || avatarBusy || bioBusy;
  const localizedStepLabel = (label: string) => tCustomer(`ui.profileWizard.steps.${label.toLowerCase()}`);

  if (isDone) return (
    <>
      <CustomerPageTitle
        eyebrow={tCustomer("accountGroups.account")}
        title={tCustomer("ui.profileWizard.title")}
      />
      <CustomerPageShell wide className="pt-0 pb-0 sm:pt-0">
        <BusinessShareBanner />
        <VerificationPathCards
          phoneVerified={profile.phoneVerified}
          kycStatus={profile.kycStatus}
        />
        <div className="text-sm font-semibold text-primary" aria-label={tCustomer("ui.profileWizard.verificationComplete")}>
          {tCustomer("ui.profileWizard.stepOf", { current: wizardProgress.totalSteps, total: wizardProgress.totalSteps })} · {tCustomer("ui.profileWizard.current", { label: tCustomer("ui.profileWizard.steps.complete") })} · {tCustomer("ui.profileWizard.percentComplete", { percent: wizardProgress.percentage })}
        </div>
        {continuation && <Button asChild className="mt-4"><Link href={continuation}>{tCustomer("ui.profileWizard.continue")}</Link></Button>}
        <Button asChild variant="outline" className="mt-4"><Link href="/customer/preferences">{tCustomer("ui.preferencesPage.title")}</Link></Button>
      </CustomerPageShell>
      <ProfileSections wide shellClassName="pt-0 sm:pt-0" showHeader={false} />
    </>
  );

  // ── Progress bar ───────────────────────────────────────────────────────────
  const visibleSteps = WIZARD_STEPS;

  return (
    <>
      <CustomerPageTitle
        eyebrow={tCustomer("accountGroups.account")}
        title={tCustomer("ui.profileWizard.completeTitle")}
        description={tCustomer("ui.profileWizard.completeDescription")}
      />
      <CustomerPageShell wide className="pt-0 sm:pt-0">
      <BusinessShareBanner />
      <VerificationPathCards
        phoneVerified={profile.phoneVerified}
        kycStatus={profile.kycStatus}
      />

      {/* Progress */}
      <nav className="flex items-end gap-1.5 mb-8" aria-label={tCustomer("ui.profileWizard.title")}>
        {visibleSteps.map(({ id }) => {
          const done = profile.verification.completedSteps.includes(id);
          const active = id === activeStep;
          return (
            <Button key={id} variant="ghost" className="h-auto min-w-0 flex-1 flex-col gap-1 p-0 hover:bg-transparent"
              aria-current={active ? "step" : undefined}
              disabled={isSaving || !canVisitWizardStep(profile.verification, id)} onClick={() => setSelectedStep(id)}>
              <span
                className="w-full h-1.5 rounded-full transition-colors"
                style={{ backgroundColor: done || active ? "var(--primary)" : "var(--secondary)" }}
              />
              <span
                className="text-[10px] font-semibold"
                style={{ color: active ? "var(--primary)" : done ? "var(--primary)" : "var(--muted-foreground)", opacity: done ? 0.6 : 1 }}
              >
                {tCustomer(`ui.profileWizard.steps.${id}`)}
              </span>
            </Button>
          );
        })}
      </nav>
      <div className="mb-6 rounded-xl bg-secondary/40 px-4 py-3 text-xs text-muted-foreground">
        <p className="font-semibold text-foreground">{tCustomer("ui.profileWizard.stepOf", { current: wizardProgress.currentStep, total: wizardProgress.totalSteps })}</p>
        <p className="mt-1">{tCustomer("ui.profileWizard.current", { label: localizedStepLabel(wizardProgress.currentLabel) })}</p>
        {wizardProgress.nextLabel && <p className="mt-1">{tCustomer("ui.profileWizard.next", { label: localizedStepLabel(wizardProgress.nextLabel) })}</p>}
        <p className="mt-1 font-semibold text-primary">{tCustomer("ui.profileWizard.percentComplete", { percent: wizardProgress.percentage })}</p>
      </div>

      {/* ── Step 1: Identity ─────────────────────────────────────────────── */}
      {activeStep === "identity" && (
        <fieldset disabled={isSaving} className="rounded-2xl border border-border bg-card p-6 space-y-4">
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
          <ProfileLocationFields
            value={{ city, country, cityId, countryCode }}
            error={Boolean(identityError)}
            disabled={identityBusy}
            onChange={(location) => {
              setCity(location.city);
              setCountry(location.country);
              setCityId(location.cityId);
              setCountryCode(location.countryCode);
              setIdentityError(null);
            }}
          />
          {identityError && <p className="text-xs text-destructive">{identityError}</p>}
          <Button onClick={submitIdentity} disabled={identityBusy} className="w-full">
            {identityBusy && <Loader2 size={14} className="animate-spin mr-1.5" />}
            {identityBusy ? tCustomer("ui.preferencesEditor.saving") : tCustomer("ui.profileWizard.continue")}
            <ArrowRight aria-hidden="true" />
          </Button>
        </fieldset>
      )}

      {/* ── Step 2: Avatar ───────────────────────────────────────────────── */}
      {activeStep === "avatar" && (
        <fieldset disabled={isSaving} className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">{tCustomer("ui.profileWizard.profilePhoto")}</h2>
          </div>
          <ProfilePhotoPicker
            variant="wizard"
            previewUrl={avatarPreview || profile.avatarUrl}
            error={avatarError}
            disabled={avatarBusy}
            onPhotoSelected={handleFileSelect}
            onError={setAvatarError}
          />
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="w-full min-w-0" onClick={() => advanceTo("identity")}><ArrowLeft aria-hidden="true" />{tCustomer("ui.profileWizard.previous")}</Button>
            <Button onClick={submitAvatar} disabled={avatarBusy || (!avatarFile && !profile.verification.completedSteps.includes("avatar"))} className="w-full min-w-0">
              {avatarBusy && <Loader2 size={14} className="animate-spin mr-1.5" />}
              {avatarBusy ? tCustomer("ui.states.submitting") : avatarFile ? tCustomer("ui.profileWizard.savePhoto") : tCustomer("ui.profileWizard.continue")}
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </fieldset>
      )}

      {/* ── Step 3: Bio ──────────────────────────────────────────────────── */}
      {activeStep === "bio" && (
        <fieldset disabled={isSaving} className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <MessageSquare size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">{tCustomer("ui.profileWizard.bio")}</h2>
          </div>
          <div className="space-y-1">
            <textarea
              value={bio}
              onChange={(e) => { setBio(e.target.value); setBioError(null); }}
              placeholder={tCustomer("ui.profileWizard.bioPlaceholder")}
              rows={4}
              maxLength={PROFILE_BIO_MAX_LENGTH}
              className="w-full px-3 py-2.5 text-sm rounded-xl border bg-background text-foreground outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              style={{ borderColor: bioError ? "var(--destructive)" : "var(--border)" }}
            />
            <div className="flex justify-between items-center">
              {bioError ? <p className="text-xs text-destructive">{bioError}</p> : <span />}
              <p className="text-xs text-muted-foreground">{bio.length}/{PROFILE_BIO_MAX_LENGTH}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" className="w-full min-w-0" onClick={() => advanceTo("avatar")}><ArrowLeft aria-hidden="true" />{tCustomer("ui.profileWizard.previous")}</Button>
            <Button onClick={submitBio} disabled={bioBusy} className="w-full min-w-0">
              {bioBusy && <Loader2 size={14} className="animate-spin mr-1.5" />}
              {bioBusy ? tCustomer("ui.preferencesEditor.saving") : tCustomer("ui.profileWizard.continue")}
              <ArrowRight aria-hidden="true" />
            </Button>
          </div>
        </fieldset>
      )}

      </CustomerPageShell>
    </>
  );
}
