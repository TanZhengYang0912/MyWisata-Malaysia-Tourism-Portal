"use client";

// P4 — Member 4: admin affiliate oversight. See CLAUDE.md Step 9.

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, RefreshCw, Share2, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { AffiliateFunnelSection } from "@/components/shared/affiliate-funnel";
import { AffiliateInsightCard } from "@/components/shared/affiliate-insight-card";
import { FraudTrendChart } from "@/components/shared/fraud-trend-chart";
import { FraudTypeBarChart, FraudSeverityDonut } from "@/components/shared/fraud-breakdown-charts";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/components/providers/action-feedback";
import type { Funnel } from "@/lib/affiliate/funnel";
import type { FraudAnalytics, FraudAnalyticsRange } from "@/lib/affiliate/fraud-analytics";

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
  const { showFeedback } = useActionFeedback();
  const [stats, setStats] = useState<AdminAffiliateStats | null | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [clearing, setClearing] = useState(false);
  const [clearingResult, setClearingResult] = useState<string | null>(null);
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
  const [reviewingFlagId, setReviewingFlagId] = useState<string | null>(null);
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
        setTierError(body.error?.message ?? "Failed to save tier.");
        return;
      }
      showFeedback("success", "Affiliate tier saved.");
      await loadStats();
    } catch {
      setTierError("Failed to save tier.");
      showFeedback("error", "Failed to save affiliate tier.");
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
      if (!response.ok) { const body = await response.json().catch(() => ({})); showFeedback("error", body?.error?.message ?? "Could not reactivate affiliate link."); return; }
      showFeedback("success", "Affiliate link reactivated.");
      await loadFraudFlags();
    } catch {
      showFeedback("error", "Could not reactivate affiliate link. Please try again.");
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
        setSweepResult(`Scanned ${body.data.linksScanned} links, ${body.data.flagsCreated.length} new flag(s)`);
        await Promise.all([loadFraudFlags(), loadFraudAnalytics(fraudRange)]);
      } else {
        setSweepResult(body.error?.message ?? "Fraud sweep failed.");
      }
    } catch {
      setSweepResult("Fraud sweep failed.");
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
      if (!response.ok) { const body = await response.json().catch(() => ({})); showFeedback("error", body?.error?.message ?? "Could not review fraud flag."); return; }
      showFeedback("success", action === "confirm" ? "Fraud flag confirmed." : "Fraud flag dismissed.");
      await Promise.all([loadFraudFlags(), loadStats(), loadFraudAnalytics(fraudRange)]);
    } catch {
      showFeedback("error", "Could not review fraud flag. Please try again.");
    } finally {
      setReviewingFlagId(null);
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
          `Cleared ${body.data.cleared.length}, reversed ${body.data.reversed.length}, skipped ${body.data.skipped}` +
            (body.data.errors.length ? `, ${body.data.errors.length} error(s)` : ""),
        );
        await loadStats();
      } else {
        setClearingResult(body.error?.message ?? "Clearing run failed.");
      }
    } catch {
      setClearingResult("Clearing run failed.");
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

  const filteredFraudFlags = useMemo(() => {
    if (!fraudFlags) return [];
    let rows = fraudFlags;
    if (fraudTypeFilter !== "all") rows = rows.filter((f) => f.flagType === fraudTypeFilter);
    if (fraudSeverityFilter !== "all") rows = rows.filter((f) => f.severity === fraudSeverityFilter);
    if (fraudStatusFilter !== "all") rows = rows.filter((f) => f.status === fraudStatusFilter);
    return rows;
  }, [fraudFlags, fraudTypeFilter, fraudSeverityFilter, fraudStatusFilter]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  if (stats === undefined) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (stats === null) {
    return (
      <EmptyState
        title="Couldn't load affiliate stats"
        description="Something went wrong loading the affiliate overview. Try refreshing the page."
      />
    );
  }

  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
        <h1 className="font-bold text-lg text-foreground">Affiliate Oversight</h1>
        <div className="text-right flex items-start gap-2">
          <div>
            <Button size="sm" variant="outline" onClick={runClearing} disabled={clearing}>
              <RefreshCw size={13} className={clearing ? "animate-spin" : ""} /> {clearing ? "Running…" : "Run clearing"}
            </Button>
            {clearingResult && <p className="text-[11px] text-muted-foreground mt-1 max-w-[220px]">{clearingResult}</p>}
          </div>
          <div>
            <Button size="sm" variant="outline" onClick={runFraudSweepAction} disabled={sweeping}>
              <AlertTriangle size={13} className={sweeping ? "animate-pulse" : ""} /> {sweeping ? "Scanning…" : "Run fraud sweep"}
            </Button>
            {sweepResult && <p className="text-[11px] text-muted-foreground mt-1 max-w-[220px]">{sweepResult}</p>}
          </div>
        </div>
      </div>
      <div className="rounded-xl bg-card p-4 mb-6" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">Commission tiers</p>
        <div className="space-y-2">
          {stats.tiers.map((tier) => {
            const draft = tierDrafts[tier.id] ?? { ratePercent: formatRatePercent(tier.rate), minReferrals: String(tier.minReferrals) };
            return (
              <div key={tier.id || tier.tierName} className="flex items-center gap-3 flex-wrap text-sm">
                <span className="w-16 capitalize text-foreground font-medium">{tier.tierName}</span>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  Rate
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
                  Min referrals
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
                  {savingTierId === tier.id ? "Saving…" : "Save"}
                </Button>
              </div>
            );
          })}
        </div>
        {tierError && <p className="text-[11px] text-destructive mt-2">{tierError}</p>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Affiliates", value: String(stats.totals.totalAffiliates) },
          { label: "Clicks", value: String(stats.totals.totalClicks) },
          { label: "Referrals", value: String(stats.totals.totalReferrals) },
          { label: "Commission committed", value: `RM ${stats.totals.totalCommission.toFixed(2)}` },
        ].map((card) => (
          <div key={card.label} className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{card.label}</p>
            <p className="text-xl font-bold text-foreground">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-1.5">
            <Share2 size={13} /> Platform-wide funnel
          </p>
          <AffiliateFunnelSection funnel={stats.funnel} conversionLabel="Conversions" />
        </div>
        <AffiliateInsightCard scope="admin" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-1.5">
            <TrendingUp size={13} /> Top earners
          </p>
          {stats.topEarners.length === 0 ? (
            <p className="text-sm text-muted-foreground">No commissions earned yet.</p>
          ) : (
            <div className="space-y-2">
              {stats.topEarners.map((e, i) => (
                <div key={e.userId} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    {i + 1}. {e.userName} <span className="capitalize text-muted-foreground font-normal">({e.tierName})</span>
                  </span>
                  <span className="text-muted-foreground">
                    {e.referrals} referrals · <span className="font-semibold text-foreground">RM {e.commission.toFixed(2)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <p className="text-xs font-bold uppercase tracking-wider text-destructive mb-3 flex items-center gap-1.5">
            <AlertTriangle size={13} /> Fraud guards — proof they work
          </p>
          {fraudCounters ? (
            <div className="space-y-1.5 text-sm">
              <p className="text-foreground">
                <span className="font-bold">{fraudCounters.selfReferralsBlocked}</span> self-referral
                {fraudCounters.selfReferralsBlocked === 1 ? "" : "s"} blocked
              </p>
              <p className="text-foreground">
                <span className="font-bold">{fraudCounters.duplicatePayoutsPrevented}</span> duplicate payout
                {fraudCounters.duplicatePayoutsPrevented === 1 ? "" : "s"} prevented
              </p>
              <p className="text-muted-foreground text-xs pt-1">
                {fraudCounters.openFlags} open flag{fraudCounters.openFlags === 1 ? "" : "s"} to review ·{" "}
                {fraudCounters.linksDisabled} link{fraudCounters.linksDisabled === 1 ? "" : "s"} currently disabled
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </div>

        <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">Disabled links</p>
          {disabledLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No links are currently disabled.</p>
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
                    {reactivatingLinkId === l.linkId ? "Re-enabling…" : "Re-enable"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <p className="text-xs font-bold uppercase tracking-wider text-destructive flex items-center gap-1.5">
          <AlertTriangle size={13} /> Fraud analytics
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
              {r === "all" ? "All time" : r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {fraudAnalytics === undefined ? (
        <p className="text-sm text-muted-foreground mb-6">Loading fraud analytics…</p>
      ) : fraudAnalytics === null ? (
        <p className="text-sm text-muted-foreground mb-6">Couldn&apos;t load fraud analytics.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
            {[
              { label: "Total flags", value: String(fraudAnalytics.headline.totalFlags) },
              { label: "Self-referrals blocked", value: String(fraudAnalytics.headline.selfReferralsBlocked) },
              { label: "Duplicate payouts prevented", value: String(fraudAnalytics.headline.duplicatePayoutsPrevented) },
              { label: "Links auto-disabled", value: String(fraudAnalytics.headline.linksAutoDisabled) },
              {
                label: "Open vs reviewed",
                value: fraudAnalytics.headline.totalFlags
                  ? `${Math.round((fraudAnalytics.headline.openFlags / fraudAnalytics.headline.totalFlags) * 100)}% open`
                  : "—",
              },
            ].map((card) => (
              <div key={card.label} className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{card.label}</p>
                <p className="text-xl font-bold text-foreground">{card.value}</p>
              </div>
            ))}
          </div>

          <div className="rounded-xl bg-card p-4 mb-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
            <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">Flags over time</p>
            <FraudTrendChart data={fraudAnalytics.overTime} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
              <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">By type</p>
              <FraudTypeBarChart data={fraudAnalytics.byType} />
            </div>

            <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
              <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">By severity</p>
              <FraudSeverityDonut data={fraudAnalytics.bySeverity} />
            </div>
          </div>

          <div className="rounded-xl bg-card p-4 mb-6" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
            <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">Top flagged affiliates</p>
            {fraudAnalytics.topFlaggedAffiliates.length === 0 ? (
              <p className="text-sm text-muted-foreground">No flags in this range.</p>
            ) : (
              <div className="space-y-2">
                {fraudAnalytics.topFlaggedAffiliates.map((a, i) => (
                  <div key={a.userId} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">
                      {i + 1}. {a.userName}
                      {a.affiliateCode && <span className="text-muted-foreground font-normal"> ({a.affiliateCode})</span>}
                    </span>
                    <span className="text-muted-foreground">
                      <span className="font-semibold text-foreground">{a.flagCount}</span> flag{a.flagCount === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Fraud flags</p>
        <div className="flex items-center gap-2">
          <select
            value={fraudTypeFilter}
            onChange={(e) => setFraudTypeFilter(e.target.value)}
            className="h-8 rounded-lg border border-border px-2 text-xs bg-background text-foreground"
          >
            <option value="all">All types</option>
            {Object.entries(FLAG_TYPE_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select
            value={fraudSeverityFilter}
            onChange={(e) => setFraudSeverityFilter(e.target.value)}
            className="h-8 rounded-lg border border-border px-2 text-xs bg-background text-foreground"
          >
            <option value="all">All severities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <select
            value={fraudStatusFilter}
            onChange={(e) => setFraudStatusFilter(e.target.value)}
            className="h-8 rounded-lg border border-border px-2 text-xs bg-background text-foreground"
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="reviewed">Reviewed</option>
            <option value="dismissed">Dismissed</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden bg-card mb-6" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">Affiliate</th>
              <th className="text-left px-4 py-2.5 font-semibold">Type</th>
              <th className="text-left px-4 py-2.5 font-semibold">Severity</th>
              <th className="text-left px-4 py-2.5 font-semibold">Evidence</th>
              <th className="text-left px-4 py-2.5 font-semibold">When</th>
              <th className="text-left px-4 py-2.5 font-semibold">Status</th>
              <th className="text-right px-4 py-2.5 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {fraudFlags === undefined ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Loading…
                </td>
              </tr>
            ) : filteredFraudFlags.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Nothing flagged.
                </td>
              </tr>
            ) : (
              filteredFraudFlags.map((f) => (
                <tr key={f.id} className="border-t border-border align-top">
                  <td className="px-4 py-2.5 text-foreground">
                    {f.userName}
                    {f.affiliateCode && <span className="text-muted-foreground"> ({f.affiliateCode})</span>}
                  </td>
                  <td className="px-4 py-2.5 text-foreground">{FLAG_TYPE_LABEL[f.flagType] ?? f.flagType}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${SEVERITY_STYLE[f.severity] ?? ""}`}>
                      {f.severity}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-[240px]">
                    {f.detail ? Object.entries(f.detail).map(([k, v]) => `${k}: ${v}`).join(" · ") : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{new Date(f.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5 text-foreground capitalize">{f.status}</td>
                  <td className="px-4 py-2.5 text-right">
                    {f.status === "open" && (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reviewingFlagId === f.id}
                          onClick={() => reviewFlag(f.id, "dismiss")}
                        >
                          Dismiss
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reviewingFlagId === f.id || !f.linkId}
                          onClick={() => reviewFlag(f.id, "confirm")}
                        >
                          Confirm & disable
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
        <p className="text-xs font-bold uppercase tracking-wider text-primary">All attributions</p>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user or activity…"
            className="h-8 rounded-lg border border-border px-3 text-xs bg-background text-foreground"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-lg border border-border px-2 text-xs bg-background text-foreground"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="reversed">Reversed</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              {(
                [
                  ["userName", "User"],
                  ["productName", "Activity"],
                  ["createdAt", "Date"],
                  ["status", "Status"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th key={key} className="text-left px-4 py-2.5 font-semibold">
                  <button onClick={() => toggleSort(key)}>
                    {label}
                    {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
              <th className="text-right px-4 py-2.5 font-semibold">Commission</th>
            </tr>
          </thead>
          <tbody>
            {filteredAttributions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No attributions match this filter.
                </td>
              </tr>
            ) : (
              filteredAttributions.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2.5 text-foreground">{r.userName}</td>
                  <td className="px-4 py-2.5 text-foreground">{r.productName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5 text-foreground capitalize">{r.status}</td>
                  <td className="px-4 py-2.5 text-right font-[family-name:var(--font-mono)] text-foreground">
                    RM {r.commissionAmount.toFixed(2)}
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
