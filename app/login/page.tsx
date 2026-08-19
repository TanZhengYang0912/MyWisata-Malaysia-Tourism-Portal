"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/providers/auth";
import { createClient } from "@/lib/supabase/client";
import { validatePassword } from "@/lib/auth/password-policy";
import { GUEST_EXPLORE_PATH, postLoginPath } from "@/lib/auth/guest-mode";
import { demoAccountRoleCategories, filterDemoAccountsByRole } from "@/lib/auth/demo-account-filter";
import { postLoginDestination } from "@/lib/auth/post-login-destination";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import type { Role, User } from "@/backend/core/types";

type DemoUser = User & { vendorName?: string; outletName?: string };
type AuthMode = "signin" | "signup" | "verify" | "forgot";

export default function LoginPage() {
  const { refreshUser, switchUser } = useAuth();
  const { t: tAuth } = useTranslation("auth");
  const { t: tCommon } = useTranslation("common");
  const GENERIC_ERROR = tAuth("errors.generic");
  const router = useRouter();
  const supabase = createClient();
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [roleFilter, setRoleFilter] = useState<Role | null>(null);
  const [mode, setMode] = useState<AuthMode>("signin");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendReady, setResendReady] = useState(true);

  function startResendCooldown() {
    setResendReady(false);
    window.setTimeout(() => setResendReady(true), 60_000);
  }

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const queryError = searchParams.get("error");
    if (queryError === "oauth") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(tAuth("errors.oauth", { defaultValue: "Google sign-in could not be completed. Try email/password or a demo account." }));
    } else if (queryError) {
      setError(GENERIC_ERROR);
    }
    if (searchParams.get("mode") === "signup") setMode("signup");
    fetch("/api/auth/demo-users")
      .then(async (response) => { if (!response.ok) throw new Error(tAuth("errors.demoLoad")); return response.json() as Promise<DemoUser[]>; })
      .then(setUsers)
      .catch(() => setError(tAuth("errors.demoLoad")));
  }, [GENERIC_ERROR, tAuth]);

  function resetFeedback() { setError(null); setMessage(null); }

  function requestedNext(role?: Role) {
    return postLoginPath(new URLSearchParams(window.location.search).get("next"), role);
  }

  async function pick(user: User) {
    resetFeedback();
    try {
      const signedInUser = await switchUser(user.id, user);
      if (!signedInUser) return;
      const role = signedInUser.role;
      router.push(postLoginDestination(role, requestedNext(role)));
      router.refresh();
    } catch { setError(GENERIC_ERROR); }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); resetFeedback(); setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (signInError) { setError(tAuth("signIn.error")); return; }
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user.email_confirmed_at) {
      setMode("verify");
      setMessage(tAuth("signIn.verifyEmailMessage"));
      startResendCooldown();
      return;
    }
    try {
      const signedInUser = await refreshUser();
      if (!signedInUser) { router.push("/"); router.refresh(); return; }
      router.push(postLoginDestination(signedInUser.role, requestedNext(signedInUser.role)));
      router.refresh();
    } catch { setError(GENERIC_ERROR); }
  }

  async function enterGuestMode() {
    resetFeedback(); setBusy(true);
    const { data: { session } } = await supabase.auth.getSession();
    const { error: signOutError } = session
      ? await supabase.auth.signOut({ scope: "local" })
      : { error: null };
    setBusy(false);
    if (signOutError) { setError(tCommon("guest.startError")); return; }
    router.replace(GUEST_EXPLORE_PATH); router.refresh();
  }

  async function signUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); resetFeedback();
    const validation = validatePassword(password);
    if (!validation.ok) { setError(tAuth("errors.passwordPolicy")); return; }
    if (password !== confirmPassword) { setError(tAuth("errors.passwordMismatch")); return; }
    const next = requestedNext("customer") ?? "/customer/explore";
    setBusy(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(false);
    if (signUpError) { setError(GENERIC_ERROR); return; }
    if (data.session && data.user?.email_confirmed_at) {
      try {
        const signedInUser = await refreshUser();
        if (!signedInUser) { router.push("/"); router.refresh(); return; }
        router.push(postLoginDestination(signedInUser.role, next));
        router.refresh();
      } catch { setError(GENERIC_ERROR); }
      return;
    }
    setMode("verify"); startResendCooldown();
    setMessage(tAuth("signUp.verificationSent"));
  }

  async function verifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); resetFeedback();
    if (!/^\d{6}$/.test(otp)) { setError(tAuth("verification.invalidCode")); return; }
    setBusy(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({ email: email.trim(), token: otp, type: "signup" });
    setBusy(false);
    if (verifyError) { setError(GENERIC_ERROR); return; }
    try {
      const signedInUser = await refreshUser();
      if (!signedInUser) { router.push("/"); router.refresh(); return; }
      router.push(postLoginDestination(signedInUser.role, requestedNext("customer")));
      router.refresh();
    } catch { setError(GENERIC_ERROR); }
  }

  async function resendOtp() {
    if (!resendReady) return;
    resetFeedback(); setBusy(true);
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email: email.trim() });
    setBusy(false); startResendCooldown();
    if (resendError) { setError(GENERIC_ERROR); return; }
    setMessage(tAuth("signUp.verificationResent"));
  }

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); resetFeedback(); setBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    if (resetError) { setError(GENERIC_ERROR); return; }
    setMessage(tAuth("passwordReset.instructionsSent"));
  }

  async function continueWithGoogle() {
    resetFeedback(); setBusy(true);
    const next = requestedNext() ?? "/customer/explore";
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (oauthError) { setBusy(false); setError(GENERIC_ERROR); }
  }

  const title = mode === "signup" ? tAuth("titles.createAccount") : mode === "verify" ? tAuth("titles.verifyEmail") : mode === "forgot" ? tAuth("titles.resetPassword") : tAuth("titles.welcomeBack");
  const roleCategories = demoAccountRoleCategories(users);
  const visibleUsers = filterDemoAccountsByRole(users, roleFilter);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12" style={{ backgroundColor: "var(--background)" }}>
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary"><Globe size={18} className="text-white" /></div><span className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground">MyWisata</span></div>
        <div className="mb-3 flex items-center justify-end gap-3"><span className="text-xs text-muted-foreground">{tAuth("language.description")}</span><LanguageSwitcher compact /></div>
        <Card className="p-2"><CardContent className="px-4 pt-2">
          <h1 className="mb-1 text-lg font-bold text-foreground">{title}</h1>
          <p className="mb-4 text-sm text-muted-foreground">{tAuth("login.description")}</p>
          {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {message && <p role="status" className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}

          {mode === "verify" ? (
            <form onSubmit={verifyEmail} className="space-y-3 rounded-xl border border-border bg-secondary/30 p-3">
              <p className="text-sm text-muted-foreground">{tAuth("verification.codeSentTo")} <strong>{email}</strong>.</p>
              <input aria-label={tAuth("verification.codeLabel")} inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-center text-lg tracking-[0.35em]" />
              <Button type="submit" className="w-full" disabled={busy}>{busy ? tCommon("states.processingEllipsis") : tAuth("verification.verifyEmail")}</Button>
              <button type="button" onClick={resendOtp} disabled={busy || !resendReady} className="w-full text-sm font-semibold text-primary disabled:text-muted-foreground">{tAuth("verification.resendCode")}</button>
              <button type="button" onClick={() => { resetFeedback(); setMode("signin"); }} className="w-full text-sm text-muted-foreground">{tAuth("actions.backToSignIn")}</button>
            </form>
          ) : mode === "forgot" ? (
            <form onSubmit={requestReset} className="space-y-3 rounded-xl border border-border bg-secondary/30 p-3">
              <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder={tAuth("fields.email")} aria-label={tAuth("fields.email")} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
              <Button type="submit" className="w-full" disabled={busy}>{busy ? tCommon("states.processingEllipsis") : tAuth("passwordReset.sendInstructions")}</Button>
              <button type="button" onClick={() => { resetFeedback(); setMode("signin"); }} className="w-full text-sm text-muted-foreground">{tAuth("actions.backToSignIn")}</button>
            </form>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-2 rounded-lg bg-secondary/50 p-1"><button type="button" onClick={() => { resetFeedback(); setMode("signin"); }} className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === "signin" ? "bg-background text-primary shadow-sm" : "text-muted-foreground"}`}>{tCommon("account.signIn")}</button><button type="button" onClick={() => { resetFeedback(); setMode("signup"); }} className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === "signup" ? "bg-background text-primary shadow-sm" : "text-muted-foreground"}`}>{tCommon("account.createAccount")}</button></div>
              <form onSubmit={mode === "signup" ? signUp : signIn} className="space-y-2 rounded-xl border border-border bg-secondary/30 p-3">
                <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder={tAuth("fields.email")} aria-label={tAuth("fields.email")} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
                <input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder={tAuth("fields.password")} aria-label={tAuth("fields.password")} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
                {mode === "signup" && <><input type="password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder={tAuth("fields.confirmPassword")} aria-label={tAuth("fields.confirmPassword")} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" /><p className="px-1 text-[11px] text-muted-foreground">{tAuth("passwordReset.requirements")}</p></>}
                <Button type="submit" className="w-full" disabled={busy}>{busy ? tCommon("states.processingEllipsis") : mode === "signup" ? tCommon("account.createAccount") : tCommon("account.signIn")}</Button>
                {mode === "signin" && <button type="button" onClick={() => { resetFeedback(); setMode("forgot"); }} className="w-full text-sm font-semibold text-primary">{tAuth("passwordReset.forgotPassword")}</button>}
              </form>
              <div className="my-3 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />{tAuth("actions.or")}<span className="h-px flex-1 bg-border" /></div>
              <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={continueWithGoogle}>{tAuth("actions.continueWithGoogle")}</Button>
            </>
          )}

          <button type="button" onClick={enterGuestMode} disabled={busy} className="mt-5 flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-secondary disabled:cursor-wait disabled:opacity-70"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-bold text-white">G</div><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-foreground">{tCommon("guest.mode")}</p><p className="text-xs text-muted-foreground">{tAuth("guest.description")}</p></div><Badge variant="secondary" className="shrink-0">{tAuth("guest.label")}</Badge></button>
          <div className="mt-5 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{tAuth("demo.title")}</p><span className="text-[11px] text-muted-foreground">{tAuth("demo.quickEntry")}</span></div>
          {roleCategories.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setRoleFilter(null)} className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${roleFilter === null ? "bg-primary text-white" : "border border-border text-muted-foreground hover:bg-secondary"}`}>{tCommon("filters.all", { defaultValue: "All" })}</button>
              {roleCategories.map((role) => <button key={role} type="button" onClick={() => setRoleFilter(role)} className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${roleFilter === role ? "bg-primary text-white" : "border border-border text-muted-foreground hover:bg-secondary"}`}>{tAuth(`roles.${role}`)}</button>)}
            </div>
          )}
          <div className="mt-2 space-y-2">{visibleUsers.map((user) => <button key={user.id} onClick={() => pick(user)} className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-secondary"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{user.avatarInitial}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-foreground">{user.name}</p><p className="truncate text-xs text-muted-foreground">{user.vendorName || user.outletName || user.email}</p></div><Badge variant="secondary" className="shrink-0">{tAuth(`roles.${user.role}`)}</Badge></button>)}</div>
        </CardContent></Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">{tAuth("demo.disclaimer")}</p>
      </div>
    </div>
  );
}
