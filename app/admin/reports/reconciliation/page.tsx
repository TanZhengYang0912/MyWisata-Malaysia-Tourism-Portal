"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Download, RefreshCw, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { formatMYRFromSen } from "@/lib/i18n/format";
import { csvRow } from "@/lib/admin/csv";
import { adminFilterControlClassName } from "@/components/admin/filter-bar";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import type { OrderReconciliation } from "@/lib/admin/reconciliation";

function currentMonth() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${p.find((x) => x.type === "year")?.value}-${p.find((x) => x.type === "month")?.value}`;
}

export default function ReconciliationPage() {
  const { t, i18n } = useTranslation("admin");
  const locale = i18n.language === "zh-CN" ? "zh-CN" : i18n.language === "ms" ? "ms-MY" : "en-MY";
  const [period, setPeriod] = useState(currentMonth);
  const [data, setData] = useState<OrderReconciliation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/reconciliation?period=${period}`, { cache: "no-store" });
      const body = (await res.json()) as { data?: OrderReconciliation; error?: { message?: string } };
      if (!res.ok || !body.data) throw new Error(body.error?.message ?? t("reconciliation.errors.load"));
      setData(body.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("reconciliation.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [period, t]);

  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);

  function downloadCsv() {
    if (!data) return;
    const header = ["order", "status", "paid_at", "gross_rm", "platform_fee_rm", "vendor_net_rm", "affiliate_rm", "recommendation_rm", "platform_net_rm"];
    const lines = data.rows.map((r) => csvRow([
      r.orderDisplayId ?? r.orderId, r.status, r.paidAt ?? "",
      (r.grossSen / 100).toFixed(2), (r.platformFeeSen / 100).toFixed(2), (r.vendorNetSen / 100).toFixed(2),
      (r.affiliatePayoutSen / 100).toFixed(2), (r.recommendationPayoutSen / 100).toFixed(2), (r.platformNetSen / 100).toFixed(2),
    ]));
    const blob = new Blob([[csvRow(header), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reconciliation-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const metrics: [string, number][] = data ? [
    [t("reconciliation.metrics.gross"), data.totals.grossSen],
    [t("reconciliation.metrics.platformFee"), data.totals.platformFeeSen],
    [t("reconciliation.metrics.vendorNet"), data.totals.vendorNetSen],
    [t("reconciliation.metrics.affiliate"), data.totals.affiliatePayoutSen],
    [t("reconciliation.metrics.recommendation"), data.totals.recommendationPayoutSen],
    [t("reconciliation.metrics.platformNet"), data.totals.platformNetSen],
  ] : [];

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={<span className="flex items-center gap-2"><Scale size={14} /> {t("reconciliation.eyebrow")}</span>}
        title={t("reconciliation.title")}
        description={t("reconciliation.description")}
      />

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-foreground">{t("reconciliation.month")}</span>
            <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={adminFilterControlClassName} />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => void load()} disabled={loading || !period}><RefreshCw size={15} /> {loading ? t("reconciliation.loading") : t("reconciliation.reload")}</Button>
            {data && data.rows.length > 0 && <Button variant="outline" onClick={downloadCsv}><Download size={15} /> {t("reconciliation.exportCsv")}</Button>}
          </div>
        </div>
      </section>

      {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      {data && (
        <section className="mt-5 space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {metrics.map(([label, sen]) => (
              <div key={label} className="rounded-2xl border border-border bg-card p-5">
                <p className="text-sm font-semibold text-muted-foreground">{label}</p>
                <p className={`mt-3 text-2xl font-bold tracking-[-0.04em] font-[family-name:var(--font-mono)] ${sen < 0 ? "text-destructive" : "text-foreground"}`}>{formatMYRFromSen(sen)}</p>
              </div>
            ))}
          </div>

          {data.totals.negativeOrders > 0 && (
            <p className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <AlertTriangle size={16} className="shrink-0" />
              {t("reconciliation.negativeWarning", { count: data.totals.negativeOrders })}
            </p>
          )}

          <div className="rounded-2xl border border-border bg-card p-5">
            {data.rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{t("reconciliation.noOrders")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-3 pr-3">{t("reconciliation.columns.order")}</th>
                      <th className="py-3 pr-3">{t("reconciliation.columns.status")}</th>
                      <th className="py-3 pr-3 text-right">{t("reconciliation.columns.gross")}</th>
                      <th className="py-3 pr-3 text-right">{t("reconciliation.columns.fee")}</th>
                      <th className="py-3 pr-3 text-right">{t("reconciliation.columns.vendorNet")}</th>
                      <th className="py-3 pr-3 text-right">{t("reconciliation.columns.affiliate")}</th>
                      <th className="py-3 pr-3 text-right">{t("reconciliation.columns.recommendation")}</th>
                      <th className="py-3 text-right">{t("reconciliation.columns.platformNet")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {data.rows.map((r) => (
                      <tr key={r.orderId} className={r.platformNetNegative ? "bg-amber-50/60" : ""}>
                        <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">{r.orderDisplayId ?? r.orderId.slice(0, 8)}</td>
                        <td className="py-3 pr-3 text-xs text-muted-foreground">
                          {r.paidAt ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(new Date(r.paidAt)) : "—"} · {r.status}
                        </td>
                        <td className="py-3 pr-3 text-right font-mono">{formatMYRFromSen(r.grossSen)}</td>
                        <td className="py-3 pr-3 text-right font-mono text-muted-foreground">{formatMYRFromSen(r.platformFeeSen)}</td>
                        <td className="py-3 pr-3 text-right font-mono">{formatMYRFromSen(r.vendorNetSen)}</td>
                        <td className="py-3 pr-3 text-right font-mono text-muted-foreground">{r.affiliatePayoutSen ? `−${formatMYRFromSen(r.affiliatePayoutSen)}` : "—"}</td>
                        <td className="py-3 pr-3 text-right font-mono text-muted-foreground">{r.recommendationPayoutSen ? `−${formatMYRFromSen(r.recommendationPayoutSen)}` : "—"}</td>
                        <td className={`py-3 text-right font-mono font-bold ${r.platformNetNegative ? "text-destructive" : "text-foreground"}`}>{formatMYRFromSen(r.platformNetSen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </AdminPageShell>
  );
}
