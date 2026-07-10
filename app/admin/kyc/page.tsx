"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { getUsers, setVerificationTier } from "@/lib/db/repos/identity";
import { recordApproval } from "@/lib/audit";
import { ApproveRejectBar } from "@/components/admin/approve-reject-bar";
import { EmptyState } from "@/components/shared/empty-state";
import type { User } from "@/lib/types";

const TIER_LABEL: Record<User["verificationTier"], string> = {
  guest: "Guest",
  registered: "Registered",
  phone_verified: "Phone Verified",
  profile_complete: "Profile Complete",
  kyc_verified: "KYC Verified",
};

export default function AdminKycPage() {
  const { currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    setUsers(getUsers().filter((u) => u.role === "customer"));
  }, []);

  function review(user: User, approve: boolean) {
    if (!currentUser) return;
    const nextTier = approve ? "kyc_verified" : user.verificationTier;
    setVerificationTier(user.id, nextTier);
    recordApproval({
      actorId: currentUser.id,
      action: approve ? "kyc.approve" : "kyc.reject",
      targetType: "user",
      targetId: user.id,
      notifyUserId: user.id,
      notifyText: approve ? "Your KYC verification was approved!" : "Your KYC submission needs re-upload — please try again.",
      before: { verificationTier: user.verificationTier },
      after: { verificationTier: nextTier },
    });
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, verificationTier: nextTier } : u)));
  }

  const pending = users.filter((u) => u.verificationTier !== "kyc_verified");
  const verified = users.filter((u) => u.verificationTier === "kyc_verified");

  return (
    <div className="p-6 sm:p-8">
      <h1 className="font-bold text-lg text-foreground mb-1">KYC Review</h1>
      <p className="text-xs text-muted-foreground mb-6">Mock document metadata + manual review — no real ID data stored.</p>

      <div className="rounded-2xl overflow-hidden bg-card mb-6" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
        <div className="px-6 py-5 border-b border-border">
          <h2 className="font-bold text-foreground">Pending Review ({pending.length})</h2>
        </div>
        {pending.length === 0 ? (
          <EmptyState title="No pending KYC submissions" />
        ) : (
          <div className="divide-y divide-border">
            {pending.map((u) => (
              <div key={u.id} className="px-6 py-4 flex items-center gap-4 flex-wrap">
                <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm text-white shrink-0 bg-teal">{u.avatarInitial}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground">{u.name}</p>
                  <p className="text-xs text-muted-foreground">Current tier: {TIER_LABEL[u.verificationTier]}</p>
                </div>
                <ApproveRejectBar onApprove={() => review(u, true)} onReject={() => review(u, false)} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
        <div className="px-6 py-5 border-b border-border">
          <h2 className="font-bold text-foreground">KYC Verified</h2>
        </div>
        <div className="divide-y divide-border">
          {verified.map((u) => (
            <div key={u.id} className="px-6 py-3.5 flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{u.name}</p>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-primary/15 text-primary">Verified</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
