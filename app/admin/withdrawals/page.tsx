"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth";
import { getWithdrawals, reviewWithdrawal } from "@/backend/domains/commerce";
import { getUser } from "@/backend/domains/identity";
import { recordApproval } from "@/backend/core/audit";
import { ApproveRejectBar } from "@/components/admin/approve-reject-bar";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import type { WithdrawalRequest } from "@/backend/core/types";

export default function AdminWithdrawalsPage() {
  const { currentUser } = useAuth();
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);

  useEffect(() => {
    setWithdrawals(getWithdrawals());
  }, []);

  function review(w: WithdrawalRequest, approve: boolean) {
    if (!currentUser) return;
    const status = approve ? "approved" : "rejected";
    reviewWithdrawal(w.id, status);
    recordApproval({
      actorId: currentUser.id,
      action: approve ? "withdrawal.approve" : "withdrawal.reject",
      targetType: "withdrawal",
      targetId: w.id,
      notifyUserId: w.userId,
      notifyText: `Your withdrawal request of RM ${w.amount.toFixed(2)} was ${status}.`,
      before: { status: w.status },
      after: { status },
    });
    setWithdrawals((prev) => prev.map((x) => (x.id === w.id ? { ...x, status } : x)));
  }

  const pending = withdrawals.filter((w) => w.status === "pending");
  const reviewed = withdrawals.filter((w) => w.status !== "pending");

  return (
    <div className="p-6 sm:p-8">
      <h1 className="font-bold text-lg text-foreground mb-1">Withdrawal Approvals</h1>
      <p className="text-xs text-muted-foreground mb-6">Demo payouts — no real bank/e-wallet transfer occurs.</p>

      <div className="rounded-2xl overflow-hidden bg-card mb-6" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
        <div className="px-6 py-5 border-b border-border">
          <h2 className="font-bold text-foreground">Pending ({pending.length})</h2>
        </div>
        {pending.length === 0 ? (
          <EmptyState title="No pending withdrawals" />
        ) : (
          <div className="divide-y divide-border">
            {pending.map((w) => {
              const user = getUser(w.userId);
              return (
                <div key={w.id} className="px-6 py-4 flex items-center gap-4 flex-wrap">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 bg-teal">{user?.avatarInitial ?? "?"}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{user?.name}</p>
                      {w.requiresDualApproval && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-accent/25 text-[#B08020]">Dual Approval</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">{w.destination}</p>
                  </div>
                  <p className="font-bold text-foreground font-[family-name:var(--font-mono)] shrink-0">RM {w.amount.toFixed(2)}</p>
                  <ApproveRejectBar onApprove={() => review(w, true)} onReject={() => review(w, false)} />
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
          {reviewed.map((w) => {
            const user = getUser(w.userId);
            return (
              <div key={w.id} className="px-6 py-3.5 flex items-center justify-between gap-3">
                <p className="text-sm text-foreground">{user?.name} — RM {w.amount.toFixed(2)}</p>
                <StatusBadge status={w.status} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
