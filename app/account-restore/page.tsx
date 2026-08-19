"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export default function AccountRestorePage() {
  const { currentUser, refreshUser } = useAuth();
  const { t } = useTranslation("customer");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/restore", { method: "POST" });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? t("accountLifecycle.restore.error"));
      await refreshUser();
      router.replace("/customer/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("accountLifecycle.restore.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-6">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-7 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">{t("accountLifecycle.restore.title")}</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {currentUser?.email ? `${currentUser.email} ${t("accountLifecycle.restore.closedSuffix")}` : t("accountLifecycle.restore.closed")} {t("accountLifecycle.restore.keepHistory")}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">{t("accountLifecycle.restore.reverification")}</p>
        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        <Button className="mt-6 w-full" onClick={restore} disabled={busy}>
          {busy ? t("accountLifecycle.restore.restoring") : t("accountLifecycle.restore.action")}
        </Button>
      </section>
    </main>
  );
}
