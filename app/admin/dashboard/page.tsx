"use client";

import { useEffect, useState } from "react";
import { AlertCircle, DollarSign, Gem, Package, Shield } from "lucide-react";
import { getOutlets } from "@/backend/domains/catalogue";
import { getUsers, getSupportTickets } from "@/backend/domains/identity";
import { getWithdrawals } from "@/backend/domains/commerce";
import { getVendorRecommendations } from "@/backend/domains/discovery";

export default function AdminDashboardPage() {
  const [counts, setCounts] = useState<{ vendors: number; kyc: number; withdrawals: number; recs: number; tickets: number } | null>(null);

  useEffect(() => {
    (async () => {
      const [outlets, users, withdrawals, recs, tickets] = await Promise.all([
        getOutlets(),
        getUsers(),
        getWithdrawals(),
        getVendorRecommendations(),
        getSupportTickets(),
      ]);
      setCounts({
        vendors: outlets.filter((o) => !o.verified).length,
        kyc: users.filter((u) => u.role === "customer" && u.verificationTier !== "kyc_verified").length,
        withdrawals: withdrawals.filter((w) => w.status === "pending").length,
        recs: recs.filter((r) => r.status === "pending").length,
        tickets: tickets.filter((t) => t.status === "open").length,
      });
    })();
  }, []);

  const metrics = counts
    ? [
        { label: "Vendor Approvals Pending", value: counts.vendors, icon: Package, urgent: counts.vendors > 0 },
        { label: "KYC Reviews Pending", value: counts.kyc, icon: Shield, urgent: false },
        { label: "Withdrawals to Review", value: counts.withdrawals, icon: DollarSign, urgent: counts.withdrawals > 0 },
        { label: "Recommendations Pending", value: counts.recs, icon: Gem, urgent: false },
        { label: "Open Support Tickets", value: counts.tickets, icon: AlertCircle, urgent: counts.tickets > 0 },
      ]
    : [];

  return (
    <div className="p-6 sm:p-8">
      <h1 className="font-bold text-lg text-foreground mb-1">Admin Overview</h1>
      <p className="text-xs text-muted-foreground mb-6">Platform governance queues at a glance (demo data).</p>

      {counts === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {metrics.map((m) => (
            <div key={m.label} className="rounded-2xl p-5 relative overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
              {m.urgent && <div className="absolute top-0 left-0 right-0 h-0.5 bg-destructive" />}
              <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 bg-primary/10 text-primary">
                <m.icon size={18} />
              </div>
              <p className="text-3xl font-bold text-foreground font-[family-name:var(--font-mono)]">{m.value}</p>
              <p className="text-xs mt-0.5 text-muted-foreground">{m.label}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
