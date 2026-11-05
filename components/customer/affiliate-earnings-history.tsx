"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { rangeCutoffIso, type EarningsExportRange } from "@/lib/affiliate/earnings-range";
import type { AffiliateCommission } from "@/lib/affiliate/stats";
import type { AffiliateEarningsPage } from "@/lib/affiliate/earnings-history";
import { formatMYR } from "@/lib/i18n/format";

/**
 * Affiliate earnings history with a period filter and CSV download. The period
 * filters the list and the download alike. With `limit` + `viewAllHref` it is the
 * dashboard's short version: the newest `limit` rows and a link to the full page.
 */
export function AffiliateEarningsHistory({
  commissions,
  returnPath,
  limit,
  viewAllHref,
}: {
  commissions: AffiliateCommission[];
  /** Where the capability gate sends the user back to after verifying. */
  returnPath: string;
  limit?: number;
  viewAllHref?: string;
}) {
  const { t: tCustomer } = useTranslation("customer");
  const gate = useCustomerCapabilityGate();
  const { showFeedback } = useActionFeedback();
  const [range, setRange] = useState<EarningsExportRange>("all");
  const [exporting, setExporting] = useState(false);
  const [historyPage, setHistoryPage] = useState<AffiliateEarningsPage | null>(null);
  const [historyUnavailable, setHistoryUnavailable] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [cursorHistory, setCursorHistory] = useState<Array<{ createdAt: string; id: string } | null>>([null]);
  const cursor = cursorHistory[cursorHistory.length - 1] ?? null;
  const snapshotCutoffRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ range, pageSize: "10" });
    if (snapshotCutoffRef.current) params.set("snapshotCutoff", snapshotCutoffRef.current);
    if (cursor) {
      params.set("beforeCreatedAt", cursor.createdAt);
      params.set("beforeId", cursor.id);
    }
    void fetch(`/api/affiliate/earnings-history?${params.toString()}`)
      .then(async (response) => {
        const body = await response.json() as { data?: AffiliateEarningsPage };
        if (!response.ok || !body.data) throw new Error("earnings_history_unavailable");
        if (active) {
          snapshotCutoffRef.current = body.data.snapshotCutoff;
          setHistoryPage(body.data);
        }
      })
      .catch(() => { if (active) setHistoryUnavailable(true); })
      .finally(() => { if (active) setHistoryLoading(false); });
    return () => { active = false; };
  }, [limit, range, cursor]);

  // `commissions` arrive newest first (lib/affiliate/stats.ts), so a slice is "the latest N".
  const cutoff = historyPage ? null : rangeCutoffIso(range);
  const sourceCommissions = historyPage?.commissions ?? commissions;
  const inRange = cutoff ? sourceCommissions.filter((c) => Date.parse(c.createdAt) >= Date.parse(cutoff)) : sourceCommissions;
  const shown = limit ? inRange.slice(0, limit) : inRange;

  async function downloadEarnings() {
    if (exporting) return;
    if (!gate("affiliate.earn_commission", returnPath)) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/affiliate/earnings-export?range=${range}`);
      if (await gate.handleResponse(res, returnPath)) return;
      if (!res.ok) {
        showFeedback("error", tCustomer("strictMigration.affiliate.earnings.exportFailed"));
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "mylawatan-affiliate-earnings.csv";
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      showFeedback("error", tCustomer("strictMigration.affiliate.earnings.exportFailed"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_8px_24px_rgba(1,0,102,0.06)]">
      <div className="px-4 py-2.5 bg-muted flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{tCustomer("strictMigration.affiliate.earningsHistory")}</p>
        {viewAllHref && (
          <Button asChild size="sm" variant="outline" className="h-7 text-[0.6875rem] px-2">
            <Link href={viewAllHref}>{tCustomer("strictMigration.affiliate.earnings.viewAll")}</Link>
          </Button>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <p className="text-[0.6875rem] text-muted-foreground">
          {limit && (historyPage?.totalCount ?? inRange.length) > limit ? tCustomer("strictMigration.affiliate.earnings.latest", { shown: limit, total: historyPage?.totalCount ?? inRange.length }) : null}
        </p>
        <div className="flex items-center gap-2">
          <select
            value={range}
            onChange={(e) => {
              setRange(e.target.value as EarningsExportRange);
              setHistoryLoading(true);
              setHistoryUnavailable(false);
              snapshotCutoffRef.current = null;
              setHistoryPage(null);
              setCursorHistory([null]);
            }}
            aria-label={tCustomer("strictMigration.affiliate.earnings.period")}
            className="h-7 rounded-lg border border-border px-2 text-[0.6875rem] bg-background text-foreground"
          >
            <option value="month">{tCustomer("strictMigration.affiliate.thisMonth")}</option>
            <option value="year">{tCustomer("strictMigration.affiliate.thisYear")}</option>
            <option value="all">{tCustomer("strictMigration.affiliate.allTime")}</option>
          </select>
          <Button size="sm" variant="outline" className="h-7 text-[0.6875rem] px-2" onClick={downloadEarnings} disabled={exporting}>
            <Download size={12} /> {exporting ? tCustomer("strictMigration.affiliate.earnings.exporting") : tCustomer("strictMigration.affiliate.earnings.download")}
          </Button>
        </div>
      </div>
      {!limit && historyPage && historyPage.totalCount > 0 && (
        <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
          <p className="text-[0.6875rem] text-muted-foreground">
            {tCustomer("ui.pagination.showing", {
              from: (cursorHistory.length - 1) * 10 + 1,
              to: Math.min(cursorHistory.length * 10, historyPage.totalCount),
              total: historyPage.totalCount,
              items: tCustomer("strictMigration.affiliate.earningsHistory"),
            })}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={cursorHistory.length <= 1 || historyLoading} onClick={() => { setHistoryLoading(true); setCursorHistory((history) => history.slice(0, -1)); }}>
              {tCustomer("ui.pagination.previousPage")}
            </Button>
            <Button size="sm" variant="outline" disabled={!historyPage.hasMore || !historyPage.nextCursor || historyLoading} onClick={() => { if (historyPage.nextCursor) { setHistoryLoading(true); setCursorHistory((history) => [...history, historyPage.nextCursor]); } }}>
              {tCustomer("ui.pagination.nextPage")}
            </Button>
          </div>
        </div>
      )}
      {shown.some((commission) => commission.status === "pending") ? (
        <p role="status" className="border-b border-border bg-muted/40 px-4 py-2.5 text-xs text-muted-foreground">
          {tCustomer("strictMigration.affiliate.earnings.pendingNotice")}
        </p>
      ) : null}
      <div className="divide-y divide-border">
        {!historyPage && !historyUnavailable ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{tCustomer("ui.loading")}</p>
        ) : historyUnavailable ? (
          <p role="alert" className="px-4 py-8 text-center text-sm text-muted-foreground">{tCustomer("strictMigration.affiliate.earnings.exportFailed")}</p>
        ) : shown.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            {(limit ? commissions : historyPage?.totalCount ? [1] : []).length === 0 ? tCustomer("strictMigration.affiliate.noCommissions") : tCustomer("strictMigration.affiliate.earnings.noneInRange")}
          </p>
        ) : (
          shown.map((c) => (
            <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words whitespace-normal text-sm font-medium text-foreground">{c.productName ?? tCustomer("strictMigration.affiliate.earnings.referral")}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(c.createdAt).toLocaleDateString()}
                  {c.orderAmount !== null && ` · ${tCustomer("strictMigration.affiliate.earnings.order", { amount: formatMYR(c.orderAmount) })}`} · {tCustomer("strictMigration.affiliate.rate", { percent: (c.rate * 100).toFixed(0) })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {c.status === "confirmed" && tCustomer("strictMigration.affiliate.earnings.cleared")}
                  {c.status === "pending" &&
                    (c.clearsInDays === 0 ? tCustomer("strictMigration.affiliate.earnings.pendingToday") : tCustomer("strictMigration.affiliate.earnings.pendingIn", { count: c.clearsInDays ?? 0 }))}
                  {c.status === "reversed" && tCustomer("strictMigration.affiliate.earnings.reversed")}
                  {c.status === "rejected" && tCustomer("strictMigration.affiliate.earnings.rejected")}
                </p>
              </div>
              <p
                className={`shrink-0 font-bold font-[family-name:var(--font-mono)] ${c.status === "reversed" || c.status === "rejected" ? "text-muted-foreground line-through" : "text-foreground"}`}
              >
                {formatMYR(c.amount)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
