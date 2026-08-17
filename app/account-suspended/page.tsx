"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/providers/auth";
import { useTranslation } from "react-i18next";

export default function AccountSuspendedPage() {
  const { currentUser } = useAuth();
  const { t } = useTranslation("customer");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);

  async function submitAppeal(event: FormEvent) {
    event.preventDefault();
    if (body.trim().length < 10) { setError(t("accountLifecycle.suspended.minimumAppeal")); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/account-suspended/appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message ?? t("accountLifecycle.suspended.submitError"));
      setTicketId(result.data?.id ?? null);
      setBody("");
    } catch (err) { setError(err instanceof Error ? err.message : t("accountLifecycle.suspended.submitError")); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-6 py-10">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-7 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">{t("accountLifecycle.suspended.title")}</h1>
        <p className="mt-3 text-sm text-muted-foreground text-center">
          {currentUser?.email ? `${currentUser.email} ${t("accountLifecycle.suspended.statusSuffix")}` : t("accountLifecycle.suspended.status")} {t("accountLifecycle.suspended.contact")}
        </p>
        {ticketId ? <div className="mt-6 rounded-xl border border-primary/25 bg-primary/5 p-4 text-center"><p className="text-sm font-semibold text-primary">{t("accountLifecycle.suspended.appealSubmitted")}</p><p className="mt-1 text-xs text-muted-foreground">{t("accountLifecycle.suspended.ticket", { ticketId })}</p><Link href={`/customer/support/${ticketId}`} className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline">{t("accountLifecycle.suspended.viewTicket")}</Link></div> : <form onSubmit={submitAppeal} className="mt-6 space-y-3"><label className="block text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("accountLifecycle.suspended.appealLabel")}<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} maxLength={2000} placeholder={t("accountLifecycle.suspended.appealPlaceholder")} className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /></label>{error && <p className="text-left text-sm text-destructive">{error}</p>}<button type="submit" disabled={busy || body.trim().length < 10} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{busy ? t("accountLifecycle.suspended.submitting") : t("accountLifecycle.suspended.submit")}</button></form>}
        <Link href="/customer/support" className="mt-5 block text-center text-xs font-semibold text-muted-foreground hover:text-primary">{t("accountLifecycle.suspended.viewTickets")}</Link>
      </section>
    </main>
  );
}
