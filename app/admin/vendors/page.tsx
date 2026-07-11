"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/providers/auth";
import { getVendors, setVendorApproved } from "@/backend/domains/catalogue";
import { recordApproval } from "@/backend/core/audit";
import { ApproveRejectBar } from "@/components/admin/approve-reject-bar";
import { EmptyState } from "@/components/shared/empty-state";
import type { VendorSummary } from "@/backend/core/types";

export default function AdminVendorsPage() {
  const { currentUser } = useAuth();
  const [vendors, setVendors] = useState<VendorSummary[]>([]);

  useEffect(() => {
    getVendors().then(setVendors);
  }, []);

  async function review(vendor: VendorSummary, approve: boolean) {
    if (!currentUser) return;
    const status = approve ? "approved" : "rejected";
    await setVendorApproved(vendor.id, approve);
    await recordApproval({
      actorId: currentUser.id,
      action: approve ? "vendor.approve" : "vendor.reject",
      targetType: "vendor",
      targetId: vendor.id,
      notifyUserId: vendor.id,
      notifyText: `Your business "${vendor.name}" was ${status} by ${currentUser.name}.`,
      before: { status: vendor.status },
      after: { status },
    });
    setVendors((prev) => prev.map((v) => (v.id === vendor.id ? { ...v, status } : v)));
  }

  const pending = vendors.filter((v) => v.status !== "approved");
  const reviewed = vendors.filter((v) => v.status === "approved");

  return (
    <div className="p-6 sm:p-8">
      <h1 className="font-bold text-lg text-foreground mb-6">Vendor Approvals</h1>

      <div className="rounded-2xl overflow-hidden bg-card mb-6" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
        <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white bg-primary">{pending.length}</div>
          <h2 className="font-bold text-foreground">Pending Approval</h2>
        </div>
        {pending.length === 0 ? (
          <EmptyState title="No pending vendor approvals" />
        ) : (
          <div className="divide-y divide-border">
            {pending.map((v) => (
              <div key={v.id} className="px-6 py-4 flex items-center gap-4 flex-wrap">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white shrink-0 bg-primary">{v.name[0]}</div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground">{v.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {v.outlets.length} outlet{v.outlets.length !== 1 ? "s" : ""}: {v.outlets.map((o) => o.name).join(", ") || "none yet"}
                  </p>
                </div>
                <ApproveRejectBar onApprove={() => review(v, true)} onReject={() => review(v, false)} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
        <div className="px-6 py-5 border-b border-border">
          <h2 className="font-bold text-foreground">Approved Vendors</h2>
        </div>
        <div className="divide-y divide-border">
          {reviewed.map((v) => (
            <div key={v.id} className="px-6 py-3.5 flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{v.name}</p>
              <span className="text-xs text-muted-foreground">{v.outlets.length} outlet{v.outlets.length !== 1 ? "s" : ""}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
