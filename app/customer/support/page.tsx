"use client";

// P4 — Member 4: customer "My Tickets" list. CLAUDE-FIXES.md Fix 2 — the
// missing customer-facing half of the ticket system (admin could already
// see tickets; customers had no way to see a reply).

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { CustomerPageHeader, CustomerPageShell } from "@/components/customer/customer-page-shell";

interface TicketSummary {
  id: string;
  subject: string;
  category: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  createdAt: string;
  lastActivityAt: string;
  unread: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_STYLE: Record<string, string> = {
  open: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  in_progress: "bg-teal/10 text-teal",
  resolved: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  closed: "bg-muted text-muted-foreground",
};

export default function CustomerSupportPage() {
  const [tickets, setTickets] = useState<TicketSummary[] | null | undefined>(undefined);
  const [withdrawalId, setWithdrawalId] = useState<string | null>(null);
  const [subject, setSubject] = useState("Withdrawal information");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWithdrawalId(new URLSearchParams(window.location.search).get("withdrawal"));
    (async () => {
      try {
        const res = await fetch("/api/support/tickets");
        const body = (await res.json()) as { data: TicketSummary[] | null };
        setTickets(res.ok && body.data ? body.data : null);
      } catch {
        setTickets(null);
      }
    })();
  }, []);

  async function submitWithdrawalTicket(event: FormEvent) {
    event.preventDefault();
    if (!withdrawalId || body.trim().length < 1) return;
    setSending(true); setFormError("");
    try {
      const response = await fetch("/api/support/tickets", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ withdrawalId, subject, body }),
      });
      const result = await response.json() as { data?: { id: string }; error?: { message?: string } };
      if (!response.ok || !result.data) throw new Error(result.error?.message ?? "Unable to create support ticket");
      window.location.href = `/customer/support/${result.data.id}`;
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to create support ticket");
    } finally { setSending(false); }
  }

  if (tickets === undefined) {
    return <CustomerPageShell><div className="py-8 text-sm text-muted-foreground">Loading…</div></CustomerPageShell>;
  }
  if (tickets === null) {
    return (
      <CustomerPageShell><EmptyState title="Couldn't load your tickets" description="Something went wrong. Try refreshing the page." /></CustomerPageShell>
    );
  }

  return (
    <CustomerPageShell>
      <CustomerPageHeader
        eyebrow="Support"
        title="My Tickets"
        description="Track your questions and follow up with the MyWisata support team."
        icon={<MessageSquare size={14} />}
      />

      {withdrawalId && <form onSubmit={submitWithdrawalTicket} className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-3">
        <p className="font-semibold text-foreground">Provide information for your held withdrawal</p>
        <p className="text-sm text-muted-foreground">Reference: {withdrawalId}</p>
        <input value={subject} onChange={(event) => setSubject(event.target.value)} maxLength={255} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" aria-label="Ticket subject" />
        <textarea value={body} onChange={(event) => setBody(event.target.value)} required maxLength={2000} placeholder="Explain the requested payout information…" className="min-h-28 w-full rounded-xl border border-border bg-background p-3 text-sm" aria-label="Ticket message" />
        {formError && <p className="text-sm text-red-600">{formError}</p>}
        <button type="submit" disabled={sending || !body.trim()} className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">{sending ? "Sending…" : "Send information"}</button>
      </form>}

      {tickets.length === 0 ? (
        <EmptyState
          title="No support tickets yet"
          description="If our chatbot can't answer your question, you can raise a ticket right from the chat — it'll show up here."
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_8px_24px_rgba(1,0,102,0.06)]">
          <div className="divide-y divide-border">
            {tickets.map((t) => (
              <Link
                key={t.id}
                href={`/customer/support/${t.id}`}
                className="flex flex-wrap items-center gap-4 px-5 py-4 transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset sm:px-6"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <MessageSquare size={13} className="text-muted-foreground shrink-0" /> {t.subject}
                    {t.unread && <span className="w-2 h-2 rounded-full bg-destructive shrink-0" />}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.category} · last activity {new Date(t.lastActivityAt).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-xs font-semibold rounded-full px-3 py-1.5 shrink-0 ${STATUS_STYLE[t.status] ?? ""}`}>
                  {STATUS_LABEL[t.status] ?? t.status}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </CustomerPageShell>
  );
}
