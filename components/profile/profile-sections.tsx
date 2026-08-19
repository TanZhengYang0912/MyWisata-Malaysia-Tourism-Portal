"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Camera, CheckCircle2, ChevronRight, Loader2, MessageCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth";
import { useSupportChat } from "@/components/providers/support-chat";
import type { ProfileSummary } from "@/backend/core/types";
import { apiErrorMessage } from "@/lib/profile/api-error-message";
import { InternationalPhoneInput } from "@/components/profile/international-phone-input";
import { parseInternationalPhone } from "@/lib/phone/international";
import { getDiscoveryCategoryLabel } from "@/lib/customer/discovery-categories";
import { CustomerPageHeader, CustomerPageShell } from "@/components/customer/customer-page-shell";
import { LanguageSwitcher } from "@/components/shared/language-switcher";

type SectionId = "personal" | "contact";
const MIN_BIO_LENGTH = 30;
const MAX_BIO_LENGTH = 200;

const interestLabel = (slug: string) => getDiscoveryCategoryLabel(slug);

function SectionCard({ id, title, description, children }: { id?: string; title: string; description: string; children: React.ReactNode }) {
  return <section id={id} className="scroll-mt-24 rounded-2xl border border-border bg-card p-5 sm:p-6"><div className="mb-4"><h2 className="font-bold text-foreground">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{description}</p></div>{children}</section>;
}

function StatusBadge({ label, good = false }: { label: string; good?: boolean }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${good ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>{good && <CheckCircle2 size={12} />}{label}</span>;
}

export function ProfileSections({ shellClassName, showHeader = true }: { shellClassName?: string; showHeader?: boolean } = {}) {
  const { currentUser, refreshUser } = useAuth();
  const { setOpen: setSupportChatOpen } = useSupportChat();
  const { t: tCommon } = useTranslation("common");
  const { t: tCustomer } = useTranslation("customer");
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const otpRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [summary, setSummary] = useState<ProfileSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SectionId | null>(null);
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [bio, setBio] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [phonePhase, setPhonePhase] = useState<"enter" | "verify">("enter");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState("");

  async function loadProfile() {
    setLoading(true);
    try {
      const response = await fetch("/api/profile/me", { cache: "no-store" });
      const body = await response.json() as { data?: ProfileSummary; error?: string };
      if (!response.ok || !body.data) throw new Error(body.error ?? tCommon("errors.generic"));
      const next = body.data;
      setSummary(next);
      setFullName(next.fullName ?? ""); setCity(next.city ?? ""); setCountry(next.country ?? "Malaysia"); setBio(next.bio ?? ""); setPhone(next.phone ?? "");
      setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : tCommon("errors.generic")); }
    finally { setLoading(false); }
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadProfile(); }, []);
  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);

  async function savePersonal() {
    const trimmedBio = bio.trim();
    if (trimmedBio.length < MIN_BIO_LENGTH || trimmedBio.length > MAX_BIO_LENGTH) {
      setError(tCustomer("ui.profileWizard.bioValidation", { min: MIN_BIO_LENGTH, max: MAX_BIO_LENGTH }));
      return;
    }
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/profile/identity", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: fullName.trim(), city: city.trim(), country: country.trim() }) });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? tCustomer("ui.profileWizard.saveDetails"));
      const bioResponse = await fetch("/api/profile/bio", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bio: bio.trim() }) });
      if (!bioResponse.ok) {
        const body = await bioResponse.json().catch(() => null);
        throw new Error(apiErrorMessage(body, tCustomer("ui.profileWizard.saveDetails")));
      }
      await loadProfile(); await refreshUser(); setEditing(null);
    } catch (err) { setError(err instanceof Error ? err.message : tCustomer("ui.profileWizard.saveDetails")); }
    finally { setBusy(false); }
  }

  async function sendPhoneOtp() {
    const parsedPhone = parseInternationalPhone(phone);
    if (!parsedPhone.ok) { setError(tCustomer("ui.profileWizard.invalidPhone")); return; }
    setPhone(parsedPhone.e164);
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/phone/send-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: parsedPhone.e164 }) });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? tCustomer("ui.profileWizard.sendOtp"));
      setPhoneCode("");
      setPhonePhase("verify");
    } catch (err) { setError(err instanceof Error ? err.message : tCustomer("ui.profileWizard.sendOtp")); }
    finally { setBusy(false); }
  }

  async function verifyPhone() {
    const parsedPhone = parseInternationalPhone(phone);
    if (!parsedPhone.ok) { setError(tCustomer("ui.profileWizard.invalidPhone")); return; }
    setPhone(parsedPhone.e164);
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/phone/verify-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: parsedPhone.e164, code: phoneCode.trim() }) });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? tCustomer("ui.profileWizard.verifyOtp"));
      await loadProfile(); await refreshUser(); setEditing(null); setPhonePhase("enter"); setPhoneCode("");
    } catch (err) { setError(err instanceof Error ? err.message : tCustomer("ui.profileWizard.verifyOtp")); }
    finally { setBusy(false); }
  }

  function updateOtpDigit(index: number, value: string) {
    const digit = value.replace(/\D/g, "").slice(-1);
    const nextCode = phoneCode.split("");
    nextCode[index] = digit;
    setPhoneCode(nextCode.join("").slice(0, 6));
    if (digit && index < 5) otpRefs.current[index + 1]?.focus();
  }

  function handleOtpKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !phoneCode[index] && index > 0) otpRefs.current[index - 1]?.focus();
  }

  async function uploadAvatar() {
    if (!avatarFile) return;
    setBusy(true); setError(null);
    try {
      const signed = await fetch(`/api/profile/avatar?type=${encodeURIComponent(avatarFile.type)}`, { method: "PUT" });
      if (!signed.ok) throw new Error(tCustomer("ui.profileWizard.choosePhoto"));
      const { data } = await signed.json() as { data: { uploadUrl: string; path: string } };
      const upload = await fetch(data.uploadUrl, { method: "PUT", headers: { "Content-Type": avatarFile.type }, body: avatarFile });
      if (!upload.ok) throw new Error(tCustomer("ui.profileWizard.choosePhoto"));
      const confirmed = await fetch("/api/profile/avatar/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: data.path }) });
      if (!confirmed.ok) throw new Error(tCustomer("ui.profileWizard.savePhoto"));
      await loadProfile(); await refreshUser(); setAvatarFile(null); setAvatarPreview(null);
    } catch (err) { setError(err instanceof Error ? err.message : tCustomer("ui.profileWizard.savePhoto")); }
    finally { setBusy(false); }
  }

  async function closeAccount() {
    if (deleteConfirm !== "DELETE") return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/account/close", { method: "POST" });
      if (!response.ok) throw new Error(tCommon("errors.generic"));
      router.replace("/login");
    } catch (err) { setError(err instanceof Error ? err.message : tCommon("errors.generic")); setBusy(false); }
  }

  if (loading) return <CustomerPageShell><div className="py-8 text-center text-sm text-muted-foreground">{tCommon("states.loadingEllipsis")}</div></CustomerPageShell>;
  if (!summary) return <CustomerPageShell><div className="py-8 text-center text-sm text-destructive">{error ?? tCustomer("ui.states.couldNotLoad")}</div></CustomerPageShell>;

  return (
    <CustomerPageShell className={shellClassName}>
      <main className="space-y-5">
      {showHeader && <CustomerPageHeader
        eyebrow={tCustomer("accountGroups.account")}
        title={summary.displayName || summary.fullName || currentUser?.email || tCustomer("ui.profileWizard.title")}
        description={tCustomer("ui.profileWizard.description")}
        className="mb-2"
      />}
      {error && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      <SectionCard title={tCustomer("ui.profileWizard.identity")} description={tCustomer("ui.profileWizard.description")}>
        <div className="flex items-center gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {avatarPreview || summary.avatarUrl ? <img src={avatarPreview || summary.avatarUrl || ""} alt="" className="h-16 w-16 rounded-full object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-primary"><Camera size={23} /></div>}
          <div><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && file.size <= 2 * 1024 * 1024) { setAvatarFile(file); setAvatarPreview(URL.createObjectURL(file)); } }} /><Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>{tCustomer("ui.profileWizard.choosePhoto")}</Button>{avatarFile && <Button size="sm" className="ml-2" onClick={uploadAvatar} disabled={busy}>{tCustomer("ui.profileWizard.savePhoto")}</Button>}</div>
        </div>
        {editing === "personal" ? <div className="mt-5 space-y-3"><input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={tCustomer("ui.profileWizard.fullNamePlaceholder")} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /><div className="grid gap-3 sm:grid-cols-2"><input value={city} onChange={(e) => setCity(e.target.value)} placeholder={tCustomer("ui.profileWizard.cityPlaceholder")} className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /><input value={country} onChange={(e) => setCountry(e.target.value)} placeholder={tCustomer("ui.profileWizard.countryPlaceholder")} className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /></div><textarea value={bio} onChange={(e) => { setBio(e.target.value); setError(null); }} maxLength={MAX_BIO_LENGTH} rows={4} placeholder={tCustomer("ui.profileWizard.bioPlaceholder")} className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /><div className="flex items-center justify-between text-xs"><span className={bio.trim().length < MIN_BIO_LENGTH ? "text-destructive" : "text-muted-foreground"}>{bio.trim().length < MIN_BIO_LENGTH ? tCustomer("ui.profileWizard.bioValidation", { min: MIN_BIO_LENGTH, max: MAX_BIO_LENGTH }) : tCustomer("ui.profileWizard.saveDetails")}</span><span className="text-muted-foreground">{bio.length}/{MAX_BIO_LENGTH}</span></div><div className="flex gap-2"><Button onClick={savePersonal} disabled={busy || bio.trim().length < MIN_BIO_LENGTH}>{busy ? <Loader2 className="animate-spin" /> : tCustomer("ui.profileWizard.saveDetails")}</Button><Button variant="outline" onClick={() => setEditing(null)}>{tCommon("actions.cancel")}</Button></div></div> : <div className="mt-5 space-y-2 text-sm"><p className="font-semibold text-foreground">{summary.fullName || tCustomer("ui.profileWizard.fullName")}</p><p className="text-muted-foreground">{[summary.city, summary.country].filter(Boolean).join(", ") || tCustomer("ui.profileWizard.city")}</p><p className="text-muted-foreground">{summary.bio || tCustomer("ui.profileWizard.bio")}</p><Button variant="outline" size="sm" className="mt-2" onClick={() => setEditing("personal")}>{tCustomer("ui.profileWizard.saveDetails")}</Button></div>}
      </SectionCard>

      <SectionCard title={tCustomer("ui.profileSections.contact")} description={tCustomer("ui.profileWizard.description")}>
        <div className="space-y-3 text-sm"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tCustomer("ui.profileSections.email")}</p><p className="mt-1 font-medium text-foreground">{summary.email}</p><p className="mt-1 text-xs text-muted-foreground">{tCustomer("ui.profileSections.emailChangeHint")}</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tCustomer("ui.profileSections.phone")}</p>{editing === "contact" ? <div className="mt-2 space-y-3">{phonePhase === "enter" ? <><InternationalPhoneInput id="settings-phone" value={phone} onChange={(value) => { setPhone(value); setError(null); }} disabled={busy} error={Boolean(error)} /><Button onClick={sendPhoneOtp} disabled={busy}>{tCustomer("ui.profileWizard.sendOtp")}</Button></> : <><p className="font-medium text-green-600">{tCustomer("ui.profileSections.otpSent")}</p><p className="text-muted-foreground">{tCustomer("ui.profileSections.otpInstruction")}</p><div className="flex gap-2">{Array.from({ length: 6 }, (_, index) => <input key={index} ref={(element) => { otpRefs.current[index] = element; }} value={phoneCode[index] ?? ""} onChange={(event) => updateOtpDigit(index, event.target.value)} onKeyDown={(event) => handleOtpKeyDown(index, event)} inputMode="numeric" maxLength={1} aria-label={tCustomer("ui.profileSections.otpDigit", { number: index + 1 })} className="h-12 w-11 rounded-xl border border-border bg-background text-center text-lg font-semibold text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" />)}</div><div className="flex items-center gap-3"><Button onClick={verifyPhone} disabled={busy || phoneCode.length !== 6}>{busy ? <Loader2 className="animate-spin" /> : tCustomer("ui.profileSections.verifyOtp")}</Button><button type="button" onClick={() => void sendPhoneOtp()} disabled={busy} className="text-sm font-medium text-primary hover:underline disabled:opacity-50">{tCustomer("ui.profileSections.resendOtp")}</button></div></>}</div> : <div className="mt-1 flex items-center gap-2"><span className="font-medium text-foreground">{summary.maskedPhone || tCustomer("ui.profileSections.notSet")}</span><StatusBadge label={summary.phoneVerified ? tCustomer("ui.profileSections.verified") : tCustomer("ui.profileSections.unverified")} good={summary.phoneVerified} /></div>}</div>{editing !== "contact" && <Button variant="outline" size="sm" onClick={() => setEditing("contact")}>{tCustomer("ui.profileSections.changePhone")}</Button>}</div>
      </SectionCard>

      <SectionCard title={tCustomer("ui.kyc.verified")} description={tCustomer("ui.kyc.description")}>
        <div className="grid gap-2 sm:grid-cols-2"><StatusBadge label={tCustomer("ui.profileSections.emailStatus", { status: tCustomer(summary.emailVerified ? "ui.profileSections.verified" : "ui.profileSections.unverified") })} good={summary.emailVerified} /><StatusBadge label={tCustomer("ui.profileSections.phoneStatus", { status: tCustomer(summary.phoneVerified ? "ui.profileSections.verified" : "ui.profileSections.unverified") })} good={summary.phoneVerified} /><StatusBadge label={tCustomer("ui.profileSections.profileStatus", { status: tCustomer(summary.profileComplete ? "ui.profileSections.complete" : "ui.profileSections.incomplete") })} good={summary.profileComplete} /><StatusBadge label={tCustomer("ui.profileSections.kycStatus", { status: tCustomer(`ui.profileSections.kycStatuses.${summary.kycStatus}`) })} good={summary.kycStatus === "approved"} /></div>
        {summary.kycStatus === "rejected" && <div className="mt-4 rounded-xl border border-destructive/25 bg-destructive/5 p-4"><p className="text-sm font-semibold text-destructive">{tCustomer("ui.kyc.rejected")}</p><p className="mt-1 text-sm text-muted-foreground">{tCustomer(`ui.kyc.reviewReasons.${summary.latestKycReview?.reasonCode ?? "default"}`)}</p>{summary.latestKycReview?.reasonDetail && <p className="mt-2 text-sm text-foreground">{summary.latestKycReview.reasonDetail}</p>}<Button className="mt-3" size="sm" onClick={() => router.push("/customer/kyc")}>{tCustomer("ui.kyc.newSubmission")} <ChevronRight size={14} /></Button></div>}
        {summary.kycStatus !== "approved" && summary.kycStatus !== "rejected" && <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push("/customer/kyc")}>{tCustomer("ui.kyc.submitDocuments")} <ChevronRight size={14} /></Button>}
      </SectionCard>

      <SectionCard id="preferences" title={tCustomer("ui.preferencesPage.eyebrow")} description={tCustomer("ui.preferencesPage.description")}>
        <div className="space-y-2 text-sm">
          <p className="text-foreground">{summary.survey?.interests?.length ? summary.survey.interests.map(interestLabel).join(", ") : tCustomer("ui.profileSections.noInterests")}</p>
          {summary.survey && <p className="text-muted-foreground">{summary.survey.travelStyle || tCustomer("ui.profileSections.travelStyleNotSet")} · {summary.survey.budgetRange || tCustomer("ui.profileSections.budgetNotSet")} · {summary.survey.mobilityNeeds || tCustomer("ui.profileSections.mobilityNotSet")}</p>}
          <Button variant="outline" size="sm" className="mt-2" onClick={() => router.push("/customer/preferences")}>{tCustomer("ui.preferencesEditor.save")} <ChevronRight size={14} /></Button>
        </div>
      </SectionCard>

      <SectionCard id="language-region" title={tCommon("language.andRegion")} description={tCustomer("profile.languageDescription")}>
        <LanguageSwitcher />
      </SectionCard>

      <SectionCard title={tCustomer("ui.profileSections.support")} description={tCustomer("ui.profileSections.supportDescription")}>
        <Button variant="outline" size="sm" onClick={() => setSupportChatOpen(true)}>
          <MessageCircle size={14} className="mr-1.5" /> {tCustomer("ui.profileSections.contactSupport")}
        </Button>
      </SectionCard>

      <section className="rounded-2xl border border-destructive/25 bg-destructive/[0.03] p-5 sm:p-6"><div className="flex items-center gap-2"><Trash2 size={17} className="text-destructive" /><h2 className="font-bold text-foreground">{tCustomer("ui.profileSections.dangerZone")}</h2></div><p className="mt-2 text-sm text-muted-foreground">{tCustomer("ui.profileSections.closeWarning")}</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder={tCustomer("ui.profileSections.deletePlaceholder")} className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /><Button variant="destructive" onClick={closeAccount} disabled={busy || deleteConfirm !== "DELETE"}>{tCustomer("ui.profileSections.closeAccount")}</Button></div></section>
      </main>
    </CustomerPageShell>
  );
}
