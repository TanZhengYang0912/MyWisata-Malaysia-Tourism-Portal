"use client";

// P4 — Member 4: customer "My Tickets" list. CLAUDE-FIXES.md Fix 2 — the
// missing customer-facing half of the ticket system (admin could already
// see tickets; customers had no way to see a reply).

import { useEffect, useState } from "react";
import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

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

  useEffect(() => {
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

  if (tickets === undefined) {
    return <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 text-sm text-muted-foreground">Loading…</div>;
  }
  if (tickets === null) {
    return (
      <EmptyState title="Couldn't load your tickets" description="Something went wrong. Try refreshing the page." />
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl font-bold text-foreground mb-6 font-[family-name:var(--font-display)]">My Tickets</h1>

      {tickets.length === 0 ? (
        <EmptyState
          title="No support tickets yet"
          description="If our chatbot can't answer your question, you can raise a ticket right from the chat — it'll show up here."
        />
      ) : (
        <div className="rounded-2xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
          <div className="divide-y divide-border">
            {tickets.map((t) => (
              <Link
                key={t.id}
                href={`/customer/support/${t.id}`}
                className="px-6 py-4 flex items-center gap-4 flex-wrap hover:bg-muted/50 transition-colors"
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
    </div>
  );
}
