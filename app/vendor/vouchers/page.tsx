"use client";

import { getVouchers } from "@/lib/db/repos/catalogue";

export default function VendorVouchersPage() {
  const vouchers = getVouchers();

  return (
    <div className="p-6 sm:p-8">
      <h1 className="font-bold text-lg text-foreground mb-6">Vouchers & Promotions</h1>
      <div className="rounded-2xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
        <table className="w-full">
          <thead>
            <tr className="bg-muted">
              {["Code", "Type", "Value", "Min Spend", "Usage", "Expires"].map((h) => (
                <th key={h} className="px-6 py-3.5 text-left text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {vouchers.map((v) => (
              <tr key={v.id}>
                <td className="px-6 py-4 font-semibold text-sm font-[family-name:var(--font-mono)] text-foreground">{v.code}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground capitalize">{v.type}</td>
                <td className="px-6 py-4 text-sm text-foreground">{v.type === "percent" ? `${v.value}%` : `RM ${v.value}`}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground">RM {v.minSpend}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground">{v.usageCount} / {v.usageCap}</td>
                <td className="px-6 py-4 text-sm text-muted-foreground">{v.expiresAt}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground mt-3">Vouchers apply platform-wide in this demo. Per-vendor voucher creation is a Member-2/catalogue extension point.</p>
    </div>
  );
}
