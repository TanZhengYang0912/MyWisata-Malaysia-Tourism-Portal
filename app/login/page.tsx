"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, ArrowRight } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { createClient } from "@/lib/supabase/client";
import { validatePassword } from "@/lib/auth/password-policy";
import { postLoginPath } from "@/lib/auth/guest-mode";
import { demoAccountRoleCategories, filterDemoAccountsByRole } from "@/lib/auth/demo-account-filter";
import { postLoginDestination } from "@/lib/auth/post-login-destination";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { MyWisataLogo } from "@/components/shared/mywisata-logo";
import type { Role, User } from "@/backend/core/types";

type DemoUser = User & { vendorName?: string; outletName?: string };
type AuthMode = "signin" | "signup" | "verify" | "forgot";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const { switchUser } = useAuth();
  const { t: tAuth } = useTranslation("auth");
  const { t: tCommon } = useTranslation("common");
  const GENERIC_ERROR = tAuth("errors.generic");
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [users, setUsers] = useState<DemoUser[]>([]);
  const [roleFilter, setRoleFilter] = useState<Role | null>(null);
  const [mode, setMode] = useState<AuthMode>(() =>
    searchParams.get("mode") === "signup" ? "signup" : "signin",
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
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
      .then(async (response) => {
        if (!response.ok) throw new Error(tAuth("errors.demoLoad"));
        return response.json() as Promise<DemoUser[]>;
      })
      .then(setUsers)
      .catch(() => setError(tAuth("errors.demoLoad")));
  }, [GENERIC_ERROR, tAuth]);

  function resetFeedback() {
    setError(null);
    setMessage(null);
  }

  function requestedNext() {
    return postLoginPath(new URLSearchParams(window.location.search).get("next"));
  }

  async function pick(user: User) {
    resetFeedback();
    try {
      const signedInUser = await switchUser(user.id, user);
      router.push(postLoginDestination(signedInUser?.role ?? user.role, requestedNext()));
      router.refresh();
    } catch {
      setError(GENERIC_ERROR);
    }
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();
    setBusy(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (signInError) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      setBusy(false);
      setError(tAuth("signIn.error"));
      return;
    }
    setBusy(false);
    const { data: sessionData } = await supabase.auth.getSession();
    if (!sessionData.session?.user.email_confirmed_at) {
      setMode("verify");
      setMessage(tAuth("signIn.verifyEmailMessage"));
      startResendCooldown();
      return;
    }
    router.push(`/auth/callback?next=${encodeURIComponent(requestedNext() ?? "/")}`);
    router.refresh();
  }

  async function enterGuestMode() {
    resetFeedback();
    setBusy(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const { error: signOutError } = session
      ? await supabase.auth.signOut({ scope: "local" })
      : { error: null };
    setBusy(false);
    if (signOutError) {
      setError(tCommon("guest.startError"));
      return;
    }
    router.replace("/customer");
    router.refresh();
  }

  async function signUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();
    const validation = validatePassword(password);
    if (!validation.ok) {
      setError(tAuth("errors.passwordPolicy"));
      return;
    }
    if (password !== confirmPassword) {
      setError(tAuth("errors.passwordMismatch"));
      return;
    }
    const next = requestedNext() ?? "/customer";
    setBusy(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    setBusy(false);
    if (signUpError) {
      setError(GENERIC_ERROR);
      return;
    }
    if (data.session && data.user?.email_confirmed_at) {
      router.push(`/auth/callback?next=${encodeURIComponent(next)}`);
      router.refresh();
      return;
    }
    setMode("verify");
    startResendCooldown();
    setMessage(tAuth("signUp.verificationSent"));
  }

  async function verifyEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();
    if (!/^\d{6}$/.test(otp)) {
      setError(tAuth("verification.invalidCode"));
      return;
    }
    setBusy(true);
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: otp,
      type: "signup",
    });
    setBusy(false);
    if (verifyError) {
      setError(GENERIC_ERROR);
      return;
    }
    router.push(`/auth/callback?next=${encodeURIComponent(requestedNext() ?? "/customer/explore")}`);
    router.refresh();
  }

  async function resendOtp() {
    if (!resendReady) return;
    resetFeedback();
    setBusy(true);
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
    });
    setBusy(false);
    startResendCooldown();
    if (resendError) {
      setError(GENERIC_ERROR);
      return;
    }
    setMessage(tAuth("signUp.verificationResent"));
  }

  async function requestReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    resetFeedback();
    setBusy(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    if (resetError) {
      setError(GENERIC_ERROR);
      return;
    }
    setMessage(tAuth("passwordReset.instructionsSent"));
  }

  async function continueWithGoogle() {
    resetFeedback();
    setBusy(true);
    const next = requestedNext() ?? "/customer/explore";
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (oauthError) {
      setBusy(false);
      setError(GENERIC_ERROR);
    }
  }

  const title =
    mode === "signup"
      ? tAuth("titles.createAccount")
      : mode === "verify"
        ? tAuth("titles.verifyEmail")
        : mode === "forgot"
          ? tAuth("titles.resetPassword")
          : tAuth("titles.welcomeBack");

  const roleCategories = demoAccountRoleCategories(users);
  const visibleUsers = filterDemoAccountsByRole(users, roleFilter);

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col justify-between pt-4 sm:pt-6 pb-8 px-4 sm:px-6 relative overflow-x-hidden">
      {/* Subtle, soft ambient background glow matching system secondary palette */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-secondary/80 via-background/40 to-transparent -z-10"
        aria-hidden="true"
      />

      {/* Main Authentication Card - Shifted higher up */}
      <main className="w-full max-w-[490px] mx-auto mt-2 sm:mt-4 mb-auto py-2 sm:py-4">
        {/* Brand Logo with Language Switcher to the right, aligned with the card border below */}
        <header className="relative mb-5 sm:mb-6 flex items-center justify-center min-h-[60px]">
          <MyWisataLogo markSize={60} priority />
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-28 sm:w-32">
            <LanguageSwitcher compact />
          </div>
        </header>

        <Card className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <CardContent className="p-7 sm:p-9">
            {/* Header / Title */}
            <div className="text-center mb-6 sm:mb-7">
              <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-foreground">{title}</h1>
              <p className="mt-2 text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {tAuth("login.description")}
              </p>
            </div>

            {/* Error & Feedback Messages */}
            {error && (
              <div
                role="alert"
                className="mb-4 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-xs sm:text-sm font-medium text-destructive"
              >
                {error}
              </div>
            )}
            {message && (
              <div
                role="status"
                className="mb-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs sm:text-sm font-medium text-emerald-700 dark:text-emerald-400"
              >
                {message}
              </div>
            )}

            {/* Mode: Verify Email */}
            {mode === "verify" ? (
              <form onSubmit={verifyEmail} className="space-y-4 sm:space-y-5">
                <p className="text-xs sm:text-sm text-muted-foreground text-center">
                  {tAuth("verification.codeSentTo")}{" "}
                  <strong className="text-foreground">{email}</strong>
                </p>
                <div>
                  <input
                    aria-label={tAuth("verification.codeLabel")}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    required
                    value={otp}
                    onChange={(event) =>
                      setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))
                    }
                    className="h-12 w-full rounded-xl border border-border bg-secondary/40 px-4 text-center text-xl font-bold tracking-[0.4em] text-foreground focus:border-primary focus:bg-card focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm sm:text-base shadow-sm transition-all"
                  disabled={busy}
                >
                  {busy ? tCommon("states.processingEllipsis") : tAuth("verification.verifyEmail")}
                </Button>
                <div className="flex flex-col gap-2 pt-2 text-center text-xs sm:text-sm">
                  <button
                    type="button"
                    onClick={resendOtp}
                    disabled={busy || !resendReady}
                    className="font-semibold text-primary hover:underline disabled:text-muted-foreground"
                  >
                    {tAuth("verification.resendCode")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetFeedback();
                      setMode("signin");
                    }}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {tAuth("actions.backToSignIn")}
                  </button>
                </div>
              </form>
            ) : mode === "forgot" ? (
              /* Mode: Forgot Password */
              <form onSubmit={requestReset} className="space-y-4 sm:space-y-5">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    {tAuth("fields.email")}
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder={tAuth("fields.email")}
                    aria-label={tAuth("fields.email")}
                    className="h-12 w-full rounded-xl border border-border bg-card px-4 text-sm sm:text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all shadow-xs"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm sm:text-base shadow-sm transition-all"
                  disabled={busy}
                >
                  {busy
                    ? tCommon("states.processingEllipsis")
                    : tAuth("passwordReset.sendInstructions")}
                </Button>
                <button
                  type="button"
                  onClick={() => {
                    resetFeedback();
                    setMode("signin");
                  }}
                  className="w-full text-center text-xs sm:text-sm font-medium text-muted-foreground hover:text-foreground pt-1 transition-colors"
                >
                  {tAuth("actions.backToSignIn")}
                </button>
              </form>
            ) : (
              /* Mode: Sign In or Sign Up */
              <div className="space-y-5 sm:space-y-6">
                {/* Segmented Mode Switcher */}
                <div className="grid grid-cols-2 rounded-xl bg-secondary/80 p-1">
                  <button
                    type="button"
                    onClick={() => {
                      resetFeedback();
                      setMode("signin");
                    }}
                    className={`rounded-lg py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                      mode === "signin"
                        ? "bg-card text-primary shadow-xs font-bold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tCommon("account.signIn")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetFeedback();
                      setMode("signup");
                    }}
                    className={`rounded-lg py-2.5 text-xs sm:text-sm font-semibold transition-all ${
                      mode === "signup"
                        ? "bg-card text-primary shadow-xs font-bold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tCommon("account.createAccount")}
                  </button>
                </div>

                {/* Main Auth Form */}
                <form
                  onSubmit={mode === "signup" ? signUp : signIn}
                  className="space-y-4 sm:space-y-5"
                >
                  {/* Email Input */}
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                      {tAuth("fields.email")}
                    </label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      placeholder={tAuth("fields.email")}
                      aria-label={tAuth("fields.email")}
                      className="h-12 w-full rounded-xl border border-border bg-card px-4 text-sm sm:text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all shadow-xs"
                    />
                  </div>

                  {/* Password Input with Eye Toggle */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {tAuth("fields.password")}
                      </label>
                      {mode === "signin" && (
                        <button
                          type="button"
                          onClick={() => {
                            resetFeedback();
                            setMode("forgot");
                          }}
                          className="text-xs sm:text-sm font-medium text-primary hover:underline transition-colors"
                        >
                          {tAuth("passwordReset.forgotPassword")}
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        required
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder={tAuth("fields.password")}
                        aria-label={tAuth("fields.password")}
                        className="h-12 w-full rounded-xl border border-border bg-card pl-4 pr-11 text-sm sm:text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all shadow-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-muted-foreground hover:text-primary focus:outline-none transition-colors"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                      >
                        {showPassword ? <EyeOff className="h-4.5 w-4.5" /> : <Eye className="h-4.5 w-4.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm Password with Eye Toggle in Sign-Up mode */}
                  {mode === "signup" && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {tAuth("fields.confirmPassword")}
                      </label>
                      <div className="relative">
                        <input
                          type={showConfirmPassword ? "text" : "password"}
                          required
                          value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          placeholder={tAuth("fields.confirmPassword")}
                          aria-label={tAuth("fields.confirmPassword")}
                          className="h-12 w-full rounded-xl border border-border bg-card pl-4 pr-11 text-sm sm:text-base text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/10 transition-all shadow-xs"
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-muted-foreground hover:text-primary focus:outline-none transition-colors"
                          aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="h-4.5 w-4.5" />
                          ) : (
                            <Eye className="h-4.5 w-4.5" />
                          )}
                        </button>
                      </div>
                      <p className="px-1 text-[11px] text-muted-foreground">
                        {tAuth("passwordReset.requirements")}
                      </p>
                    </div>
                  )}

                  <Button
                    type="submit"
                    className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-sm sm:text-base shadow-sm transition-all active:scale-[0.99]"
                    disabled={busy}
                  >
                    {busy ? (
                      tCommon("states.processingEllipsis")
                    ) : mode === "signup" ? (
                      <span className="inline-flex items-center gap-2">
                        {tCommon("account.createAccount")}
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        {tCommon("account.signIn")}
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
                </form>

                {/* Divider */}
                <div className="relative my-4 flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <span className="relative bg-card px-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                    {tAuth("actions.or")}
                  </span>
                </div>

                {/* Continue with Google */}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-12 rounded-xl border-border bg-card hover:bg-secondary/60 text-foreground font-medium text-sm sm:text-base shadow-xs transition-all"
                  disabled={busy}
                  onClick={continueWithGoogle}
                >
                  <svg className="mr-2.5 h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  {tAuth("actions.continueWithGoogle")}
                </Button>

                {/* Guest Entry Point */}
                <button
                  type="button"
                  onClick={enterGuestMode}
                  disabled={busy}
                  className="flex w-full items-center gap-3.5 rounded-xl border border-border p-3.5 text-left transition-all hover:bg-secondary/60 hover:border-primary/30 disabled:cursor-wait disabled:opacity-70 shadow-xs"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary text-xs sm:text-sm font-bold text-primary-foreground shadow-xs">
                    G
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-semibold text-foreground">{tCommon("guest.mode")}</p>
                    <p className="text-[11px] sm:text-xs text-muted-foreground truncate">{tAuth("guest.description")}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px] bg-secondary text-primary font-semibold">
                    {tAuth("guest.label")}
                  </Badge>
                </button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* DEV / DEMO ONLY: Seeded Demo Accounts (Placed in unused right-hand space on desktop, easily removable) */}
      <aside className="w-full max-w-[490px] mx-auto mt-6 lg:mt-0 lg:fixed lg:right-6 xl:right-8 lg:top-16 xl:top-18 lg:w-[350px] xl:w-[370px] lg:z-20">
        <div className="rounded-2xl border border-border bg-card/95 p-4 shadow-sm backdrop-blur-md">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
              <p className="text-xs font-bold uppercase tracking-wider text-foreground">
                {tAuth("demo.title")}
              </p>
            </div>
            <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-semibold text-primary">
              {tAuth("demo.quickEntry")}
            </span>
          </div>

          {/* Role Filter Chips */}
          {roleCategories.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setRoleFilter(null)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
                  roleFilter === null
                    ? "bg-primary text-primary-foreground shadow-xs"
                    : "border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {tCommon("filters.all")}
              </button>
              {roleCategories.map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => setRoleFilter(role)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ${
                    roleFilter === role
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : "border border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  {tAuth(`roles.${role}`)}
                </button>
              ))}
            </div>
          )}

          {/* Demo Accounts List - Elongated to show more accounts comfortably */}
          <div className="mt-3 max-h-[520px] xl:max-h-[580px] space-y-1.5 overflow-y-auto pr-0.5">
            {visibleUsers.map((user) => (
              <button
                key={user.id}
                onClick={() => pick(user)}
                className="group flex w-full items-center gap-2.5 rounded-xl border border-border/60 bg-secondary/30 p-2 text-left transition-all hover:border-primary/40 hover:bg-card hover:shadow-xs focus:outline-none focus:ring-2 focus:ring-primary/10"
              >
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-xs font-bold text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  {user.avatarInitial}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                    {user.name}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {user.vendorName || user.outletName || user.email}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 text-[10px] font-medium border-border text-muted-foreground group-hover:border-primary/40 group-hover:text-primary">
                  {tAuth(`roles.${user.role}`)}
                </Badge>
              </button>
            ))}
          </div>

          <p className="mt-2.5 text-center text-[10px] text-muted-foreground">
            {tAuth("demo.disclaimer")}
          </p>
        </div>
      </aside>

      {/* Clean Minimal Footer */}
      <footer className="w-full text-center py-4 text-xs text-muted-foreground">
        <p>{tCommon("brand.copyright", { year: new Date().getFullYear() })}</p>
      </footer>
    </div>
  );
}
