"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useAuth } from "@/components/providers/auth";

export default function AccountSuspendedPage() {
  const { currentUser } = useAuth();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketId, setTicketId] = useState<string | null>(null);

  async function submitAppeal(event: FormEvent) {
    event.preventDefault();
    if (body.trim().length < 10) { setError("Please provide at least 10 characters so Support can review your appeal."); return; }
    setBusy(true); setError(null);
    try {
      const response = await fetch("/api/account-suspended/appeal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: body.trim() }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error?.message ?? "Unable to submit appeal");
      setTicketId(result.data?.id ?? null);
      setBody("");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to submit appeal"); }
    finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-background px-6 py-10">
      <section className="w-full max-w-md rounded-2xl border border-border bg-card p-7 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">Account suspended</h1>
        <p className="mt-3 text-sm text-muted-foreground text-center">
          {currentUser?.email ? `${currentUser.email} is currently suspended.` : "This account is currently suspended."} Contact support if you believe this is a mistake.
        </p>
        {ticketId ? <div className="mt-6 rounded-xl border border-primary/25 bg-primary/5 p-4 text-center"><p className="text-sm font-semibold text-primary">Appeal submitted</p><p className="mt-1 text-xs text-muted-foreground">Support ticket: {ticketId}</p><Link href={`/customer/support/${ticketId}`} className="mt-3 inline-flex text-sm font-semibold text-primary hover:underline">View ticket</Link></div> : <form onSubmit={submitAppeal} className="mt-6 space-y-3"><label className="block text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Appeal message<textarea value={body} onChange={(event) => setBody(event.target.value)} rows={5} maxLength={2000} placeholder="Explain why you believe this suspension should be reviewed…" className="mt-2 w-full resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-sm" /></label>{error && <p className="text-left text-sm text-destructive">{error}</p>}<button type="submit" disabled={busy || body.trim().length < 10} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Submitting…" : "Submit appeal"}</button></form>}
        <Link href="/customer/support" className="mt-5 block text-center text-xs font-semibold text-muted-foreground hover:text-primary">View support tickets</Link>
      </section>
    </main>
  );
}
