"use client";

// P4 — Member 4: moderation flags panel. CLAUDE-MODERATION.md.
// A slur is a safety issue, not just etiquette — this is what makes that
// guard visible, same role as the affiliate "Fraud guards" panel on
// /admin/affiliate. Mounted on /admin/support since every flagged source
// (chatbot messages, tickets, ticket replies) lives in this module's
// support/chatbot surface.

import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ModerationFlag {
  id: string;
  sourceType: "chatbot_message" | "ticket" | "ticket_reply";
  sourceId: string;
  userId: string | null;
  userName: string;
  flagType: string;
  severity: "low" | "medium" | "high";
  originalExcerpt: string | null;
  status: "open" | "reviewed";
  createdAt: string;
  reviewedAt: string | null;
}

const SOURCE_LABEL: Record<ModerationFlag["sourceType"], string> = {
  chatbot_message: "Chatbot message",
  ticket: "Ticket",
  ticket_reply: "Ticket reply",
};

export function ModerationFlagsPanel() {
  const [flags, setFlags] = useState<ModerationFlag[] | null | undefined>(undefined);
  const [showReviewed, setShowReviewed] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/admin/moderation/flags");
      const body = (await res.json()) as { data: ModerationFlag[] | null };
      setFlags(res.ok && body.data ? body.data : null);
    } catch {
      setFlags(null);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  async function markReviewed(id: string) {
    if (reviewingId) return;
    setReviewingId(id);
    try {
      await fetch(`/api/admin/moderation/flags/${id}`, { method: "PATCH" });
      await load();
    } finally {
      setReviewingId(null);
    }
  }

  if (flags === undefined) return null; // loading — no need to flash an empty panel
  if (flags === null || flags.length === 0) return null; // nothing has EVER been flagged — keep the page uncluttered

  // Once every flag is reviewed, keep the panel (with its toggle) mounted
  // rather than hiding it — hiding it here would take the "Show reviewed"
  // checkbox down with it, making reviewed flags permanently unreachable.
  const visible = showReviewed ? flags : flags.filter((f) => f.status === "open");
  const openCount = flags.filter((f) => f.status === "open").length;

  return (
    <div className="rounded-xl bg-card p-4 mb-4 border border-destructive/20" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-wider text-destructive flex items-center gap-1.5">
          <ShieldAlert size={13} /> Moderation flags {openCount > 0 && `(${openCount} open)`}
        </p>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={showReviewed} onChange={(e) => setShowReviewed(e.target.checked)} />
          Show reviewed
        </label>
      </div>
      <div className="space-y-2">
        {visible.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {openCount === 0 && flags.length > 0 ? "All flags reviewed." : "Nothing to review."}
          </p>
        )}
        {visible.map((f) => (
          <div key={f.id} className="flex items-start justify-between gap-3 text-sm border-t border-border pt-2 first:border-t-0 first:pt-0">
            <div>
              <p className="text-foreground">
                <span className="font-semibold">{f.userName}</span>{" "}
                <span className="capitalize text-muted-foreground font-normal">
                  · {SOURCE_LABEL[f.sourceType]} · {f.flagType}
                </span>
              </p>
              {f.originalExcerpt && (
                <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">&ldquo;{f.originalExcerpt}&rdquo;</p>
              )}
              <p className="text-[0.625rem] text-muted-foreground mt-0.5">{new Date(f.createdAt).toLocaleString()}</p>
            </div>
            {f.status === "open" ? (
              <Button size="sm" variant="outline" disabled={reviewingId === f.id} onClick={() => markReviewed(f.id)}>
                {reviewingId === f.id ? "Marking…" : "Mark reviewed"}
              </Button>
            ) : (
              <span className="text-[0.625rem] text-muted-foreground shrink-0">Reviewed</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
