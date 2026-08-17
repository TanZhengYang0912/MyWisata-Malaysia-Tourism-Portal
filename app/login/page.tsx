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

const ROLE_LABEL: Record<Role, string> = {
  customer: "Customer", vendor_owner: "Vendor Owner", outlet_manager: "Outlet Manager",
  admin: "Admin", approver: "Approver", super_admin: "Super Admin",
};
const GENERIC_ERROR = "Unable to complete that request. Check your details and try again.";

export default function LoginPage() {
  const { switchUser } = useAuth();
  const { t: tAuth } = useTranslation("auth");
  const { t: tCommon } = useTranslation("common");
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
    const queryError = new URLSearchParams(window.location.search).get("error");
    if (queryError === "oauth") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("Google sign-in could not be completed. Try email/password or a demo account.");
    } else if (queryError) {
      setError(GENERIC_ERROR);
    }
    fetch("/api/auth/demo-users")
      .then(async (response) => { if (!response.ok) throw new Error("Unable to load demo accounts"); return response.json() as Promise<DemoUser[]>; })
      .then(setUsers)
      .catch(() => setError("Unable to load demo accounts"));
  }, []);

  function resetFeedback() { setError(null); setMessage(null); }

  function requestedNext() {
    return postLoginPath(new URLSearchParams(window.location.search).get("next"));
  }

  async function pick(user: User) {
    resetFeedback();
    try {
      const signedInUser = await switchUser(user.id, user);
      router.push(postLoginDestination(signedInUser?.role ?? user.role, requestedNext()));
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
      setMessage("Please verify your email before continuing. You can resend the verification code below.");
      startResendCooldown();
      return;
    }
    router.push(requestedNext() ?? "/"); router.refresh();
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
    if (!validation.ok) { setError(validation.message); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    const next = requestedNext() ?? "/customer/explore";
    setBusy(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(), password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setBusy(false);
    if (signUpError) { setError(GENERIC_ERROR); return; }
    if (data.session && data.user?.email_confirmed_at) { router.push(next); router.refresh(); return; }
    setMode("verify"); startResendCooldown();
    setMessage("If this address can be registered, a 6-digit verification code has been sent.");
  }

  async function verifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); resetFeedback();
    if (!/^\d{6}$/.test(otp)) { setError("Enter the 6-digit code."); return; }
    setBusy(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({ email: email.trim(), token: otp, type: "signup" });
    setBusy(false);
    if (verifyError) { setError(GENERIC_ERROR); return; }
    router.push(requestedNext() ?? "/customer/explore"); router.refresh();
  }

  async function resendOtp() {
    if (!resendReady) return;
    resetFeedback(); setBusy(true);
    const { error: resendError } = await supabase.auth.resend({ type: "signup", email: email.trim() });
    setBusy(false); startResendCooldown();
    if (resendError) { setError(GENERIC_ERROR); return; }
    setMessage("If this address can be registered, a new verification code has been sent.");
  }

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); resetFeedback(); setBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    if (resetError) { setError(GENERIC_ERROR); return; }
    setMessage("If an account matches, password reset instructions have been sent.");
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

  const title = mode === "signup" ? "Create your account" : mode === "verify" ? "Verify your email" : mode === "forgot" ? "Reset your password" : "Welcome back";
  const roleCategories = demoAccountRoleCategories(users);
  const visibleUsers = filterDemoAccountsByRole(users, roleFilter);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12" style={{ backgroundColor: "var(--background)" }}>
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary"><Globe size={18} className="text-white" /></div><span className="font-[family-name:var(--font-display)] text-xl font-bold text-foreground">MyWisata</span></div>
        <div className="mb-3 flex items-center justify-end gap-3"><span className="text-xs text-muted-foreground">{tAuth("language.description")}</span><LanguageSwitcher compact /></div>
        <Card className="p-2"><CardContent className="px-4 pt-2">
          <h1 className="mb-1 text-lg font-bold text-foreground">{title}</h1>
          <p className="mb-4 text-sm text-muted-foreground">Use your email address or continue with Google. Demo accounts remain available below.</p>
          {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {message && <p role="status" className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}

          {mode === "verify" ? (
            <form onSubmit={verifyEmail} className="space-y-3 rounded-xl border border-border bg-secondary/30 p-3">
              <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to <strong>{email}</strong>.</p>
              <input aria-label="Email verification code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-center text-lg tracking-[0.35em]" />
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Verifying…" : "Verify email"}</Button>
              <button type="button" onClick={resendOtp} disabled={busy || !resendReady} className="w-full text-sm font-semibold text-primary disabled:text-muted-foreground">Resend code</button>
              <button type="button" onClick={() => { resetFeedback(); setMode("signin"); }} className="w-full text-sm text-muted-foreground">Back to sign in</button>
            </form>
          ) : mode === "forgot" ? (
            <form onSubmit={requestReset} className="space-y-3 rounded-xl border border-border bg-secondary/30 p-3">
              <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Sending…" : "Send reset instructions"}</Button>
              <button type="button" onClick={() => { resetFeedback(); setMode("signin"); }} className="w-full text-sm text-muted-foreground">Back to sign in</button>
            </form>
          ) : (
            <>
              <div className="mb-3 grid grid-cols-2 rounded-lg bg-secondary/50 p-1"><button type="button" onClick={() => { resetFeedback(); setMode("signin"); }} className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === "signin" ? "bg-background text-primary shadow-sm" : "text-muted-foreground"}`}>{tCommon("account.signIn")}</button><button type="button" onClick={() => { resetFeedback(); setMode("signup"); }} className={`rounded-md px-3 py-2 text-sm font-semibold ${mode === "signup" ? "bg-background text-primary shadow-sm" : "text-muted-foreground"}`}>Create account</button></div>
              <form onSubmit={mode === "signup" ? signUp : signIn} className="space-y-2 rounded-xl border border-border bg-secondary/30 p-3">
                <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email address" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
                <input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" />
                {mode === "signup" && <><input type="password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm password" className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm" /><p className="px-1 text-[11px] text-muted-foreground">10+ characters, uppercase, lowercase, and number.</p></>}
                <Button type="submit" className="w-full" disabled={busy}>{busy ? "Please wait…" : mode === "signup" ? "Create account" : tCommon("account.signIn")}</Button>
                {mode === "signin" && <button type="button" onClick={() => { resetFeedback(); setMode("forgot"); }} className="w-full text-sm font-semibold text-primary">Forgot password?</button>}
              </form>
              <div className="my-3 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
              <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={continueWithGoogle}>Continue with Google</Button>
            </>
          )}

          <button type="button" onClick={enterGuestMode} disabled={busy} className="mt-5 flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-secondary disabled:cursor-wait disabled:opacity-70"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-700 text-sm font-bold text-white">G</div><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-foreground">{tCommon("guest.mode")}</p><p className="text-xs text-muted-foreground">Browse vendors and listings without signing in</p></div><Badge variant="secondary" className="shrink-0">Guest</Badge></button>
          <div className="mt-5 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Seeded demo accounts</p><span className="text-[11px] text-muted-foreground">Quick entry</span></div>
          {roleCategories.length > 1 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" onClick={() => setRoleFilter(null)} className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${roleFilter === null ? "bg-primary text-white" : "border border-border text-muted-foreground hover:bg-secondary"}`}>All</button>
              {roleCategories.map((role) => <button key={role} type="button" onClick={() => setRoleFilter(role)} className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${roleFilter === role ? "bg-primary text-white" : "border border-border text-muted-foreground hover:bg-secondary"}`}>{ROLE_LABEL[role]}</button>)}
            </div>
          )}
          <div className="mt-2 space-y-2">{visibleUsers.map((user) => <button key={user.id} onClick={() => pick(user)} className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition-colors hover:bg-secondary"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-white">{user.avatarInitial}</div><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-foreground">{user.name}</p><p className="truncate text-xs text-muted-foreground">{user.vendorName || user.outletName || user.email}</p></div><Badge variant="secondary" className="shrink-0">{ROLE_LABEL[user.role]}</Badge></button>)}</div>
        </CardContent></Card>
        <p className="mt-4 text-center text-xs text-muted-foreground">Demo records are stored in Supabase. The browser is not used as the database.</p>
      </div>
    </div>
  );
}
