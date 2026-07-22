"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Play, Sparkles } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { getVendorRecommendations } from "@/backend/domains/discovery";
import { ApproveRejectBar } from "@/components/admin/approve-reject-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { VerifiedContributorBadge } from "@/components/shared/verified-contributor-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type { VendorRecommendation } from "@/backend/core/types";
import { useActionFeedback } from "@/components/providers/action-feedback";

// P4 — Member 4: CLAUDE-ADMIN-AI.md Part 2, Capability 3. Read-only overlay
// — this component never writes to vendor_recommendations; it only calls a
// new admin-ai route that reads it. Does not touch review()/getVendorRecommendations() above.
interface ModerationAssessment {
  completeness: string;
  duplicateLikelihood: "low" | "medium" | "high";
  qualityNotes: string;
  riskFlag: "low_risk" | "needs_review";
}

function AiReviewPanel({ recommendationId }: { recommendationId: string }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ModerationAssessment | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runReview() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin-ai/moderation-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId }),
      });
      const body = (await res.json()) as { data: ModerationAssessment | null; error: { message: string } | null };
      if (!res.ok || !body.data) {
        setError(body.error?.message ?? "AI review unavailable right now.");
        return;
      }
      setResult(body.data);
    } catch {
      setError("AI review unavailable right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full">
      <Button size="sm" variant="outline" onClick={runReview} disabled={loading} className="gap-1.5">
        <Sparkles size={13} /> {loading ? "Reviewing…" : "AI review"}
      </Button>
      {error && <p className="text-xs text-destructive mt-1.5">{error}</p>}
      {result && (
        <div className="mt-2 rounded-xl bg-muted px-3 py-2.5 text-xs space-y-1">
          <p className="font-bold uppercase tracking-wide text-[10px] text-muted-foreground">
            Advisory only — does not approve or reject
          </p>
          <p>
            <span className="font-semibold">Risk: </span>
            <span className={result.riskFlag === "needs_review" ? "text-destructive font-semibold" : "text-primary font-semibold"}>
              {result.riskFlag === "needs_review" ? "Needs review" : "Low risk"}
            </span>
          </p>
          <p><span className="font-semibold">Completeness: </span>{result.completeness}</p>
          <p><span className="font-semibold">Duplicate likelihood: </span>{result.duplicateLikelihood}</p>
          <p><span className="font-semibold">Quality notes: </span>{result.qualityNotes}</p>
        </div>
      )}
    </div>
  );
}

export default function AdminRecommendationsPage() {
  const { currentUser } = useAuth();
  const { showFeedback } = useActionFeedback();
  const [recs, setRecs] = useState<VendorRecommendation[]>([]);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearingMessage, setClearingMessage] = useState<string | null>(null);

  useEffect(() => {
    getVendorRecommendations().then(setRecs);
  }, []);

  async function review(r: VendorRecommendation, approve: boolean) {
    if (!currentUser || reviewing) return;
    setReviewing(r.id);
    setError(null);
    try {
      const res = await fetch('/api/admin/recommendations/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recommendationId: r.id,
          action: approve ? 'approve' : 'reject',
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body?.error?.message ?? 'Review failed.');
        return;
      }
      const status = approve ? "approved" : "rejected";
      setRecs((prev) => prev.map((x) => (x.id === r.id ? { ...x, status } : x)));
      showFeedback("success", `Recommendation ${approve ? "approved" : "rejected"}.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Review failed.';
      setError(message);
      showFeedback("error", message);
    } finally {
      setReviewing(null);
    }
  }

  async function runRewardClearing() {
    if (clearing) return;
    setClearing(true);
    setClearingMessage(null);
    setError(null);
    try {
      const response = await fetch('/api/admin/recommendations/run-clearing', { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = body?.error?.message ?? 'Unable to clear recommendation rewards.';
        setError(message);
        showFeedback('error', message);
        return;
      }
      const result = body?.data ?? {};
      const message = `Cleared ${result.cleared?.length ?? 0}, reversed ${result.reversed?.length ?? 0}, and kept ${result.skipped ?? 0} pending.`;
      setClearingMessage(message);
      showFeedback('success', message);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to clear recommendation rewards.';
      setError(message);
      showFeedback('error', message);
    } finally {
      setClearing(false);
    }
  }

  const pending  = recs.filter((r) => r.status === "pending");
  const reviewed = recs.filter((r) => r.status !== "pending");

  return (
    <div className="p-6 sm:p-8">
      <h1 className="font-bold text-lg text-foreground mb-1">Recommendation Moderation</h1>
      <p className="text-xs text-muted-foreground mb-2">Community-submitted vendors and hidden gems.</p>
      <p className="mb-6 max-w-2xl text-xs text-muted-foreground">Approve quality recommendations for outreach. Approval does not publish a vendor; link the approved recommendation from Vendor Management after the vendor joins so attribution and commission remain attached.</p>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      <section className="mb-6 rounded-2xl border border-border bg-card p-5" aria-label="Recommendation reward clearing">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-foreground">Recommendation reward clearing</h2>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Moves seven-day pending rewards to available earnings only after KYC approval. Cancelled or refunded orders are reversed automatically.
            </p>
          </div>
          <Button type="button" onClick={runRewardClearing} disabled={clearing} className="shrink-0 gap-2">
            {clearing ? <CheckCircle2 size={15} className="animate-pulse" /> : <Play size={15} />}
            {clearing ? 'Running…' : 'Run reward clearing'}
          </Button>
        </div>
        {clearingMessage && <p className="mt-3 text-xs font-medium text-primary">{clearingMessage}</p>}
      </section>

      <div className="rounded-2xl overflow-hidden bg-card mb-6" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <div className="px-6 py-5 border-b border-border">
          <h2 className="font-bold text-foreground">Pending ({pending.length})</h2>
        </div>
        {pending.length === 0 ? (
          <EmptyState title="No pending recommendations" />
        ) : (
          <div className="divide-y divide-border">
            {pending.map((r) => {
              return (
                <div key={r.id} className="px-6 py-4 flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{r.name}</p>
                      {r.duplicate && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">Duplicate</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Customer recommendation · {r.category} · {r.state} · by {r.author?.name ?? "MyWisata member"}</span>
                      {r.author && <VerifiedContributorBadge verified={r.author.isKycVerified} />}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-16 h-1.5 rounded-full overflow-hidden bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${r.qualityScore}%`, backgroundColor: r.qualityScore > 70 ? "var(--primary)" : r.qualityScore > 50 ? "var(--accent)" : "var(--destructive)" }}
                      />
                    </div>
                    <span className="text-xs font-bold font-[family-name:var(--font-mono)]" style={{ color: r.qualityScore > 70 ? "var(--primary)" : r.qualityScore > 50 ? "var(--accent)" : "var(--destructive)" }}>
                      {r.qualityScore}
                    </span>
                  </div>
                  <ApproveRejectBar
                    onApprove={() => review(r, true)}
                    onReject={() => review(r, false)}
                    disabled={reviewing === r.id}
                  />
                  {currentUser?.role === "super_admin" && <AiReviewPanel recommendationId={r.id} />}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <div className="px-6 py-5 border-b border-border">
          <h2 className="font-bold text-foreground">Reviewed</h2>
        </div>
        <div className="divide-y divide-border">
          {reviewed.map((r) => (
            <div key={r.id} className="px-6 py-3.5 flex items-center justify-between gap-3">
              <p className="text-sm text-foreground">{r.name}</p>
              <StatusBadge status={r.status} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
