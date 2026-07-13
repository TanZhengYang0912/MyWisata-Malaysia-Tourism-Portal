"use client";

// P4 — Member 4: customer ticket detail + reply thread. CLAUDE-FIXES.md Fix 2,
// bubble rendering delegated to the shared <TicketThread> per CLAUDE-FIXES-2.md item 2.

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { TicketThread, type ReplyMessage, type TranscriptMessage } from "@/components/shared/ticket-thread";

interface TicketDetail {
  id: string;
  userId: string | null;
  subject: string;
  body: string;
  category: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  createdAt: string;
  resolvedAt: string | null;
  transcript: TranscriptMessage[];
  replies: ReplyMessage[];
}

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

const LOCKED_STATUSES = new Set(["resolved", "closed"]);

export default function CustomerTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentUser } = useAuth();
  const [ticket, setTicket] = useState<TicketDetail | null | undefined>(undefined);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [reopening, setReopening] = useState(false);

  async function loadTicket() {
    try {
      const res = await fetch(`/api/support/tickets/${id}`);
      const body = (await res.json()) as { data: TicketDetail | null };
      setTicket(res.ok && body.data ? body.data : null);
    } catch {
      setTicket(null);
    }
  }

  useEffect(() => {
    (async () => {
      await loadTicket();
      // Marks read on actually opening the thread, not just when a list
      // row renders (CLAUDE-FIXES-2.md item 1's own instruction). Fire and
      // forget — the badge will just stay stale for one more poll cycle if
      // this happens to fail.
      await fetch(`/api/support/tickets/${id}/read`, { method: "PATCH" });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function sendReply() {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/support/tickets/${id}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (res.ok) {
        setReply("");
        await loadTicket();
      }
    } finally {
      setSending(false);
    }
  }

  async function reopenTicket() {
    if (reopening) return;
    setReopening(true);
    try {
      const res = await fetch(`/api/support/tickets/${id}/reopen`, { method: "POST" });
      if (res.ok) await loadTicket();
    } finally {
      setReopening(false);
    }
  }

  if (ticket === undefined || !currentUser) {
    return <div className="max-w-2xl mx-auto px-4 sm:px-6 py-16 text-sm text-muted-foreground">Loading…</div>;
  }
  if (ticket === null) {
    return <EmptyState title="Couldn't load this ticket" description="It may not exist, or it's not yours." />;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <Link href="/customer/support" className="text-xs text-muted-foreground flex items-center gap-1 mb-4 hover:opacity-70">
        <ArrowLeft size={13} /> My Tickets
      </Link>

      <div className="flex items-start justify-between gap-3 mb-1">
        <h1 className="text-xl font-bold text-foreground font-[family-name:var(--font-display)]">{ticket.subject}</h1>
        <span className="text-xs font-semibold rounded-full px-3 py-1.5 shrink-0 bg-muted text-muted-foreground">
          {STATUS_LABEL[ticket.status] ?? ticket.status}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-6">
        {ticket.category} · opened {new Date(ticket.createdAt).toLocaleDateString()}
      </p>

      <div className="rounded-xl border border-border overflow-hidden mb-4">
        <div className="max-h-[50vh] overflow-y-auto px-4 py-4">
          <TicketThread
            currentUserId={currentUser.id}
            ticketOwnerId={ticket.userId}
            ticketBody={ticket.body}
            ticketCreatedAt={ticket.createdAt}
            transcript={ticket.transcript}
            replies={ticket.replies}
          />
        </div>
      </div>

      {LOCKED_STATUSES.has(ticket.status) ? (
        <div className="rounded-xl border border-border bg-muted px-4 py-3 text-center">
          <p className="text-sm text-muted-foreground mb-2">
            This ticket is resolved.{" "}
            <button onClick={reopenTicket} disabled={reopening} className="text-primary underline font-medium">
              {reopening ? "Reopening…" : "Reopen ticket"}
            </button>{" "}
            or start a new one.
          </p>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <input
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendReply();
            }}
            placeholder="Reply to this ticket…"
            className="flex-1 h-10 rounded-full border border-border px-4 text-sm bg-background text-foreground"
            disabled={sending}
          />
          <Button size="icon" className="h-10 w-10 rounded-full shrink-0" onClick={sendReply} disabled={sending || !reply.trim()}>
            <Send size={14} />
          </Button>
        </div>
      )}
    </div>
  );
}
