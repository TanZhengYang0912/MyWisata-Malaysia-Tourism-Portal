"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, Globe, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { validatePassword } from "@/lib/auth/password-policy";
import { BRAND_NAME } from "@/lib/i18n/invariant-tokens";
import { createClient } from "@/lib/supabase/client";

type Invitation = {
  email: string;
  roleName: string;
  permissions: string[];
  status: "pending" | "expired" | "accepted" | "revoked" | "role_changed";
  expiresAt: string;
};

export default function StaffInvitationPage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const { t, i18n } = useTranslation("auth");
  const supabase = useMemo(() => createClient(), []);
  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [sessionEmail, setSessionEmail] = useState("");
  const [mode, setMode] = useState<"sign_in" | "register">("register");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const invitationPath = `/staff-invitations/${encodeURIComponent(params.token)}`;
  const locale = i18n.resolvedLanguage === "ms" ? "ms" : i18n.resolvedLanguage?.startsWith("zh") ? "zh-CN" : "en";

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/staff-invitations/${encodeURIComponent(params.token)}?locale=${locale}`, { cache: "no-store" })
        .then(async (response) => {
          const body = await response.json();
          if (!response.ok) throw new Error(body.error?.message || t("staffInvitation.errors.load"));
          return body.data as Invitation;
        }),
      supabase.auth.getUser(),
    ]).then(([data, auth]) => {
      if (cancelled) return;
      setInvitation(data);
      setSessionEmail(auth.data.user?.email?.trim().toLowerCase() ?? "");
      setLoading(false);
    }).catch((reason) => {
      if (cancelled) return;
      setError(reason instanceof Error ? reason.message : t("staffInvitation.errors.load"));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [locale, params.token, supabase, t]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invitation) return;
    setBusy(true); setError(""); setMessage("");
    if (mode === "register") {
      const validation = validatePassword(password);
      if (!validation.ok) {
        setBusy(false); setError(t("errors.passwordPolicy")); return;
      }
    }
    const result = mode === "sign_in"
      ? await supabase.auth.signInWithPassword({ email: invitation.email, password })
      : await supabase.auth.signUp({
        email: invitation.email,
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(invitationPath)}`,
        },
      });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    if (!result.data.session || !result.data.user?.email_confirmed_at) {
      setMessage(t("staffInvitation.verificationSent"));
      return;
    }
    setSessionEmail(result.data.user.email?.trim().toLowerCase() ?? invitation.email.toLowerCase());
    setMessage(t("staffInvitation.signedInReview"));
  }

  async function continueWithGoogle() {
    setBusy(true); setError("");
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(invitationPath)}` },
    });
    if (oauthError) { setBusy(false); setError(oauthError.message); }
  }

  async function resendVerification() {
    if (!invitation) return;
    setBusy(true); setError("");
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: invitation.email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(invitationPath)}` },
    });
    setBusy(false);
    if (resendError) setError(resendError.message);
    else setMessage(t("staffInvitation.verificationResent"));
  }

  async function switchAccount() {
    setBusy(true); setError("");
    const { error: signOutError } = await supabase.auth.signOut({ scope: "local" });
    setBusy(false);
    if (signOutError) { setError(t("staffInvitation.errors.switchAccount")); return; }
    setSessionEmail("");
  }

  async function acceptInvitation() {
    setBusy(true); setError("");
    const response = await fetch(`/api/staff-invitations/${encodeURIComponent(params.token)}`, { method: "POST" });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { setError(body.error?.message || t("staffInvitation.errors.accept")); return; }
    router.push("/staff");
    router.refresh();
  }

  if (loading) return <main className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">{t("staffInvitation.loading")}</main>;

  const invitedEmail = invitation?.email.trim().toLowerCase() ?? "";
  const matchingSession = Boolean(sessionEmail) && sessionEmail === invitedEmail;
  const wrongSession = Boolean(sessionEmail) && sessionEmail !== invitedEmail;
  const actionable = invitation?.status === "pending";

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-xl overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
        <header className="bg-primary px-6 py-8 text-primary-foreground sm:px-9">
          <div className="flex items-center gap-2 text-sm font-bold"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/15"><Globe size={16} /></span>{BRAND_NAME}</div>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.2em] text-amber-300">{t("staffInvitation.eyebrow")}</p>
          <h1 className="mt-2 text-3xl font-black">{t("staffInvitation.title")}</h1>
          <p className="mt-3 text-sm leading-6 text-white/75">{t("staffInvitation.description")}</p>
        </header>

        <div className="space-y-5 p-6 sm:p-9">
          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
          {message && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}

          {invitation && <div className="rounded-2xl border border-border bg-secondary/40 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{t("staffInvitation.role")}</p>
            <p className="mt-1 text-xl font-bold text-foreground">{invitation.roleName}</p>
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Mail size={15} />{invitation.email}</p>
            <p className="mt-5 text-sm font-bold text-foreground">{t("staffInvitation.permissions")}</p>
            <ul className="mt-2 space-y-2">{invitation.permissions.map((permission) => <li key={permission} className="flex items-start gap-2 text-sm text-muted-foreground"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-primary" />{permission}</li>)}</ul>
            <p className="mt-4 text-xs text-muted-foreground">{t("staffInvitation.expires", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(invitation.expiresAt)) })}</p>
          </div>}

          {!actionable ? <div className="rounded-xl bg-secondary px-4 py-3 text-sm text-muted-foreground">{t(`staffInvitation.states.${invitation?.status ?? "unavailable"}`)}</div>
            : wrongSession ? <div className="space-y-3"><p className="text-sm text-muted-foreground">{t("staffInvitation.wrongAccount", { current: sessionEmail, invited: invitation.email })}</p><Button type="button" variant="outline" className="w-full" disabled={busy} onClick={switchAccount}>{t("staffInvitation.switchAccount")}</Button></div>
            : matchingSession ? <div><p className="text-sm text-muted-foreground">{t("staffInvitation.signedInAs", { email: sessionEmail })}</p><Button type="button" onClick={acceptInvitation} disabled={busy} className="mt-4 w-full gap-2"><CheckCircle2 size={16} />{busy ? t("staffInvitation.accepting") : t("staffInvitation.accept")}</Button></div>
            : <div className="space-y-3">
              <div className="grid grid-cols-2 rounded-xl bg-secondary p-1 text-sm font-semibold"><button type="button" onClick={() => setMode("register")} className={`rounded-lg px-3 py-2 ${mode === "register" ? "bg-background text-primary shadow-sm" : "text-muted-foreground"}`}>{t("staffInvitation.createAccount")}</button><button type="button" onClick={() => setMode("sign_in")} className={`rounded-lg px-3 py-2 ${mode === "sign_in" ? "bg-background text-primary shadow-sm" : "text-muted-foreground"}`}>{t("staffInvitation.haveAccount")}</button></div>
              <form onSubmit={authenticate} className="space-y-3">
                {mode === "register" && <input required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder={t("fields.fullName")} aria-label={t("fields.fullName")} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm" />}
                <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/30 px-3"><Mail size={15} className="text-muted-foreground" /><input readOnly value={invitation?.email ?? ""} aria-label={t("fields.email")} className="h-11 min-w-0 flex-1 bg-transparent text-sm" /></div>
                <div className="flex items-center gap-2 rounded-xl border border-border bg-secondary/30 px-3"><LockKeyhole size={15} className="text-muted-foreground" /><input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={t("fields.password")} aria-label={t("fields.password")} className="h-11 min-w-0 flex-1 bg-transparent text-sm" /></div>
                <Button type="submit" disabled={busy} className="w-full">{busy ? t("staffInvitation.waiting") : mode === "register" ? t("staffInvitation.register") : t("staffInvitation.signIn")}</Button>
              </form>
              <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />{t("actions.or")}<span className="h-px flex-1 bg-border" /></div>
              <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={continueWithGoogle}>{t("actions.continueWithGoogle")}</Button>
              <button type="button" onClick={resendVerification} disabled={busy} className="w-full text-sm font-semibold text-primary">{t("staffInvitation.resendVerification")}</button>
            </div>}
        </div>
      </section>
    </main>
  );
}
