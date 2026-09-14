"use client";

// P4 — vendor order settlement breakdown, shown on /vendor/wallet. Reporting
// only — reads GET /api/vendor/settlements (which reads order_settlements); the
// money movement is DB-owned (migration 20260911000000).

import { useEffect, useState } from "react";
import { Receipt } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatMYRFromSen } from "@/lib/i18n/format";
import type { VendorSettlements } from "@/lib/vendor/settlement";

export function VendorSettlementPanel() {
  const { t } = useTranslation("vendor");
  const [data, setData] = useState<VendorSettlements | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/vendor/settlements");
        const body = (await res.json()) as { data: VendorSettlements | null };
        setData(res.ok ? body.data ?? null : null);
      } catch {
        setData(null);
      }
    })();
  }, []);

  if (data === undefined || data === null) return null;
  if (data.settlements.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-secondary text-primary">
          <Receipt size={16} />
        </span>
        <div>
          <h2 className="text-sm font-bold text-foreground">{t("ui.settlement.title")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("ui.settlement.description")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-3">
        <div>
          <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">{t("ui.settlement.pending")}</p>
          <p className="mt-1 text-lg font-bold text-foreground font-[family-name:var(--font-mono)]">{formatMYRFromSen(data.totals.pendingSen)}</p>
        </div>
        <div>
          <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">{t("ui.settlement.cleared")}</p>
          <p className="mt-1 text-lg font-bold text-foreground font-[family-name:var(--font-mono)]">{formatMYRFromSen(data.totals.clearedSen)}</p>
        </div>
        <div>
          <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">{t("ui.settlement.lifetimeFees")}</p>
          <p className="mt-1 text-lg font-bold text-foreground font-[family-name:var(--font-mono)]">{formatMYRFromSen(data.totals.lifetimePlatformFeesSen)}</p>
        </div>
      </div>

      <div className="overflow-x-auto border-t border-border">
        <table className="w-full min-w-[560px] text-left">
          <thead className="bg-muted/50 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            <tr>
              <th className="px-5 py-3">{t("ui.settlement.orderColumn")}</th>
              <th className="px-5 py-3 text-right">{t("ui.settlement.grossColumn")}</th>
              <th className="px-5 py-3 text-right">{t("ui.settlement.feeColumn")}</th>
              <th className="px-5 py-3 text-right">{t("ui.settlement.netColumn")}</th>
              <th className="px-5 py-3">{t("ui.settlement.statusColumn")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {data.settlements.map((s) => {
              const statusLine =
                s.status === "confirmed"
                  ? t("ui.settlement.statusCleared")
                  : s.status === "reversed"
                    ? t("ui.settlement.statusReversed")
                    : s.clearsInDays === 0
                      ? t("ui.settlement.clearsToday")
                      : t("ui.settlement.clearsInDays", { count: s.clearsInDays ?? 0 });
              return (
                <tr key={s.id} className={s.status === "reversed" ? "text-muted-foreground" : ""}>
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">
                    {s.orderDisplayId ?? s.orderId.slice(0, 8)}
                    <span className="ml-2 text-[0.625rem]">{(s.platformRate * 100).toFixed(0)}%</span>
                  </td>
                  <td className="px-5 py-3 text-right font-[family-name:var(--font-mono)] text-sm">{formatMYRFromSen(s.grossSen)}</td>
                  <td className="px-5 py-3 text-right font-[family-name:var(--font-mono)] text-sm text-muted-foreground">−{formatMYRFromSen(s.platformFeeSen)}</td>
                  <td className={`px-5 py-3 text-right font-bold font-[family-name:var(--font-mono)] text-sm ${s.status === "reversed" ? "line-through" : "text-foreground"}`}>{formatMYRFromSen(s.vendorNetSen)}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{statusLine}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
