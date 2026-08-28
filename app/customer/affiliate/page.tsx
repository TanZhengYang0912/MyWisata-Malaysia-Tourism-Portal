"use client";

import { useTranslation } from "react-i18next";
// P4 — Member 4: user affiliate dashboard. See CLAUDE.md Step 6, rebuilt per
// CLAUDE-FIXES.md Fix 3. Now reachable from the main customer nav
// (app/customer/layout.tsx's "Earn & Share" entry) — Fix 3a.

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Copy, Download, Gift, Link2, Megaphone, Share2, Wallet } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { isAffiliateEligible } from "@/lib/affiliate/verification";
import { sanitizeCampaign } from "@/lib/affiliate/campaign";
import { AffiliateClicksChart } from "@/components/customer/affiliate-clicks-chart";
import { AffiliateFunnelSection } from "@/components/shared/affiliate-funnel";
import { AffiliateInsightCard } from "@/components/shared/affiliate-insight-card";
import { AffiliateRankCard } from "@/components/shared/affiliate-rank-card";
import { AffiliateQrCode } from "@/components/shared/affiliate-qr-code";
import { CustomerPageShell, CustomerPageTitle } from "@/components/customer/customer-page-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/components/providers/action-feedback";
import type { AffiliateCampaignStat, AffiliateCommission, AffiliateDailyClicks, AffiliateProductStat } from "@/lib/affiliate/stats";
import type { Funnel } from "@/lib/affiliate/funnel";
import type { TierInfo } from "@/lib/affiliate/tier";
import type { EarningsExportRange } from "@/lib/affiliate/earnings-export";
import { MYR_CODE } from "@/lib/i18n/invariant-tokens";
import { guestLoginHref } from "@/lib/auth/guest-mode";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";

interface StatsResponse {
  affiliateCode: string | null;
  affiliateUrl: string | null;
  totals: { clicks: number; referrals: number; pendingEarnings: number; availableToWithdraw: number };
  byProduct: AffiliateProductStat[];
  byCampaign: AffiliateCampaignStat[];
  clicksByDay: AffiliateDailyClicks[];
  commissions: AffiliateCommission[];
  funnel: Funnel;
  tier: TierInfo;
}

type SortKey = "shares" | "clicks" | "referrals" | "earnings";

export default function AffiliateDashboardPage() {
  const { t: tCustomer } = useTranslation("customer");
  const { currentUser, loading: authLoading } = useAuth();
  const gate = useCustomerCapabilityGate();
  const { showFeedback } = useActionFeedback();
  const [stats, setStats] = useState<StatsResponse | null | undefined>(undefined); // undefined = loading
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("clicks");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // CLAUDE-CAMPAIGN-CLEARING-TRANSLATE.md Feature 1.
  const [campaignInput, setCampaignInput] = useState("");
  const [campaignCopied, setCampaignCopied] = useState(false);

  // CLAUDE-P4-EXTRAS-2.md Extra 6.
  const [exportRange, setExportRange] = useState<EarningsExportRange>("all");
  const [exporting, setExporting] = useState(false);

  async function downloadEarnings() {
    if (exporting) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/affiliate/earnings-export?range=${exportRange}`);
      if (!res.ok) {
        showFeedback("error", "Could not export earnings. Please try again.");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "mywisata-affiliate-earnings.csv";
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      showFeedback("error", "Could not export earnings. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  async function loadStats() {
    try {
      const res = await fetch("/api/affiliate/stats");
      if (!res.ok) {
        setStats(null);
        return;
      }
      const body = (await res.json()) as { data: StatsResponse | null };
      setStats(body.data);
    } catch {
      setStats(null);
    }
  }

  useEffect(() => {
    if (!currentUser) {
      setStats(null);
      return;
    }
    (async () => {
      await loadStats();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const sortedProducts = useMemo(() => {
    if (!stats) return [];
    return [...stats.byProduct].sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDir === "asc" ? diff : -diff;
    });
  }, [stats, sortKey, sortDir]);

  // Feature 1's "quick pick of recent campaigns" — campaigns this affiliate
  // has already used, tap to reuse the name instead of retyping it.
  const recentCampaigns = useMemo(
    () => (stats?.byCampaign ?? []).map((c) => c.campaign).filter((c): c is string => c !== null),
    [stats],
  );

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  async function generateLink() {
    if (generating) return;
    if (!gate(CUSTOMER_CAPABILITY.AFFILIATE_LIMITED, "/customer/affiliate")) return;
    setGenerating(true);
    try {
      const response = await fetch("/api/affiliate/link", { method: "POST" });
      await response.json().catch(() => ({}));
      if (!response.ok) { showFeedback("error", tCustomer("strictMigration.affiliate.createLinkFailed")); return; }
      showFeedback("success", tCustomer("strictMigration.affiliate.linkReady"));
    } catch {
      showFeedback("error", tCustomer("strictMigration.affiliate.createLinkFailed"));
    } finally {
      setGenerating(false);
      loadStats();
    }
  }

  async function copyLink() {
    if (!stats?.affiliateUrl) return;
    try {
      await navigator.clipboard.writeText(stats.affiliateUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // best-effort — nothing more to do if clipboard access is denied
    }
  }

  // CLAUDE-CAMPAIGN-CLEARING-TRANSLATE.md Feature 1: builds `?utm_campaign=`
  // onto the existing affiliate link and copies it — same URL the plain Copy
  // button produces, plus the tag. Sanitized client-side only for an honest
  // preview of what will be stored; lib/affiliate/redirect.ts re-sanitizes
  // server-side, which is the enforcement that actually matters.
  async function copyCampaignLink(label: string) {
    if (!stats?.affiliateUrl) return;
    const campaign = sanitizeCampaign(label);
    if (!campaign) return;
    const url = `${stats.affiliateUrl}?utm_campaign=${campaign}`;
    try {
      await navigator.clipboard.writeText(url);
      setCampaignCopied(true);
      setTimeout(() => setCampaignCopied(false), 2000);
    } catch {
      showFeedback("error", "Couldn't copy link");
    }
  }

  if (authLoading || stats === undefined) {
    return <CustomerPageShell><div className="py-8 text-sm text-muted-foreground">{tCustomer("ui.affiliate.loadingDashboard")}</div></CustomerPageShell>;
  }

  if (!currentUser) {
    return <>
      <CustomerPageTitle
        eyebrow={tCustomer("ui.recommendations.community")}
        title={tCustomer("accountItems.earnShare.label")}
        description={tCustomer("strictMigration.affiliate.description")}
        icon={<Gift size={14} />}
      />
      <CustomerPageShell>
        <EmptyState
          title={tCustomer("strictMigration.affiliate.signInRequired")}
          description={tCustomer("strictMigration.affiliate.signInDescription")}
          action={<div className="flex flex-wrap justify-center gap-3"><Button onClick={() => void generateLink()}>{tCustomer("strictMigration.affiliate.generateLink")}</Button><Button asChild variant="outline"><Link href={guestLoginHref("/customer/affiliate")}>{tCustomer("ui.guest.signIn")}</Link></Button></div>}
        />
      </CustomerPageShell>
    </>;
  }

  // Fix 3a: a real teaser with a path forward, not a dead-end EmptyState —
  // this is how the feature recruits affiliates in the first place.
  if (!isAffiliateEligible(currentUser)) {
    return (
      <>
        <CustomerPageTitle
          eyebrow={tCustomer("ui.recommendations.community")}
          title={tCustomer("accountItems.earnShare.label")}
          description={tCustomer("strictMigration.affiliate.eligibilityDescription")}
          icon={<Gift size={14} />}
        />
        <CustomerPageShell wide className="pt-0 sm:pt-0">
          <div className="mx-auto max-w-md py-4 text-center sm:py-8">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Gift size={24} className="text-primary" />
            </div>
            <p className="text-sm text-muted-foreground mb-6">{tCustomer("strictMigration.affiliate.verifyUnlock")}</p>
            <Button asChild>
              <Link href="/customer/kyc">{tCustomer("strictMigration.affiliate.verifyAccount")}</Link>
            </Button>
          </div>
        </CustomerPageShell>
      </>
    );
  }

  if (stats === null) {
    return (
      <CustomerPageShell><EmptyState
        title={tCustomer("ui.states.noStats")}
        description={tCustomer("strictMigration.affiliate.loadFailed")}
      /></CustomerPageShell>
    );
  }

  const nearestClearsInDays = stats.commissions
    .filter((c) => c.status === "pending" && c.clearsInDays !== null)
    .reduce((min, c) => Math.min(min, c.clearsInDays as number), Infinity);

  return (
    <>
      <CustomerPageTitle
        eyebrow={tCustomer("ui.recommendations.community")}
        title={tCustomer("accountItems.earnShare.label")}
        description={tCustomer("strictMigration.affiliate.description")}
        icon={<Gift size={14} />}
      />

      <CustomerPageShell wide className="pt-0 sm:pt-0">

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="flex min-h-[104px] flex-col rounded-2xl border border-border bg-card p-5 shadow-[0_8px_24px_rgba(1,0,102,0.06)]">
          <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground mb-1">{tCustomer("ui.affiliate.clicks")}</p>
          <p className="text-xl font-bold text-foreground font-[family-name:var(--font-mono)]">{stats.totals.clicks}</p>
        </div>
        <div className="flex min-h-[104px] flex-col rounded-2xl border border-border bg-card p-5 shadow-[0_8px_24px_rgba(1,0,102,0.06)]">
          <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground mb-1">{tCustomer("strictMigration.affiliate.peopleOrdered")}</p>
          <p className="text-xl font-bold text-foreground font-[family-name:var(--font-mono)]">{stats.totals.referrals}</p>
        </div>
        <div className="flex min-h-[104px] flex-col rounded-2xl border border-border bg-card p-5 shadow-[0_8px_24px_rgba(1,0,102,0.06)]">
          <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground mb-1">{tCustomer("ui.wallet.destinationStatus.pending")}</p>
          <p className="text-xl font-bold text-foreground font-[family-name:var(--font-mono)]">
            {MYR_CODE} {stats.totals.pendingEarnings.toFixed(2)}
          </p>
          {Number.isFinite(nearestClearsInDays) && (
            <p className="text-[0.625rem] text-muted-foreground mt-0.5">
              {tCustomer("strictMigration.affiliate.clearsIn", { count: nearestClearsInDays })}
            </p>
          )}
        </div>
        <div className="flex min-h-[104px] flex-col rounded-2xl border border-border bg-card p-5 shadow-[0_8px_24px_rgba(1,0,102,0.06)]">
          <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground mb-1">{tCustomer("ui.booking.available")}</p>
          <p className="text-xl font-bold text-foreground font-[family-name:var(--font-mono)] mb-1.5">
            {MYR_CODE} {stats.totals.availableToWithdraw.toFixed(2)}
          </p>
          {stats.totals.availableToWithdraw > 0 ? (
            <Button size="sm" asChild className="h-6 text-[0.6875rem] px-2">
              <Link href="/customer/wallet">
                <Wallet size={11} /> {tCustomer("strictMigration.affiliate.cashOut")}
              </Link>
            </Button>
          ) : (
            <p className="text-[0.625rem] text-muted-foreground">{tCustomer("strictMigration.affiliate.earnToWithdraw")}</p>
          )}
        </div>
      </div>

      <div className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-[0_8px_24px_rgba(1,0,102,0.06)] sm:p-6">
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-sm font-bold text-foreground capitalize">{stats.tier.tierName} · {(stats.tier.rate * 100).toFixed(0)}%</p>
        </div>
        <p className="text-xs text-muted-foreground mb-2">
          {tCustomer("strictMigration.affiliate.confirmedReferrals", { count: stats.tier.referralCount })}
          {stats.tier.nextTier
            ? tCustomer("strictMigration.affiliate.nextTier", { count: stats.tier.referralsToNext, tier: stats.tier.nextTier.tierName, percent: (stats.tier.nextTier.rate * 100).toFixed(0) })
            : tCustomer("strictMigration.affiliate.topTier")}
        </p>
        {stats.tier.nextTier && (
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-teal"
              style={{
                width: `${Math.min(
                  100,
                  (stats.tier.referralCount / (stats.tier.referralCount + (stats.tier.referralsToNext ?? 0) || 1)) * 100,
                )}%`,
              }}
            />
          </div>
        )}
      </div>

      <AffiliateRankCard />

      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-border bg-card p-5 shadow-[0_8px_24px_rgba(1,0,102,0.06)] sm:p-6">
        <div className="flex items-center gap-2 min-w-0">
          <Link2 size={16} className="text-teal shrink-0" />
          {stats.affiliateCode ? (
            <span className="text-sm font-semibold text-foreground font-[family-name:var(--font-mono)] truncate">
              {stats.affiliateUrl}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">{tCustomer("strictMigration.affiliate.noLink")}</span>
          )}
        </div>
        {stats.affiliateCode ? (
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" onClick={copyLink}>
              <Copy size={14} /> {copied ? tCustomer("strictMigration.affiliate.copied") : tCustomer("strictMigration.affiliate.copy")}
            </Button>
            {/* CLAUDE-P4-EXTRAS-2.md Extra 4: the generic "my code" QR — no
                slug, same URL the Copy button copies. Eligibility is already
                enforced by this page's own gate above (an ineligible user
                never reaches this section), unlike the per-product QR on
                ShareButton, which has to resolve eligibility itself. */}
            <AffiliateQrCode resolveUrl={() => stats.affiliateUrl!} label={tCustomer("strictMigration.affiliate.myLink")} />
          </div>
        ) : (
          <Button size="sm" onClick={generateLink} disabled={generating} className="shrink-0">
            {generating ? tCustomer("strictMigration.affiliate.generating") : tCustomer("strictMigration.affiliate.generateLink")}
          </Button>
        )}
      </div>

      {/* CLAUDE-CAMPAIGN-CLEARING-TRANSLATE.md Feature 1: campaign/UTM tagging.
          Only shown once the affiliate has a link to tag — matches the "My
          link" section's own gating just above. */}
      {stats.affiliateCode && (
        <div className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-[0_8px_24px_rgba(1,0,102,0.06)] sm:p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-1.5">
            <Megaphone size={13} /> {tCustomer("ui.affiliate.campaigns.title")}
          </p>
          <p className="text-xs text-muted-foreground mb-3">
            {tCustomer("ui.affiliate.campaigns.description")}
          </p>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <input
              type="text"
              value={campaignInput}
              onChange={(e) => setCampaignInput(e.target.value)}
              placeholder={tCustomer("ui.affiliate.campaigns.namePlaceholder")}
              maxLength={50}
              className="h-9 min-w-0 flex-1 rounded-xl border border-border bg-background px-3 text-sm text-foreground"
            />
            <Button size="sm" onClick={() => copyCampaignLink(campaignInput)} disabled={!sanitizeCampaign(campaignInput)}>
              <Copy size={14} /> {campaignCopied ? tCustomer("ui.affiliate.campaigns.copied") : tCustomer("ui.affiliate.campaigns.getLink")}
            </Button>
          </div>
          {recentCampaigns.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {recentCampaigns.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCampaignInput(c)}
                  className="rounded-full border border-border bg-muted px-2.5 py-1 text-[0.6875rem] text-muted-foreground hover:text-foreground"
                >
                  {c}
                </button>
              ))}
            </div>
          )}
          {stats.byCampaign.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted text-muted-foreground uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">{tCustomer("ui.affiliate.campaigns.columns.campaign")}</th>
                    <th className="text-right px-3 py-2 font-semibold">{tCustomer("ui.affiliate.campaigns.columns.clicks")}</th>
                    <th className="text-right px-3 py-2 font-semibold">{tCustomer("ui.affiliate.campaigns.columns.orders")}</th>
                    <th className="text-right px-3 py-2 font-semibold">{tCustomer("ui.affiliate.campaigns.columns.earned")}</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.byCampaign.map((row) => (
                    <tr key={row.campaign ?? "untagged"} className="border-t border-border">
                      <td className="px-3 py-2 font-medium text-foreground">{row.campaign ?? tCustomer("ui.affiliate.campaigns.untagged")}</td>
                      <td className="px-3 py-2 text-right font-[family-name:var(--font-mono)]">{row.clicks}</td>
                      <td className="px-3 py-2 text-right font-[family-name:var(--font-mono)]">{row.referrals}</td>
                      <td className="px-3 py-2 text-right font-[family-name:var(--font-mono)]">{MYR_CODE} {row.earnings.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="mb-8 rounded-2xl border border-border bg-card p-5 shadow-[0_8px_24px_rgba(1,0,102,0.06)] sm:p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-1.5">
          <Share2 size={13} /> {tCustomer("strictMigration.affiliate.funnel")}
        </p>
        <AffiliateFunnelSection funnel={stats.funnel} conversionLabel={tCustomer("ui.labels.bookings")} />
      </div>

      <div className="mb-8">
        <AffiliateInsightCard scope="user" />
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-[0_8px_24px_rgba(1,0,102,0.06)]">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">{tCustomer("categories.activity")}</th>
              {(["shares", "clicks", "referrals", "earnings"] as SortKey[]).map((key) => (
                <th key={key} className="text-right px-4 py-2.5 font-semibold">
                  <button onClick={() => toggleSort(key)} className="uppercase tracking-wide">
                    {key === "earnings" ? "Earned" : key === "referrals" ? "Orders" : key}
                    {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedProducts.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {tCustomer("strictMigration.affiliate.noSharedActivity")}
                </td>
              </tr>
            ) : (
              sortedProducts.map((p) => (
                <tr key={p.productId} className="border-t border-border">
                  <td className="px-4 py-2.5 font-medium text-foreground">{p.productName}</td>
                  <td className="px-4 py-2.5 text-right text-foreground">{p.shares}</td>
                  <td className="px-4 py-2.5 text-right text-foreground">{p.clicks}</td>
                  <td className="px-4 py-2.5 text-right text-foreground">{p.referrals}</td>
                  <td className="px-4 py-2.5 text-right font-[family-name:var(--font-mono)] text-foreground">
                    {MYR_CODE} {p.earnings.toFixed(2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="my-8 rounded-2xl border border-border bg-card p-5 shadow-[0_8px_24px_rgba(1,0,102,0.06)] sm:p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">{tCustomer("strictMigration.affiliate.clicksLast30Days")}</p>
        <AffiliateClicksChart data={stats.clicksByDay} />
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_8px_24px_rgba(1,0,102,0.06)]">
        <div className="px-4 py-2.5 bg-muted flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{tCustomer("strictMigration.affiliate.earningsHistory")}</p>
          <div className="flex items-center gap-2">
            <select
              value={exportRange}
              onChange={(e) => setExportRange(e.target.value as EarningsExportRange)}
              className="h-7 rounded-lg border border-border px-2 text-[0.6875rem] bg-background text-foreground"
            >
              <option value="month">{tCustomer("strictMigration.affiliate.thisMonth")}</option>
              <option value="year">{tCustomer("strictMigration.affiliate.thisYear")}</option>
              <option value="all">{tCustomer("strictMigration.affiliate.allTime")}</option>
            </select>
            <Button size="sm" variant="outline" className="h-7 text-[0.6875rem] px-2" onClick={downloadEarnings} disabled={exporting}>
              <Download size={12} /> {exporting ? "Exporting…" : "Download earnings (CSV)"}
            </Button>
          </div>
        </div>
        <div className="divide-y divide-border">
          {stats.commissions.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{tCustomer("strictMigration.affiliate.noCommissions")}</p>
          ) : (
            stats.commissions.map((c) => (
              <div key={c.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{c.productName ?? "Referral"}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleDateString()}
                    {c.orderAmount !== null && ` · order RM ${c.orderAmount.toFixed(2)}`} · {tCustomer("strictMigration.affiliate.rate", { percent: (c.rate * 100).toFixed(0) })}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.status === "confirmed" && "Cleared to wallet"}
                    {c.status === "pending" &&
                      (c.clearsInDays === 0 ? "Pending · clears today" : `Pending · clears in ${c.clearsInDays} day${c.clearsInDays === 1 ? "" : "s"}`)}
                    {c.status === "reversed" && "Reversed — order was cancelled or refunded"}
                    {c.status === "rejected" && "Not approved after review"}
                  </p>
                </div>
                <p
                  className={`shrink-0 font-bold font-[family-name:var(--font-mono)] ${c.status === "reversed" || c.status === "rejected" ? "text-muted-foreground line-through" : "text-foreground"}`}
                >
                  {MYR_CODE} {c.amount.toFixed(2)}
                </p>
              </div>
            ))
          )}
        </div>
      </div>
      </CustomerPageShell>
    </>
  );
}
