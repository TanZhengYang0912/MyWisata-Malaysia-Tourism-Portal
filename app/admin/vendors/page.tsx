"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth";
import { getOutlets, setOutletVerified } from "@/backend/domains/catalogue";
import { recordApproval } from "@/backend/core/audit";
import { ApproveRejectBar } from "@/components/admin/approve-reject-bar";
import { EmptyState } from "@/components/shared/empty-state";
import type { Outlet } from "@/backend/core/types";

export default function AdminVendorsPage() {
  const { currentUser } = useAuth();
  const [outlets, setOutlets] = useState<Outlet[]>([]);

  useEffect(() => {
    setOutlets(getOutlets());
  }, []);

  function review(outlet: Outlet, approve: boolean) {
    if (!currentUser) return;
    setOutletVerified(outlet.id, approve);
    recordApproval({
      actorId: currentUser.id,
      action: approve ? "vendor.approve" : "vendor.reject",
      targetType: "outlet",
      targetId: outlet.id,
      notifyUserId: "u3",
      notifyText: `Your outlet "${outlet.name}" was ${approve ? "approved" : "rejected"} by ${currentUser.name}.`,
      before: { verified: outlet.verified },
      after: { verified: approve },
    });
    setOutlets((prev) => prev.map((o) => (o.id === outlet.id ? { ...o, verified: approve } : o)));
  }

  const pending = outlets.filter((o) => !o.verified);
  const reviewed = outlets.filter((o) => o.verified);

  return (
    <div className="p-6 sm:p-8">
      <h1 className="font-bold text-lg text-foreground mb-6">Vendor / Outlet Approvals</h1>

      <div className="rounded-2xl overflow-hidden bg-card mb-6" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
        <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white bg-primary">{pending.length}</div>
          <h2 className="font-bold text-foreground">Pending Approval</h2>
        </div>
        {pending.length === 0 ? (
          <EmptyState title="No pending vendor approvals" />
        ) : (
          <div className="divide-y divide-border">
            {pending.map((o) => (
              <div key={o.id} className="px-6 py-4 flex items-center gap-4 flex-wrap">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shrink-0 bg-primary">{o.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">{o.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{o.category} · {o.city}, {o.state}</p>
                </div>
                <ApproveRejectBar onApprove={() => review(o, true)} onReject={() => review(o, false)} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
        <div className="px-6 py-5 border-b border-border">
          <h2 className="font-bold text-foreground">Approved Outlets</h2>
        </div>
        <div className="divide-y divide-border">
          {reviewed.map((o) => (
            <div key={o.id} className="px-6 py-3.5 flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{o.name}</p>
              <span className="text-xs text-muted-foreground">{o.city}, {o.state}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
