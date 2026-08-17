"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { validatePassword } from "@/lib/auth/password-policy";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = createClient();
  const { t } = useTranslation("auth");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
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
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6 py-12">
      <form onSubmit={submit} className="w-full space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div><h1 className="text-xl font-bold text-foreground">{t("passwordReset.title")}</h1><p className="mt-1 text-sm text-muted-foreground">{t("passwordReset.requirements")}</p></div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {message && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
        <input aria-label={t("fields.newPassword")} type="password" required value={password} onChange={(event) => setPassword(event.target.value)} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" />
        <input aria-label={t("fields.confirmPassword")} type="password" required value={confirm} onChange={(event) => setConfirm(event.target.value)} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-sm" />
        <Button type="submit" className="w-full" disabled={busy}>{busy ? t("passwordReset.saving") : t("passwordReset.update")}</Button>
      </form>
    </main>
  );
}
