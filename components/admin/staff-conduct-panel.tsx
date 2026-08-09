"use client";

// P4 — Member 4: staff conduct review panel. CLAUDE-ADMIN-CONDUCT.md.
// Super-admin-only — mounted on /admin/ai-assistant, which already gates the
// whole page on super_admin client-side; this panel's own API calls
// independently re-check server-side. Modeled directly on
// components/admin/moderation-flags-panel.tsx (same "render nothing until
// something has ever been flagged" and "keep the panel mounted with a
// Show reviewed toggle" patterns), but distinct data/table: this is about
// who an ADMIN was rude to, not what a customer said.

import { useEffect, useState } from "react";
import { UserX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ConductFlag {
  id: string;
  flaggedAdminName: string;
  targetUserId: string | null;
  targetUserName: string | null;
  source: "ticket_reply" | "admin_ai";
  sourceRefId: string;
  originalText: string;
  severity: "medium" | "high";
  status: "open" | "reviewed";
  createdAt: string;
}

interface TranscriptMessage {
  role: string;
  text: string;
}

const SOURCE_LABEL: Record<ConductFlag["source"], string> = {
  ticket_reply: "Ticket reply",
  admin_ai: "AI assistant",
};

const SEVERITY_STYLE: Record<ConductFlag["severity"], string> = {
  medium: "bg-amber-100 text-amber-700",
  high: "bg-destructive/15 text-destructive",
};

export function StaffConductPanel() {
  const [flags, setFlags] = useState<ConductFlag[] | null | undefined>(undefined);
  const [showReviewed, setShowReviewed] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [transcriptFlag, setTranscriptFlag] = useState<ConductFlag | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[] | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/admin/conduct-flags");
      const body = (await res.json()) as { data: ConductFlag[] | null };
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
      await fetch(`/api/admin/conduct-flags/${id}`, { method: "PATCH" });
      await load();
    } finally {
      setReviewingId(null);
    }
  }

  async function openTranscript(flag: ConductFlag) {
    setTranscriptFlag(flag);
    setTranscript(null);
    try {
      const res = await fetch(`/api/admin/conduct-flags/${flag.id}/transcript`);
      const body = (await res.json()) as { data: { messages: TranscriptMessage[] } | null };
      setTranscript(res.ok && body.data ? body.data.messages : []);
    } catch {
      setTranscript([]);
    }
  }

  if (flags === undefined) return null; // loading — no need to flash an empty panel
  if (flags === null || flags.length === 0) return null; // nothing has EVER been flagged — keep the page uncluttered

  // Same reasoning as ModerationFlagsPanel: don't let the panel (and its
  // toggle) disappear once every flag is reviewed.
  const visible = showReviewed ? flags : flags.filter((f) => f.status === "open");
  const openCount = flags.filter((f) => f.status === "open").length;

  return (
    <div className="rounded-xl bg-card p-4 border border-destructive/20" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-wider text-destructive flex items-center gap-1.5">
          <UserX size={13} /> Staff conduct review {openCount > 0 && `(${openCount} open)`}
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
                <span className="font-semibold">{f.flaggedAdminName}</span>{" "}
                <span className="capitalize text-muted-foreground font-normal">
                  · {SOURCE_LABEL[f.source]} · to {f.targetUserName ?? "—"}
                </span>{" "}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_STYLE[f.severity]}`}>
                  {f.severity}
                </span>
              </p>
              {f.originalText && (
                <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">&ldquo;{f.originalText}&rdquo;</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(f.createdAt).toLocaleString()}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {f.source === "ticket_reply" ? (
                <Link href={`/admin/support?ticket=${f.sourceRefId}`} className="text-xs font-semibold text-primary hover:underline">
                  View log
                </Link>
              ) : (
                <button type="button" onClick={() => void openTranscript(f)} className="text-xs font-semibold text-primary hover:underline">
                  View log
                </button>
              )}
              {f.status === "open" ? (
                <Button size="sm" variant="outline" disabled={reviewingId === f.id} onClick={() => markReviewed(f.id)}>
                  {reviewingId === f.id ? "Marking…" : "Mark reviewed"}
                </Button>
              ) : (
                <span className="text-[10px] text-muted-foreground">Reviewed</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!transcriptFlag} onOpenChange={(open) => { if (!open) { setTranscriptFlag(null); setTranscript(null); } }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>AI assistant session — {transcriptFlag?.flaggedAdminName}</DialogTitle>
          </DialogHeader>
          {transcript === null ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : transcript.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages found for this session.</p>
          ) : (
            <div className="space-y-2">
              {transcript.map((m, i) => (
                <div key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "ml-auto bg-primary text-white" : "bg-muted text-foreground"}`}>
                  {m.text}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
