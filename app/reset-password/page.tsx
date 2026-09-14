"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { validatePassword } from "@/lib/auth/password-policy";
import { Button } from "@/components/ui/button";
import { MyWisataLogo } from "@/components/shared/mywisata-logo";
import { useTranslation } from "react-i18next";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t } = useTranslation("auth");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const validation = validatePassword(password);
    if (!validation.ok) { setError(t("errors.passwordPolicy")); return; }
    if (password !== confirm) { setError(t("errors.passwordMismatch")); return; }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) { setError(t("passwordReset.updateError")); return; }
    setMessage(t("passwordReset.updated"));
    window.setTimeout(() => router.replace("/login"), 900);
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col items-center justify-center px-6 py-12">
      <div className="mb-6 flex items-center justify-center">
        <MyWisataLogo markSize={36} />
      </div>
      <form onSubmit={submit} className="w-full space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-foreground">{t("passwordReset.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("passwordReset.requirements")}</p>
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
        <div className="relative">
          <input
            aria-label={t("fields.newPassword")}
            type={showPassword ? "text" : "password"}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={t("fields.newPassword")}
            className="h-11 w-full rounded-lg border border-border bg-background pl-3 pr-10 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <div className="relative">
          <input
            aria-label={t("fields.confirmPassword")}
            type={showConfirm ? "text" : "password"}
            required
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder={t("fields.confirmPassword")}
            className="h-11 w-full rounded-lg border border-border bg-background pl-3 pr-10 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="button"
            onClick={() => setShowConfirm(!showConfirm)}
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-muted-foreground hover:text-foreground"
            aria-label={showConfirm ? "Hide password" : "Show password"}
          >
            {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? t("passwordReset.saving") : t("passwordReset.update")}
        </Button>
      </form>
    </main>
  );
}
