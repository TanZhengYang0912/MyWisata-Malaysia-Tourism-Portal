"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { getWithdrawals } from "@/backend/domains/commerce";
import { getUsers } from "@/backend/domains/identity";
import { recordApproval } from "@/backend/core/audit";
import { ApproveRejectBar } from "@/components/admin/approve-reject-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type { User, WithdrawalRequest } from "@/backend/core/types";
import { useActionFeedback } from "@/components/providers/action-feedback";

export default function AdminWithdrawalsPage() {
  const { currentUser } = useAuth();
  const { showFeedback } = useActionFeedback();
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [users, setUsers]             = useState<Map<string, User>>(new Map());
  const [loading, setLoading]         = useState<string | null>(null);

  useEffect(() => {
    getWithdrawals().then(setWithdrawals);
    getUsers().then((all) => setUsers(new Map(all.map((u) => [u.id, u]))));
  }, []);

  async function callApprove(w: WithdrawalRequest) {
    if (!currentUser || loading) return;
    setLoading(w.id);
    try {
      const res  = await fetch(`/api/admin/withdrawals/${w.id}/approve`, { method: "POST" });
      const json = await res.json();

      if (!res.ok) {
        const msg = json.error ?? "Approval failed";
        alert(msg);
        // If retryable (Stripe error), status stays 'approved' in DB — refresh to show retry button
        if (json.retryable) {
          setWithdrawals((prev) => prev.map((x) => x.id === w.id ? { ...x, status: "approved" } : x));
        }
        return;
      }

      if (json.status === "pending_second_approval") {
        showFeedback("success", `First approval recorded (${json.approval_count}/2). Waiting for second approver.`);
        return;
      }

      await recordApproval({
        actorId:      currentUser.id,
        action:       "withdrawal.approve",
        targetType:   "withdrawal",
        targetId:     w.id,
        notifyUserId: w.userId,
        notifyText:   `Your withdrawal of RM ${w.amount.toFixed(2)} has been approved and is being processed.`,
        before: { status: w.status },
        after:  { status: "processing" },
      });
      setWithdrawals((prev) => prev.map((x) => x.id === w.id ? { ...x, status: "processing" } : x));
      showFeedback("success", "Withdrawal approved and processing.");
    } catch {
      showFeedback("error", "Approval failed. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  async function callReject(w: WithdrawalRequest) {
    if (!currentUser || loading) return;
    setLoading(w.id);
    try {
      const res  = await fetch(`/api/admin/withdrawals/${w.id}/reject`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) { showFeedback("error", json.error ?? "Rejection failed"); return; }

      await recordApproval({
        actorId:      currentUser.id,
        action:       "withdrawal.reject",
        targetType:   "withdrawal",
        targetId:     w.id,
        notifyUserId: w.userId,
        notifyText:   `Your withdrawal of RM ${w.amount.toFixed(2)} was rejected. Funds returned to earnings.`,
        before: { status: w.status },
        after:  { status: "rejected" },
      });
      setWithdrawals((prev) => prev.map((x) => x.id === w.id ? { ...x, status: "rejected" } : x));
      showFeedback("success", "Withdrawal rejected and funds returned.");
    } catch {
      showFeedback("error", "Rejection failed. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  const pending   = withdrawals.filter((w) => w.status === "pending");
  const needRetry = withdrawals.filter((w) => w.status === "approved");
  const reviewed  = withdrawals.filter((w) => !["pending", "approved"].includes(w.status));

  function Row({ w }: { w: WithdrawalRequest }) {
    const user = users.get(w.userId);
    const busy = loading === w.id;
    return (
      <div className="px-6 py-4 flex items-center gap-4 flex-wrap">
        <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 bg-primary">
          {user?.avatarInitial ?? "?"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-foreground">{user?.name}</p>
            {w.requiresDualApproval && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-accent/25 text-[#B08020]">
                Dual Approval
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{w.destination}</p>
        </div>
        <p className="font-bold text-foreground font-[family-name:var(--font-mono)] shrink-0">
          RM {w.amount.toFixed(2)}
        </p>
        {w.status === "approved" ? (
          <div className="flex gap-2 shrink-0">
            <Button size="sm" className="text-xs gap-1.5" onClick={() => callApprove(w)} disabled={busy}>
              <RefreshCw size={11} /> Retry Stripe
            </Button>
            <Button size="sm" variant="outline" className="text-xs border-destructive text-destructive hover:bg-destructive/10" onClick={() => callReject(w)} disabled={busy}>
              Reject
            </Button>
          </div>
        ) : (
          <ApproveRejectBar onApprove={() => callApprove(w)} onReject={() => callReject(w)} disabled={busy} />
        )}
      </div>
    );
  }

  return (
    <div className="p-6 sm:p-8">
      <h1 className="font-bold text-lg text-foreground mb-1">Withdrawal Approvals</h1>
      <p className="text-xs text-muted-foreground mb-6">
        Approve triggers a Stripe Transfer + Payout. Reject restores earnings immediately.
      </p>

      {/* Pending */}
      <div className="rounded-2xl overflow-hidden bg-card mb-6" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <div className="px-6 py-5 border-b border-border">
          <h2 className="font-bold text-foreground">Pending ({pending.length})</h2>
        </div>
        {pending.length === 0 ? (
          <EmptyState title="No pending withdrawals" />
        ) : (
          <div className="divide-y divide-border">
            {pending.map((w) => <Row key={w.id} w={w} />)}
          </div>
        )}
      </div>

      {/* Approved — Stripe failed, needs retry */}
      {needRetry.length > 0 && (
        <div className="rounded-2xl overflow-hidden bg-card mb-6 border border-amber-200" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <div className="px-6 py-5 border-b border-amber-200 bg-amber-50">
            <h2 className="font-bold text-amber-800">Stripe Failed — Retry ({needRetry.length})</h2>
            <p className="text-xs text-amber-700 mt-0.5">Admin approved but Stripe payout failed. Retry or reject to refund.</p>
          </div>
          <div className="divide-y divide-border">
            {needRetry.map((w) => <Row key={w.id} w={w} />)}
          </div>
        </div>
      )}

      {/* Reviewed */}
      <div className="rounded-2xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <div className="px-6 py-5 border-b border-border">
          <h2 className="font-bold text-foreground">History</h2>
        </div>
        {reviewed.length === 0 ? (
          <EmptyState title="No history yet" />
        ) : (
          <div className="divide-y divide-border">
            {reviewed.map((w) => {
              const user = users.get(w.userId);
              return (
                <div key={w.id} className="px-6 py-3.5 flex items-center justify-between gap-3">
                  <p className="text-sm text-foreground">{user?.name} — RM {w.amount.toFixed(2)}</p>
                  <StatusBadge status={w.status} />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
