"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Camera, CheckCircle2, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth";
import type { ProfileSummary } from "@/backend/core/types";
import { safeKycReasonCopy } from "@/lib/kyc/customer-submission";
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
      if (!response.ok || !body.data) throw new Error(body.error ?? "Unable to load profile");
      const next = body.data;
      setSummary(next);
      setFullName(next.fullName ?? ""); setCity(next.city ?? ""); setCountry(next.country ?? "Malaysia"); setBio(next.bio ?? ""); setPhone(next.phone ?? "");
      setError(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load profile"); }
    finally { setLoading(false); }
  }

  useEffect(() => { void loadProfile(); }, []);
  useEffect(() => () => { if (avatarPreview) URL.revokeObjectURL(avatarPreview); }, [avatarPreview]);

  async function savePersonal() {
    const trimmedBio = bio.trim();
    if (trimmedBio.length < MIN_BIO_LENGTH || trimmedBio.length > MAX_BIO_LENGTH) {
      setError(`Bio must be between ${MIN_BIO_LENGTH} and ${MAX_BIO_LENGTH} characters. Current length: ${trimmedBio.length}.`);
      return;
    }
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/profile/identity", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fullName: fullName.trim(), city: city.trim(), country: country.trim() }) });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? "Unable to save personal details");
      const bioResponse = await fetch("/api/profile/bio", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bio: bio.trim() }) });
      if (!bioResponse.ok) {
        const body = await bioResponse.json().catch(() => null);
        throw new Error(apiErrorMessage(body, "Unable to save bio"));
      }
      await loadProfile(); await refreshUser(); setEditing(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save personal details"); }
    finally { setBusy(false); }
  }

  async function sendPhoneOtp() {
    const parsedPhone = parseInternationalPhone(phone);
    if (!parsedPhone.ok) { setError(parsedPhone.message); return; }
    setPhone(parsedPhone.e164);
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/phone/send-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: parsedPhone.e164 }) });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? "Unable to send OTP");
      setPhoneCode("");
      setPhonePhase("verify");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to send OTP"); }
    finally { setBusy(false); }
  }

  async function verifyPhone() {
    const parsedPhone = parseInternationalPhone(phone);
    if (!parsedPhone.ok) { setError(parsedPhone.message); return; }
    setPhone(parsedPhone.e164);
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/phone/verify-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: parsedPhone.e164, code: phoneCode.trim() }) });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? "Invalid OTP");
      await loadProfile(); await refreshUser(); setEditing(null); setPhonePhase("enter"); setPhoneCode("");
    } catch (err) { setError(err instanceof Error ? err.message : "Invalid OTP"); }
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
      if (!signed.ok) throw new Error("Unable to prepare avatar upload");
      const { data } = await signed.json() as { data: { uploadUrl: string; path: string } };
      const upload = await fetch(data.uploadUrl, { method: "PUT", headers: { "Content-Type": avatarFile.type }, body: avatarFile });
      if (!upload.ok) throw new Error("Avatar upload failed");
      const confirmed = await fetch("/api/profile/avatar/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path: data.path }) });
      if (!confirmed.ok) throw new Error("Unable to save avatar");
      await loadProfile(); await refreshUser(); setAvatarFile(null); setAvatarPreview(null);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to save avatar"); }
    finally { setBusy(false); }
  }

  async function closeAccount() {
    if (deleteConfirm !== "DELETE") return;
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/account/close", { method: "POST" });
      if (!response.ok) throw new Error("Unable to close account");
      router.replace("/login");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to close account"); setBusy(false); }
  }

  if (loading) return <CustomerPageShell><div className="py-8 text-center text-sm text-muted-foreground">Loading profile…</div></CustomerPageShell>;
  if (!summary) return <CustomerPageShell><div className="py-8 text-center text-sm text-destructive">{error ?? "Profile unavailable"}</div></CustomerPageShell>;

  return (
    <CustomerPageShell className={shellClassName}>
      <main className="space-y-5">
      {showHeader && <CustomerPageHeader
        eyebrow="Account"
        title={summary.displayName || summary.fullName || currentUser?.email || "Your profile"}
        description="Manage your personal information, verification and preferences."
        className="mb-2"
      />}
      {error && <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      <SectionCard title="Personal details" description="These details appear on your public contributor profile.">
        <div className="flex items-center gap-4">
          {avatarPreview || summary.avatarUrl ? <img src={avatarPreview || summary.avatarUrl || ""} alt="" className="h-16 w-16 rounded-full object-cover" /> : <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary text-primary"><Camera size={23} /></div>}
          <div><input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0] ?? null; if (file && file.size <= 2 * 1024 * 1024) { setAvatarFile(file); setAvatarPreview(URL.createObjectURL(file)); } }} /><Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>Change photo</Button>{avatarFile && <Button size="sm" className="ml-2" onClick={uploadAvatar} disabled={busy}>Save photo</Button>}</div>
        </div>
        {editing === "personal" ? <div className="mt-5 space-y-3"><input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /><div className="grid gap-3 sm:grid-cols-2"><input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /><input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /></div><textarea value={bio} onChange={(e) => { setBio(e.target.value); setError(null); }} maxLength={MAX_BIO_LENGTH} rows={4} placeholder="Short bio (30–200 characters)" className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /><div className="flex items-center justify-between text-xs"><span className={bio.trim().length < MIN_BIO_LENGTH ? "text-destructive" : "text-muted-foreground"}>{bio.trim().length < MIN_BIO_LENGTH ? `Bio needs at least ${MIN_BIO_LENGTH} characters.` : "Bio length is valid."}</span><span className="text-muted-foreground">{bio.length}/{MAX_BIO_LENGTH}</span></div><div className="flex gap-2"><Button onClick={savePersonal} disabled={busy || bio.trim().length < MIN_BIO_LENGTH}>{busy ? <Loader2 className="animate-spin" /> : "Save details"}</Button><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button></div></div> : <div className="mt-5 space-y-2 text-sm"><p className="font-semibold text-foreground">{summary.fullName || "Name not set"}</p><p className="text-muted-foreground">{[summary.city, summary.country].filter(Boolean).join(", ") || "Location not set"}</p><p className="text-muted-foreground">{summary.bio || "Bio not set"}</p><Button variant="outline" size="sm" className="mt-2" onClick={() => setEditing("personal")}>Edit details</Button></div>}
      </SectionCard>

      <SectionCard title="Contact" description="Contact details are private and never shown on public profiles.">
        <div className="space-y-3 text-sm"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Email</p><p className="mt-1 font-medium text-foreground">{summary.email}</p><p className="mt-1 text-xs text-muted-foreground">Email changes require confirmation from the new address.</p></div><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Phone</p>{editing === "contact" ? <div className="mt-2 space-y-3">{phonePhase === "enter" ? <><InternationalPhoneInput id="settings-phone" value={phone} onChange={(value) => { setPhone(value); setError(null); }} disabled={busy} error={Boolean(error)} /><Button onClick={sendPhoneOtp} disabled={busy}>Send OTP</Button></> : <><p className="font-medium text-green-600">✓ OTP sent successfully</p><p className="text-muted-foreground">OTP sent. Enter the 6-digit code to verify your phone.</p><div className="flex gap-2">{Array.from({ length: 6 }, (_, index) => <input key={index} ref={(element) => { otpRefs.current[index] = element; }} value={phoneCode[index] ?? ""} onChange={(event) => updateOtpDigit(index, event.target.value)} onKeyDown={(event) => handleOtpKeyDown(index, event)} inputMode="numeric" maxLength={1} aria-label={`OTP digit ${index + 1}`} className="h-12 w-11 rounded-xl border border-border bg-background text-center text-lg font-semibold text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" />)}</div><div className="flex items-center gap-3"><Button onClick={verifyPhone} disabled={busy || phoneCode.length !== 6}>{busy ? <Loader2 className="animate-spin" /> : "Verify OTP"}</Button><button type="button" onClick={() => void sendPhoneOtp()} disabled={busy} className="text-sm font-medium text-primary hover:underline disabled:opacity-50">Resend OTP</button></div></>}</div> : <div className="mt-1 flex items-center gap-2"><span className="font-medium text-foreground">{summary.maskedPhone || "Not set"}</span><StatusBadge label={summary.phoneVerified ? "Verified" : "Unverified"} good={summary.phoneVerified} /></div>}</div>{editing !== "contact" && <Button variant="outline" size="sm" onClick={() => setEditing("contact")}>Change phone</Button>}</div>
      </SectionCard>

      <SectionCard title="Verification" description="Verification states are managed by the system or Admin.">
        <div className="grid gap-2 sm:grid-cols-2"><StatusBadge label={`Email ${summary.emailVerified ? "verified" : "unverified"}`} good={summary.emailVerified} /><StatusBadge label={`Phone ${summary.phoneVerified ? "verified" : "unverified"}`} good={summary.phoneVerified} /><StatusBadge label={`Profile ${summary.profileComplete ? "complete" : "incomplete"}`} good={summary.profileComplete} /><StatusBadge label={`KYC ${summary.kycStatus}`} good={summary.kycStatus === "approved"} /></div>
        {summary.kycStatus === "rejected" && <div className="mt-4 rounded-xl border border-destructive/25 bg-destructive/5 p-4"><p className="text-sm font-semibold text-destructive">KYC submission rejected</p><p className="mt-1 text-sm text-muted-foreground">{safeKycReasonCopy(summary.latestKycReview?.reasonCode)}</p>{summary.latestKycReview?.reasonDetail && <p className="mt-2 text-sm text-foreground">{summary.latestKycReview.reasonDetail}</p>}<Button className="mt-3" size="sm" onClick={() => router.push("/customer/kyc")}>Resubmit KYC <ChevronRight size={14} /></Button></div>}
        {summary.kycStatus !== "approved" && summary.kycStatus !== "rejected" && <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push("/customer/kyc")}>View KYC page <ChevronRight size={14} /></Button>}
      </SectionCard>

      <SectionCard id="preferences" title="Preferences" description="These personalise your recommendation feed.">
        <div className="space-y-2 text-sm">
          <p className="text-foreground">{summary.survey?.interests?.length ? summary.survey.interests.map(interestLabel).join(", ") : "No interests selected yet"}</p>
          {summary.survey && <p className="text-muted-foreground">{summary.survey.travelStyle || "Travel style not set"} · {summary.survey.budgetRange || "Budget not set"} · {summary.survey.mobilityNeeds || "Mobility not set"}</p>}
          <Button variant="outline" size="sm" className="mt-2" onClick={() => router.push("/customer/preferences")}>Manage preferences <ChevronRight size={14} /></Button>
        </div>
      </SectionCard>

      <SectionCard id="language-region" title={tCommon("language.andRegion")} description={tCustomer("profile.languageDescription")}>
        <LanguageSwitcher />
      </SectionCard>

      <section className="rounded-2xl border border-destructive/25 bg-destructive/[0.03] p-5 sm:p-6"><div className="flex items-center gap-2"><Trash2 size={17} className="text-destructive" /><h2 className="font-bold text-foreground">Danger Zone</h2></div><p className="mt-2 text-sm text-muted-foreground">Closing your account signs you out and hides your profile. Orders, wallet history and KYC audit records are retained.</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="Type DELETE to confirm" className="rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /><Button variant="destructive" onClick={closeAccount} disabled={busy || deleteConfirm !== "DELETE"}>Close account</Button></div></section>
      </main>
    </CustomerPageShell>
  );
}
