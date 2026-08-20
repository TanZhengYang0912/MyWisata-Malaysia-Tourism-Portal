"use client";

// P4 — Member 4: admin affiliate oversight. See CLAUDE.md Step 9.

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, RefreshCw, Share2, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { AffiliateFunnelSection } from "@/components/shared/affiliate-funnel";
import { AffiliateInsightCard } from "@/components/shared/affiliate-insight-card";
import { FraudTrendChart } from "@/components/shared/fraud-trend-chart";
import { FraudTypeBarChart, FraudSeverityDonut } from "@/components/shared/fraud-breakdown-charts";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { AdminBatchActionBar } from "@/components/admin/batch-action-bar";
import type { Funnel } from "@/lib/affiliate/funnel";
import type { FraudAnalytics, FraudAnalyticsRange } from "@/lib/affiliate/fraud-analytics";
import { useTranslation } from "react-i18next";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";

interface AdminTier {
  id: string;
  tierName: string;
  rate: number; // 0..1 fraction
  minReferrals: number;
}

interface AdminAffiliateStats {
  totals: {
    totalAffiliates: number;
    totalClicks: number;
    totalReferrals: number;
    totalCommission: number;
  };
  tiers: AdminTier[];
  topEarners: { userId: string; userName: string; referrals: number; commission: number; tierName: string }[];
  attributions: {
    id: string;
    userId: string;
    userName: string;
    productId: string | null;
    productName: string | null;
    orderId: string;
    commissionAmount: number;
    status: string;
    createdAt: string;
  }[];
  funnel: Funnel;
}

interface FraudFlag {
  id: string;
  linkId: string | null;
  userId: string | null;
  userName: string;
  affiliateCode: string | null;
  orderId: string | null;
  flagType: string;
  severity: "low" | "medium" | "high";
  detail: Record<string, unknown> | null;
  status: "open" | "reviewed" | "dismissed";
  createdAt: string;
  reviewedAt: string | null;
}

interface FraudCounters {
  selfReferralsBlocked: number;
  duplicatePayoutsPrevented: number;
  openFlags: number;
  linksDisabled: number;
}

interface DisabledLink {
  linkId: string;
  userId: string;
  userName: string;
  affiliateCode: string;
}

type SortKey = "createdAt" | "userName" | "productName" | "status";

const FLAG_TYPE_LABEL: Record<string, string> = {
  self_referral: "Self-referral",
  duplicate_attribution: "Duplicate payout attempt",
  expired_attribution: "Expired attribution window",
  click_velocity: "Click velocity spike",
  visitor_clustering: "Clicks clustered on one visitor",
  zero_conversion: "Many clicks, zero referrals",
  click_cap_reached: "Limited-tier monthly click cap reached",
  vendor_ineligible: "Vendor/outlet manager ineligible for commission",
  link_disabled_at_payout: "Payout blocked — link was disabled before order paid",
};

const SEVERITY_STYLE: Record<string, string> = {
  high: "bg-destructive/10 text-destructive",
  medium: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  low: "bg-muted text-muted-foreground",
};

// Avoids floating-point noise like "7.000000000000001" from 0.07 * 100.
function formatRatePercent(rate: number): string {
  return Number((rate * 100).toFixed(2)).toString();
}

export default function AdminAffiliatePage() {
  const { t, i18n } = useTranslation("admin");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const { showFeedback } = useActionFeedback();
  const [stats, setStats] = useState<AdminAffiliateStats | null | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [clearing, setClearing] = useState(false);
  const [clearingResult, setClearingResult] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [tierDrafts, setTierDrafts] = useState<Record<string, { ratePercent: string; minReferrals: string }>>({});
  const [savingTierId, setSavingTierId] = useState<string | null>(null);
  const [tierError, setTierError] = useState<string | null>(null);

  const [fraudFlags, setFraudFlags] = useState<FraudFlag[] | null | undefined>(undefined);
  const [fraudCounters, setFraudCounters] = useState<FraudCounters | null>(null);
  const [disabledLinks, setDisabledLinks] = useState<DisabledLink[]>([]);
  const [fraudTypeFilter, setFraudTypeFilter] = useState("all");
  const [fraudSeverityFilter, setFraudSeverityFilter] = useState("all");
  const [fraudStatusFilter, setFraudStatusFilter] = useState("open");
  const [sweeping, setSweeping] = useState(false);
  const [sweepResult, setSweepResult] = useState<string | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [reviewingFlagId, setReviewingFlagId] = useState<string | null>(null);
  const [selectedFlagIds, setSelectedFlagIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);
  const [reactivatingLinkId, setReactivatingLinkId] = useState<string | null>(null);

  // CLAUDE-P4-EXTRAS.md Extra 2: trends/breakdown/top-offenders, separate
  // from the raw flag list above (fraudFlags/fraudCounters) — this is
  // read-only aggregation over the same table, range-scoped.
  const [fraudAnalytics, setFraudAnalytics] = useState<FraudAnalytics | null | undefined>(undefined);
  const [fraudRange, setFraudRange] = useState<FraudAnalyticsRange>("30d");

  async function loadStats() {
    try {
      const res = await fetch("/api/admin/affiliate/stats");
      const body = (await res.json()) as { data: AdminAffiliateStats | null };
      const data = res.ok && body.data ? body.data : null;
      setStats(data);
      if (data) {
        setTierDrafts(
          Object.fromEntries(
            data.tiers.map((t) => [t.id, { ratePercent: formatRatePercent(t.rate), minReferrals: String(t.minReferrals) }]),
          ),
        );
      }
    } catch {
      setStats(null);
    }
  }

  async function saveTier(tier: AdminTier) {
    if (!tier.id) return; // sentinel fallback tier — nothing to PATCH
    const draft = tierDrafts[tier.id];
    if (!draft) return;
    setSavingTierId(tier.id);
    setTierError(null);
    try {
      const res = await fetch(`/api/admin/affiliate/tiers/${tier.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ratePercent: Number(draft.ratePercent),
          minReferrals: Number(draft.minReferrals),
        }),
      });
      const body = (await res.json()) as { error: { message: string } | null };
      if (!res.ok) {
        setTierError(body.error?.message ?? t("affiliate.errors.saveTier", { defaultValue: "Failed to save tier." }));
        return;
      }
      showFeedback("success", t("affiliate.success.tierSaved", { defaultValue: "Affiliate tier saved." }));
      await loadStats();
    } catch {
      setTierError(t("affiliate.errors.saveTier", { defaultValue: "Failed to save tier." }));
      showFeedback("error", t("affiliate.errors.saveAffiliateTier", { defaultValue: "Failed to save affiliate tier." }));
    } finally {
      setSavingTierId(null);
    }
  }

  async function loadFraudFlags() {
    try {
      const res = await fetch("/api/admin/affiliate/fraud-flags");
      const body = (await res.json()) as {
        data: { flags: FraudFlag[]; counters: FraudCounters; disabledLinks: DisabledLink[] } | null;
      };
      if (res.ok && body.data) {
        setFraudFlags(body.data.flags);
        setFraudCounters(body.data.counters);
        setDisabledLinks(body.data.disabledLinks);
      } else {
        setFraudFlags(null);
      }
    } catch {
      setFraudFlags(null);
    }
  }

  async function loadFraudAnalytics(range: FraudAnalyticsRange) {
    try {
      const res = await fetch(`/api/admin/affiliate/fraud-analytics?range=${range}`);
      const body = (await res.json()) as { data: FraudAnalytics | null };
      setFraudAnalytics(res.ok && body.data ? body.data : null);
    } catch {
      setFraudAnalytics(null);
    }
  }

  async function reactivateLink(linkId: string) {
    if (reactivatingLinkId) return;
    setReactivatingLinkId(linkId);
    try {
      const response = await fetch(`/api/admin/affiliate/links/${linkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reactivate" }),
      });
      if (!response.ok) { const body = await response.json().catch(() => ({})); showFeedback("error", body?.error?.message ?? t("affiliate.errors.reactivateLink", { defaultValue: "Could not reactivate affiliate link." })); return; }
      showFeedback("success", t("affiliate.success.linkReactivated", { defaultValue: "Affiliate link reactivated." }));
      await loadFraudFlags();
    } catch {
      showFeedback("error", t("affiliate.errors.reactivateLinkRetry", { defaultValue: "Could not reactivate affiliate link. Please try again." }));
    } finally {
      setReactivatingLinkId(null);
    }
  }

  useEffect(() => {
    (async () => {
      await Promise.all([loadStats(), loadFraudFlags()]);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      await loadFraudAnalytics(fraudRange);
    })();
  }, [fraudRange]);

  // Same fetch-blob-download pattern as app/customer/affiliate/page.tsx's
  // downloadEarnings() (CSV, Extra 6) — file downloads can't go through the
  // usual fetch-JSON-then-setState path. Uses the currently-selected
  // fraudRange so the PDF's fraud breakdown matches what's on screen.
  async function exportPdf() {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const res = await fetch(`/api/admin/affiliate/report?range=${fraudRange}`);
      if (!res.ok) {
        showFeedback("error", t("affiliate.errors.exportRetry", { defaultValue: "Could not export the affiliate report. Please try again." }));
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "mywisata-affiliate-report.pdf";
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      showFeedback("error", t("affiliate.errors.exportRetry", { defaultValue: "Could not export the affiliate report. Please try again." }));
    } finally {
      setExportingPdf(false);
    }
  }

  async function runFraudSweepAction() {
    if (sweeping) return;
    setSweeping(true);
    setSweepResult(null);
    try {
      const res = await fetch("/api/admin/affiliate/fraud-sweep", { method: "POST" });
      const body = (await res.json()) as {
        data: { linksScanned: number; flagsCreated: unknown[] } | null;
        error: { message: string } | null;
      };
      if (res.ok && body.data) {
        setSweepResult(t("affiliate.sweep.result", { defaultValue: "Scanned {{links}} links, {{flags}} new flag(s)", links: body.data.linksScanned, flags: body.data.flagsCreated.length }));
        await Promise.all([loadFraudFlags(), loadFraudAnalytics(fraudRange)]);
      } else {
        setSweepResult(body.error?.message ?? t("affiliate.errors.fraudSweep", { defaultValue: "Fraud sweep failed." }));
      }
    } catch {
      setSweepResult(t("affiliate.errors.fraudSweep", { defaultValue: "Fraud sweep failed." }));
    } finally {
      setSweeping(false);
    }
  }

  async function reviewFlag(id: string, action: "dismiss" | "confirm") {
    if (reviewingFlagId) return;
    setReviewingFlagId(id);
    try {
      const response = await fetch(`/api/admin/affiliate/fraud-flags/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) { const body = await response.json().catch(() => ({})); showFeedback("error", body?.error?.message ?? t("affiliate.errors.reviewFlag", { defaultValue: "Could not review fraud flag." })); return; }
      showFeedback("success", action === "confirm" ? t("affiliate.success.flagConfirmed", { defaultValue: "Fraud flag confirmed." }) : t("affiliate.success.flagDismissed", { defaultValue: "Fraud flag dismissed." }));
      await Promise.all([loadFraudFlags(), loadStats(), loadFraudAnalytics(fraudRange)]);
    } catch {
      showFeedback("error", t("affiliate.errors.reviewFlagRetry", { defaultValue: "Could not review fraud flag. Please try again." }));
    } finally {
      setReviewingFlagId(null);
    }
  }

  async function applyFlagBatch(action: "dismiss" | "confirm") {
    if (batchBusy) return;
    const selected = filteredFraudFlags.filter((flag) => selectedFlagIds.has(flag.id) && flag.status === "open" && (action === "dismiss" || Boolean(flag.linkId)));
    if (!selected.length || selected.length !== selectedFlagIds.size) {
      showFeedback("error", action === "confirm" ? t("affiliate.errors.flagNeedsLink", { defaultValue: "Every selected open flag must have a link before disabling it." }) : t("affiliate.errors.selectOpenFlags", { defaultValue: "Select open fraud flags first." }));
      return;
    }
    setBatchBusy(true);
    try {
      const responses = await Promise.all(selected.map((flag) => fetch(`/api/admin/affiliate/fraud-flags/${flag.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })));
      const failed = responses.find((response) => !response.ok);
      if (failed) {
        const body = await failed.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? t("affiliate.errors.batchFlags", { defaultValue: "One or more fraud flags could not be updated." }));
      }
      setSelectedFlagIds(new Set());
      showFeedback("success", t("affiliate.success.batchFlags", { defaultValue: "{{count}} fraud flags processed.", count: selected.length }));
      await loadFraudFlags();
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : t("affiliate.errors.batchFlagUpdate", { defaultValue: "Batch fraud flag update failed." }));
    } finally {
      setBatchBusy(false);
    }
  }

  async function reviewAttribution(id: string, action: "accept" | "reject") {
    if (reviewingId) return;
    setReviewingId(id);
    try {
      const res = await fetch(`/api/admin/affiliate/attributions/${id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        showFeedback(
          "error",
          body.error?.message ??
            (action === "accept"
              ? t("affiliate.errors.accept", { defaultValue: "Could not accept this commission." })
              : t("affiliate.errors.reject", { defaultValue: "Could not reject this commission." })),
        );
        return;
      }
      showFeedback(
        "success",
        action === "accept"
          ? t("affiliate.success.accepted", { defaultValue: "Commission accepted." })
          : t("affiliate.success.rejected", { defaultValue: "Commission rejected." }),
      );
      await loadStats();
    } catch {
      showFeedback(
        "error",
        action === "accept"
          ? t("affiliate.errors.accept", { defaultValue: "Could not accept this commission." })
          : t("affiliate.errors.reject", { defaultValue: "Could not reject this commission." }),
      );
    } finally {
      setReviewingId(null);
    }
  }

  async function runClearing() {
    if (clearing) return;
    setClearing(true);
    setClearingResult(null);
    try {
      const res = await fetch("/api/admin/affiliate/run-clearing", { method: "POST" });
      const body = (await res.json()) as {
        data: { cleared: unknown[]; reversed: unknown[]; skipped: number; errors: unknown[] } | null;
        error: { message: string } | null;
      };
      if (res.ok && body.data) {
        setClearingResult(
          t("affiliate.clearing.result", { defaultValue: "Cleared {{cleared}}, reversed {{reversed}}, skipped {{skipped}}{{errors}}", cleared: body.data.cleared.length, reversed: body.data.reversed.length, skipped: body.data.skipped, errors: body.data.errors.length ? t("affiliate.clearing.errors", { defaultValue: ", {{count}} error(s)", count: body.data.errors.length }) : "" }),
        );
        await loadStats();
      } else {
        setClearingResult(body.error?.message ?? t("affiliate.errors.clearing", { defaultValue: "Clearing run failed." }));
      }
    } catch {
      setClearingResult(t("affiliate.errors.clearing", { defaultValue: "Clearing run failed." }));
    } finally {
      setClearing(false);
    }
  }

  const filteredAttributions = useMemo(() => {
    if (!stats) return [];
    let rows = stats.attributions;
    if (statusFilter !== "all") rows = rows.filter((r) => r.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => r.userName.toLowerCase().includes(q) || (r.productName ?? "").toLowerCase().includes(q));
    }
    return [...rows].sort((a, b) => {
      let diff = 0;
      if (sortKey === "createdAt") diff = a.createdAt < b.createdAt ? -1 : 1;
      else if (sortKey === "userName") diff = a.userName.localeCompare(b.userName);
      else if (sortKey === "productName") diff = (a.productName ?? "").localeCompare(b.productName ?? "");
      else diff = a.status.localeCompare(b.status);
      return sortDir === "asc" ? diff : -diff;
    });
  }, [stats, statusFilter, search, sortKey, sortDir]);

  const filteredFraudFlags = (fraudFlags ?? []).filter((flag) =>
    (fraudTypeFilter === "all" || flag.flagType === fraudTypeFilter)
    && (fraudSeverityFilter === "all" || flag.severity === fraudSeverityFilter)
    && (fraudStatusFilter === "all" || flag.status === fraudStatusFilter),
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  if (stats === undefined) {
    return <div className="p-8 text-sm text-muted-foreground">{t("affiliate.loading", { defaultValue: "Loading…" })}</div>;
  }
  if (stats === null) {
    return (
      <EmptyState
        title={t("affiliate.errors.loadTitle", { defaultValue: "Couldn't load affiliate stats" })}
        description={t("affiliate.errors.loadDescription", { defaultValue: "Something went wrong loading the affiliate overview. Try refreshing the page." })}
      />
    );
  }

  return (
    <div className="min-h-full bg-background px-4 py-6 sm:px-6 sm:py-8 xl:px-8">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.04em] text-foreground sm:text-4xl">{t("affiliate.title", { defaultValue: "Affiliate Oversight" })}</h1>
        <div className="text-right flex items-start gap-2">
          <div>
            <Button size="sm" variant="outline" onClick={exportPdf} disabled={exportingPdf}>
              <Download size={13} /> {exportingPdf ? t("affiliate.exporting", { defaultValue: "Exporting…" }) : t("affiliate.exportPdf", { defaultValue: "Export PDF" })}
            </Button>
          </div>
          <div>
            <Button size="sm" variant="outline" onClick={runClearing} disabled={clearing}>
              <RefreshCw size={13} className={clearing ? "animate-spin" : ""} /> {clearing ? t("affiliate.running", { defaultValue: "Running…" }) : t("affiliate.runClearing", { defaultValue: "Run clearing" })}
            </Button>
            {clearingResult && <p className="text-[0.6875rem] text-muted-foreground mt-1 max-w-[220px]">{clearingResult}</p>}
          </div>
          <div>
            <Button size="sm" variant="outline" onClick={runFraudSweepAction} disabled={sweeping}>
              <AlertTriangle size={13} className={sweeping ? "animate-pulse" : ""} /> {sweeping ? t("affiliate.scanning", { defaultValue: "Scanning…" }) : t("affiliate.runFraudSweep", { defaultValue: "Run fraud sweep" })}
            </Button>
            {sweepResult && <p className="text-[0.6875rem] text-muted-foreground mt-1 max-w-[220px]">{sweepResult}</p>}
          </div>
        </div>
      </div>
      <div className="rounded-xl bg-card p-4 mb-6" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">{t("affiliate.commissionTiers", { defaultValue: "Commission tiers" })}</p>
        <div className="space-y-2">
          {stats.tiers.map((tier) => {
            const draft = tierDrafts[tier.id] ?? { ratePercent: formatRatePercent(tier.rate), minReferrals: String(tier.minReferrals) };
            return (
              <div key={tier.id || tier.tierName} className="flex items-center gap-3 flex-wrap text-sm">
                <span className="w-16 capitalize text-foreground font-medium">{tier.tierName}</span>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  {t("affiliate.rate", { defaultValue: "Rate" })}
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={draft.ratePercent}
                    disabled={!tier.id}
                    onChange={(e) =>
                      setTierDrafts((d) => ({ ...d, [tier.id]: { ...draft, ratePercent: e.target.value } }))
                    }
                    className="h-7 w-16 rounded-lg border border-border px-2 text-xs bg-background text-foreground"
                  />
                  %
                </label>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  {t("affiliate.minReferrals", { defaultValue: "Min referrals" })}
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={draft.minReferrals}
                    disabled={!tier.id}
                    onChange={(e) =>
                      setTierDrafts((d) => ({ ...d, [tier.id]: { ...draft, minReferrals: e.target.value } }))
                    }
                    className="h-7 w-16 rounded-lg border border-border px-2 text-xs bg-background text-foreground"
                  />
                </label>
                <Button size="sm" variant="outline" disabled={!tier.id || savingTierId === tier.id} onClick={() => saveTier(tier)}>
                  {savingTierId === tier.id ? t("affiliate.saving", { defaultValue: "Saving…" }) : t("common.actions.save", { defaultValue: "Save" })}
                </Button>
              </div>
            );
          })}
        </div>
        {tierError && <p className="text-[0.6875rem] text-destructive mt-2">{tierError}</p>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: t("affiliate.metrics.affiliates", { defaultValue: "Affiliates" }), value: String(stats.totals.totalAffiliates) },
          { label: t("affiliate.metrics.clicks", { defaultValue: "Clicks" }), value: String(stats.totals.totalClicks) },
          { label: t("affiliate.metrics.referrals", { defaultValue: "Referrals" }), value: String(stats.totals.totalReferrals) },
          { label: t("affiliate.metrics.commission", { defaultValue: "Commission committed" }), value: `RM ${stats.totals.totalCommission.toFixed(2)}` },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-border bg-card p-5" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
            <p className="text-sm font-semibold text-muted-foreground">{card.label}</p>
            <p className="mt-4 text-3xl font-bold tracking-[-0.05em] text-foreground">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-1.5">
            <Share2 size={13} /> {t("affiliate.platformFunnel", { defaultValue: "Platform-wide funnel" })}
          </p>
          <AffiliateFunnelSection funnel={stats.funnel} conversionLabel={t("affiliate.conversions", { defaultValue: "Conversions" })} />
        </div>
        <AffiliateInsightCard scope="admin" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-1.5">
            <TrendingUp size={13} /> {t("affiliate.topEarners", { defaultValue: "Top earners" })}
          </p>
          {stats.topEarners.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("affiliate.noCommissions", { defaultValue: "No commissions earned yet." })}</p>
          ) : (
            <div className="space-y-2">
              {stats.topEarners.map((e, i) => (
                <div key={e.userId} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    {i + 1}. {e.userName} <span className="capitalize text-muted-foreground font-normal">({e.tierName})</span>
                  </span>
                  <span className="text-muted-foreground">
                    {t("affiliate.referralCount", { defaultValue: "{{count}} referrals", count: e.referrals })} · <span className="font-semibold text-foreground">RM {e.commission.toFixed(2)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <p className="text-xs font-bold uppercase tracking-wider text-destructive mb-3 flex items-center gap-1.5">
            <AlertTriangle size={13} /> {t("affiliate.fraudGuards", { defaultValue: "Fraud guards — proof they work" })}
          </p>
          {fraudCounters ? (
            <div className="space-y-1.5 text-sm">
              <p className="text-foreground">{t("affiliate.fraudCounters.selfReferralsBlocked", { count: fraudCounters.selfReferralsBlocked })}</p>
              <p className="text-foreground">{t("affiliate.fraudCounters.duplicatePayoutsPrevented", { count: fraudCounters.duplicatePayoutsPrevented })}</p>
              <p className="text-muted-foreground text-xs pt-1">{t("affiliate.fraudCounters.openFlagsSummary", { flags: fraudCounters.openFlags, links: fraudCounters.linksDisabled })}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("affiliate.loading", { defaultValue: "Loading…" })}</p>
          )}
        </div>

        <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">{t("affiliate.disabledLinks", { defaultValue: "Disabled links" })}</p>
          {disabledLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("affiliate.noDisabledLinks", { defaultValue: "No links are currently disabled." })}</p>
          ) : (
            <div className="space-y-2">
              {disabledLinks.map((l) => (
                <div key={l.linkId} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-foreground">
                    {l.userName} <span className="text-muted-foreground font-normal">({l.affiliateCode})</span>
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={reactivatingLinkId === l.linkId}
                    onClick={() => reactivateLink(l.linkId)}
                  >
                    {reactivatingLinkId === l.linkId ? t("affiliate.reEnabling", { defaultValue: "Re-enabling…" }) : t("affiliate.reEnable", { defaultValue: "Re-enable" })}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <p className="text-xs font-bold uppercase tracking-wider text-destructive flex items-center gap-1.5">
          <AlertTriangle size={13} /> {t("affiliate.fraudAnalytics", { defaultValue: "Fraud analytics" })}
        </p>
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {(["7d", "30d", "all"] as FraudAnalyticsRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setFraudRange(r)}
              className={`h-7 px-3 rounded-md text-xs font-medium transition-colors ${
                fraudRange === r ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r === "all" ? t("affiliate.allTime", { defaultValue: "All time" }) : r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {fraudAnalytics === undefined ? (
        <p className="text-sm text-muted-foreground mb-6">{t("affiliate.loadingFraudAnalytics", { defaultValue: "Loading fraud analytics…" })}</p>
      ) : fraudAnalytics === null ? (
        <p className="text-sm text-muted-foreground mb-6">{t("affiliate.errors.loadFraudAnalytics", { defaultValue: "Couldn’t load fraud analytics." })}</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            {[
              { label: t("affiliate.analytics.totalFlags", { defaultValue: "Total flags" }), value: String(fraudAnalytics.headline.totalFlags) },
              { label: t("affiliate.analytics.selfReferrals", { defaultValue: "Self-referrals blocked" }), value: String(fraudAnalytics.headline.selfReferralsBlocked) },
              { label: t("affiliate.analytics.duplicatePayouts", { defaultValue: "Duplicate payouts prevented" }), value: String(fraudAnalytics.headline.duplicatePayoutsPrevented) },
              { label: t("affiliate.analytics.disabledLinks", { defaultValue: "Links auto-disabled" }), value: String(fraudAnalytics.headline.linksAutoDisabled) },
              {
                label: t("affiliate.analytics.openVsReviewed", { defaultValue: "Open vs reviewed" }),
                value: fraudAnalytics.headline.totalFlags
                  ? t("affiliate.analytics.openPercentage", { percent: Math.round((fraudAnalytics.headline.openFlags / fraudAnalytics.headline.totalFlags) * 100) })
                  : "—",
              },
            ].map((card) => (
              <div key={card.label} className="rounded-2xl border border-border bg-card p-5" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
                <p className="text-sm font-semibold text-muted-foreground">{card.label}</p>
                <p className="mt-4 text-3xl font-bold tracking-[-0.05em] text-foreground">{card.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-card p-4 mb-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
            <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">{t("affiliate.analytics.flagsOverTime", { defaultValue: "Flags over time" })}</p>
            <FraudTrendChart data={fraudAnalytics.overTime} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
              <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">{t("affiliate.analytics.byType", { defaultValue: "By type" })}</p>
              <FraudTypeBarChart data={fraudAnalytics.byType} />
            </div>

            <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
              <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">{t("affiliate.analytics.bySeverity", { defaultValue: "By severity" })}</p>
              <FraudSeverityDonut data={fraudAnalytics.bySeverity} />
            </div>
          </div>

          <div className="rounded-xl bg-card p-4 mb-6" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
            <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">{t("affiliate.analytics.topFlagged", { defaultValue: "Top flagged affiliates" })}</p>
            {fraudAnalytics.topFlaggedAffiliates.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("affiliate.analytics.noFlags", { defaultValue: "No flags in this range." })}</p>
            ) : (
              <div className="space-y-2">
                {fraudAnalytics.topFlaggedAffiliates.map((a, i) => (
                  <div key={a.userId} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">
                      {i + 1}. {a.userName}
                      {a.affiliateCode && <span className="text-muted-foreground font-normal"> ({a.affiliateCode})</span>}
                    </span>
                    <span className="text-muted-foreground">
                      {t("affiliate.analytics.flagCount", { defaultValue: "{{count}} flags", count: a.flagCount })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">{t("affiliate.fraudFlags", { defaultValue: "Fraud flags" })}</p>
        <div className="flex items-center gap-2">
          <select
            value={fraudTypeFilter}
            onChange={(e) => setFraudTypeFilter(e.target.value)}
            className="h-8 rounded-lg border border-border px-2 text-xs bg-background text-foreground"
          >
            <option value="all">{t("affiliate.filters.allTypes", { defaultValue: "All types" })}</option>
            {Object.entries(FLAG_TYPE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {t(`affiliate.flagTypes.${key}`, { defaultValue: label })}
              </option>
            ))}
          </select>
          <select
            value={fraudSeverityFilter}
            onChange={(e) => setFraudSeverityFilter(e.target.value)}
            className="h-8 rounded-lg border border-border px-2 text-xs bg-background text-foreground"
          >
            <option value="all">{t("affiliate.filters.allSeverities", { defaultValue: "All severities" })}</option>
            <option value="high">{t("affiliate.severity.high", { defaultValue: "High" })}</option>
            <option value="medium">{t("affiliate.severity.medium", { defaultValue: "Medium" })}</option>
            <option value="low">{t("affiliate.severity.low", { defaultValue: "Low" })}</option>
          </select>
          <select
            value={fraudStatusFilter}
            onChange={(e) => setFraudStatusFilter(e.target.value)}
            className="h-8 rounded-lg border border-border px-2 text-xs bg-background text-foreground"
          >
            <option value="all">{t("affiliate.filters.allStatuses", { defaultValue: "All statuses" })}</option>
            <option value="open">{t("filters.open", { defaultValue: "Open" })}</option>
            <option value="reviewed">{t("affiliate.status.reviewed", { defaultValue: "Reviewed" })}</option>
            <option value="dismissed">{t("filters.dismissed", { defaultValue: "Dismissed" })}</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden bg-card mb-6" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-xs"><input type="checkbox" aria-label={t("affiliate.accessibility.selectAllFlags", { defaultValue: "Select all visible open fraud flags" })} checked={filteredFraudFlags.length > 0 && filteredFraudFlags.filter((flag) => flag.status === "open").every((flag) => selectedFlagIds.has(flag.id))} onChange={(event) => setSelectedFlagIds((previous) => { const next = new Set(previous); filteredFraudFlags.filter((flag) => flag.status === "open").forEach((flag) => event.target.checked ? next.add(flag.id) : next.delete(flag.id)); return next; })} /><span className="text-muted-foreground">{t("affiliate.selectAllOpen", { defaultValue: "Select all open flags" })}</span></div>
        <AdminBatchActionBar selectedCount={filteredFraudFlags.filter((flag) => selectedFlagIds.has(flag.id)).length} onClear={() => setSelectedFlagIds(new Set())} onApply={(action) => void applyFlagBatch(action as "dismiss" | "confirm")} actions={[{ value: "dismiss", label: t("batchActions.dismiss", { defaultValue: "Dismiss" }) }, { value: "confirm", label: t("batchActions.confirm", { defaultValue: "Confirm & disable" }) }]} busy={batchBusy} />
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">{t("affiliate.columns.select", { defaultValue: "Select" })}</th>
              <th className="text-left px-4 py-2.5 font-semibold">{t("affiliate.columns.affiliate", { defaultValue: "Affiliate" })}</th>
              <th className="text-left px-4 py-2.5 font-semibold">{t("affiliate.columns.type", { defaultValue: "Type" })}</th>
              <th className="text-left px-4 py-2.5 font-semibold">{t("affiliate.columns.severity", { defaultValue: "Severity" })}</th>
              <th className="text-left px-4 py-2.5 font-semibold">{t("affiliate.columns.evidence", { defaultValue: "Evidence" })}</th>
              <th className="text-left px-4 py-2.5 font-semibold">{t("affiliate.columns.when", { defaultValue: "When" })}</th>
              <th className="text-left px-4 py-2.5 font-semibold">{t("affiliate.columns.status", { defaultValue: "Status" })}</th>
              <th className="text-right px-4 py-2.5 font-semibold">{t("affiliate.columns.actions", { defaultValue: "Actions" })}</th>
            </tr>
          </thead>
          <tbody>
            {fraudFlags === undefined ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("affiliate.loading", { defaultValue: "Loading…" })}
                </td>
              </tr>
            ) : filteredFraudFlags.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("affiliate.noFlags", { defaultValue: "Nothing flagged." })}
                </td>
              </tr>
            ) : (
              filteredFraudFlags.map((f) => (
                <tr key={f.id} className="border-t border-border align-top">
                  <td className="px-4 py-2.5"><input type="checkbox" aria-label={t("affiliate.accessibility.selectFlag", { defaultValue: "Select fraud flag for {{name}}", name: f.userName })} disabled={f.status !== "open"} checked={selectedFlagIds.has(f.id)} onChange={(event) => setSelectedFlagIds((previous) => { const next = new Set(previous); event.target.checked ? next.add(f.id) : next.delete(f.id); return next; })} /></td>
                  <td className="px-4 py-2.5 text-foreground">
                    {f.userName}
                    {f.affiliateCode && <span className="text-muted-foreground"> ({f.affiliateCode})</span>}
                  </td>
                  <td className="px-4 py-2.5 text-foreground">{t(`affiliate.flagTypes.${f.flagType}`, { defaultValue: FLAG_TYPE_LABEL[f.flagType] ?? f.flagType })}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${SEVERITY_STYLE[f.severity] ?? ""}`}>
                      {t(`affiliate.severity.${f.severity}`, { defaultValue: f.severity })}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-[240px]">
                    {f.detail ? Object.entries(f.detail).map(([k, v]) => `${k}: ${v}`).join(" · ") : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{new Date(f.createdAt).toLocaleDateString(locale)}</td>
                  <td className="px-4 py-2.5 text-foreground capitalize">{t(`affiliate.status.${f.status}`, { defaultValue: f.status })}</td>
                  <td className="px-4 py-2.5 text-right">
                    {f.status === "open" && (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reviewingFlagId === f.id}
                          onClick={() => reviewFlag(f.id, "dismiss")}
                        >
                          {t("batchActions.dismiss", { defaultValue: "Dismiss" })}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reviewingFlagId === f.id || !f.linkId}
                          onClick={() => reviewFlag(f.id, "confirm")}
                        >
                          {t("batchActions.confirm", { defaultValue: "Confirm & disable" })}
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">{t("affiliate.allAttributions", { defaultValue: "All attributions" })}</p>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("affiliate.searchPlaceholder", { defaultValue: "Search user or activity…" })}
            className="h-8 rounded-lg border border-border px-3 text-xs bg-background text-foreground"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-lg border border-border px-2 text-xs bg-background text-foreground"
          >
            <option value="all">{t("affiliate.filters.allStatuses", { defaultValue: "All statuses" })}</option>
            <option value="pending">{t("affiliate.status.pending", { defaultValue: "Pending" })}</option>
            <option value="confirmed">{t("affiliate.status.confirmed", { defaultValue: "Confirmed" })}</option>
            <option value="reversed">{t("affiliate.status.reversed", { defaultValue: "Reversed" })}</option>
            <option value="rejected">{t("affiliate.status.rejected", { defaultValue: "Rejected" })}</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              {(
                [
                  ["userName", t("affiliate.columns.user", { defaultValue: "User" })],
                  ["productName", t("affiliate.columns.activity", { defaultValue: "Activity" })],
                  ["createdAt", t("affiliate.columns.date", { defaultValue: "Date" })],
                  ["status", t("affiliate.columns.status", { defaultValue: "Status" })],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th key={key} className="text-left px-4 py-2.5 font-semibold">
                  <button onClick={() => toggleSort(key)}>
                    {label}
                    {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
              <th className="text-right px-4 py-2.5 font-semibold">{t("affiliate.columns.commission", { defaultValue: "Commission" })}</th>
              <th className="text-right px-4 py-2.5 font-semibold">{t("affiliate.columns.review", { defaultValue: "Review" })}</th>
            </tr>
          </thead>
          <tbody>
            {filteredAttributions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("affiliate.noAttributions", { defaultValue: "No attributions match this filter." })}
                </td>
              </tr>
            ) : (
              filteredAttributions.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2.5 text-foreground">{r.userName}</td>
                  <td className="px-4 py-2.5 text-foreground">{r.productName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{new Date(r.createdAt).toLocaleDateString(locale)}</td>
                  <td className="px-4 py-2.5 text-foreground capitalize">{t(`affiliate.status.${r.status}`, { defaultValue: r.status })}</td>
                  <td className="px-4 py-2.5 text-right font-[family-name:var(--font-mono)] text-foreground">
                    RM {r.commissionAmount.toFixed(2)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {r.status === "pending" ? (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs"
                          disabled={reviewingId === r.id}
                          onClick={() => reviewAttribution(r.id, "accept")}
                        >
                          {t("affiliate.accept", { defaultValue: "Accept" })}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs text-destructive hover:text-destructive"
                          disabled={reviewingId === r.id}
                          onClick={() => reviewAttribution(r.id, "reject")}
                        >
                          {t("affiliate.reject", { defaultValue: "Reject" })}
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
