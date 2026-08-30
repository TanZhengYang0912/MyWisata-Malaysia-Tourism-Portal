"use client";

import { useTranslation } from "react-i18next";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  User, Camera, MessageSquare, ClipboardList,
  Loader2,
} from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { Button } from "@/components/ui/button";
import { BusinessShareBanner } from "@/components/profile/business-share-banner";
import { VerificationPathCards } from "@/components/profile/verification-path-cards";
import { ProfileLocationFields } from "@/components/profile/profile-location-fields";
import { ProfilePhotoPicker } from "@/components/profile/profile-photo-picker";
import { ProfileSections } from "@/components/profile/profile-sections";
import { PreferencesEditor } from "@/components/profile/preferences-editor";
import { CustomerPageShell, CustomerPageTitle } from "@/components/customer/customer-page-shell";
import { getWizardProgress, WIZARD_STEPS } from "./wizard-progress";
import { GuestAccountEmptyState } from "@/components/customer/guest-account-empty-state";
import { postLoginPath } from "@/lib/auth/guest-mode";
import { identitySchema, bioSchema } from "@/lib/validation/profile-schemas";
import type { ProfileSummary } from "@/backend/core/types";

export default function ProfilePage() {
  const { t: tCustomer } = useTranslation("customer");
  const { currentUser, refreshUser } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const continuation = postLoginPath(searchParams.get("next"));
  const { showFeedback } = useActionFeedback();

  const [profile, setProfile] = useState<ProfileSummary | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);

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

  const loadProfile = useCallback(async () => {
    if (!currentUser) {
      setProfile(null);
      setProfileLoading(false);
      return null;
    }
    setProfileLoading(true);
    try {
      const response = await fetch("/api/profile/me", { cache: "no-store" });
      const body = await response.json() as { data?: ProfileSummary };
      if (!response.ok || !body.data) return null;
      const nextProfile = body.data;
      setProfile(nextProfile);
      setFullName(nextProfile.fullName ?? "");
      setCity(nextProfile.city ?? "");
      setCountry(nextProfile.country ?? "");
      setCityId(nextProfile.cityId);
      setCountryCode(nextProfile.countryCode);
      setBio(nextProfile.bio ?? "");
      return nextProfile;
    } catch {
      return null;
    } finally {
      setProfileLoading(false);
    }
  }, [currentUser, setBio, setCity, setCountry, setFullName]);

  useEffect(() => { void loadProfile(); }, [loadProfile]);

  // ── Identity handler ───────────────────────────────────────────────────────
  async function submitIdentity() {
    const parsed = identitySchema.safeParse({ fullName, city, country, cityId, countryCode });
    if (!parsed.success) { setIdentityError(tCustomer("ui.profileWizard.fullNameValidation")); return; }
    setIdentityError(null);
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
      await Promise.all([refreshUser(), loadProfile()]);
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
        throw new Error(tCustomer("ui.profileWizard.avatarUploadUrlError"));
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
        throw new Error(tCustomer("ui.profileWizard.avatarConfirmError"));
      }
      await Promise.all([refreshUser(), loadProfile()]);
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
      setAvatarFile(null);
      setAvatarPreview(null);
      showFeedback("success", tCustomer("ui.profileWizard.savePhoto"));
    } catch {
      setAvatarError(tCustomer("ui.profileWizard.savePhoto"));
    } finally {
      setAvatarBusy(false);
    }
  }

  // ── Bio handler ────────────────────────────────────────────────────────────
  async function submitBio() {
    const parsed = bioSchema.safeParse({ bio });
    if (!parsed.success) { setBioError(tCustomer("ui.profileWizard.bioValidation", { min: 30, max: 200 })); return; }
    setBioError(null);
    setBioBusy(true);
    try {
      const res = await fetch("/api/profile/bio", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        throw new Error(tCustomer("ui.profileWizard.saveDetails"));
      }
      await Promise.all([refreshUser(), loadProfile()]);
      showFeedback("success", tCustomer("ui.profileWizard.saveDetails"));
    } catch {
      setBioError(tCustomer("ui.profileWizard.saveDetails"));
    } finally {
      setBioBusy(false);
    }
  }

  async function handlePreferencesSaved() {
    await Promise.all([refreshUser(), loadProfile()]);
    showFeedback("success", tCustomer("ui.preferencesEditor.saved"));
    if (continuation) router.push(continuation);
  }

  if (!currentUser) return <CustomerPageShell><GuestAccountEmptyState title={tCustomer("ui.states.couldNotLoad")} description={tCustomer("ui.guest.accountHint")} nextPath={continuation ?? "/customer/profile"} /></CustomerPageShell>;
  if (profileLoading) return <CustomerPageShell><div className="py-8 text-center text-sm text-muted-foreground">{tCustomer("ui.states.loading")}</div></CustomerPageShell>;
  if (!profile) return <CustomerPageShell><div className="py-8 text-center text-sm text-destructive">{tCustomer("ui.states.couldNotLoad")}</div></CustomerPageShell>;

  // ── Done state ─────────────────────────────────────────────────────────────
  const isDone = profile.verification.complete;
  const wizardProgress = getWizardProgress(profile.verification);
  const activeStep = profile.verification.currentStep;
  const localizedStepLabel = (label: string) => tCustomer(`ui.profileWizard.steps.${label.toLowerCase()}`);

  if (isDone) return (
    <>
      <CustomerPageTitle
        eyebrow={tCustomer("accountGroups.account")}
        title={tCustomer("ui.profileWizard.title")}
        description={tCustomer("ui.profileWizard.description")}
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
      <div className="flex items-end gap-1.5 mb-8">
        {visibleSteps.map(({ id }) => {
          const done = profile.verification.completedSteps.includes(id);
          const active = id === activeStep;
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

      {/* ── Step 1: Identity ─────────────────────────────────────────────── */}
      {activeStep === "identity" && (
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
          </Button>
        </div>
      )}

      {/* ── Step 2: Avatar ───────────────────────────────────────────────── */}
      {activeStep === "avatar" && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Camera size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">{tCustomer("ui.profileWizard.profilePhoto")}</h2>
          </div>
          <p className="text-xs text-muted-foreground">{tCustomer("ui.profileWizard.photoDescription")}</p>
          <ProfilePhotoPicker
            variant="wizard"
            previewUrl={avatarPreview || profile.avatarUrl}
            error={avatarError}
            disabled={avatarBusy}
            onPhotoSelected={handleFileSelect}
            onError={setAvatarError}
          />
          <Button onClick={submitAvatar} disabled={avatarBusy || !avatarFile} className="w-full">
            {avatarBusy && <Loader2 size={14} className="animate-spin mr-1.5" />}
            {avatarBusy ? tCustomer("ui.states.submitting") : tCustomer("ui.profileWizard.savePhoto")}
          </Button>
        </div>
      )}

      {/* ── Step 3: Bio ──────────────────────────────────────────────────── */}
      {activeStep === "bio" && (
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
      {activeStep === "survey" && (
        <div className="rounded-2xl border border-border bg-card p-6 space-y-5">
          <div className="flex items-center gap-2">
            <ClipboardList size={18} className="text-primary" />
            <h2 className="font-bold text-foreground">{tCustomer("ui.preferencesPage.title")}</h2>
          </div>
          <p className="text-xs text-muted-foreground">{tCustomer("ui.preferencesPage.description")}</p>
          <PreferencesEditor
            submitLabel={tCustomer("ui.kyc.completeProfile")}
            onSaved={() => { void handlePreferencesSaved(); }}
          />
        </div>
      )}
      </CustomerPageShell>
    </>
  );
}
