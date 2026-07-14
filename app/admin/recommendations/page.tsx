"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth";
import { getVendorRecommendations } from "@/backend/domains/discovery";
import { ApproveRejectBar } from "@/components/admin/approve-reject-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { VerifiedContributorBadge } from "@/components/shared/verified-contributor-badge";
import { EmptyState } from "@/components/shared/empty-state";
import type { VendorRecommendation } from "@/backend/core/types";
import { useActionFeedback } from "@/components/providers/action-feedback";

export default function AdminRecommendationsPage() {
  const { currentUser } = useAuth();
  const { showFeedback } = useActionFeedback();
  const [recs, setRecs] = useState<VendorRecommendation[]>([]);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const pending  = recs.filter((r) => r.status === "pending");
  const reviewed = recs.filter((r) => r.status !== "pending");

  return (
    <div className="p-6 sm:p-8">
      <h1 className="font-bold text-lg text-foreground mb-1">Recommendation Moderation</h1>
      <p className="text-xs text-muted-foreground mb-6">Community-submitted vendors and hidden gems.</p>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      <div className="rounded-2xl overflow-hidden bg-card mb-6" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
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
                      <span>{r.category} · {r.state} · by {r.author?.name ?? "MyWisata member"}</span>
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
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
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
