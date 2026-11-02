"use client";

// P4 — Member 4: admin affiliate oversight. See CLAUDE.md Step 9.

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, RefreshCw, Share2, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { AffiliateFunnelSection } from "@/components/shared/affiliate-funnel";
import { AffiliateInsightCard } from "@/components/shared/affiliate-insight-card";
import { FraudTrendChart } from "@/components/shared/fraud-trend-chart";
import { FraudTypeBarChart, FraudSeverityDonut } from "@/components/shared/fraud-breakdown-charts";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { AdminBatchActionBar } from "@/components/admin/batch-action-bar";
import { AdminFilterBar, adminFilterControlClassName } from "@/components/admin/filter-bar";
import { AdminMetricGrid, AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import type { Funnel } from "@/lib/affiliate/funnel";
import type { FraudAnalytics, FraudAnalyticsRange } from "@/lib/affiliate/fraud-analytics";
import { useTranslation } from "react-i18next";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { formatMYR } from "@/lib/i18n/format";

interface AdminTier {
  id: string;
  tierName: string;
  rate: number; // 0..1 fraction
  minReferrals: number;
  minSalesAmountSen: number;
  activePeriodDays: number | null;
  maxFraudRatePercent: number | null;
}

interface AdminAffiliateStats {
  totals: {
    totalAffiliates: number;
    totalClicks: number;
    totalReferrals: number;
    totalCommission: number;
  };
  maturityExposure: {
    generatedAt: string;
    pending: { count: number; amountRM: number };
    confirmedOnPaidOrders: { count: number; amountRM: number };
    confirmedOnRefundedOrders: { count: number; amountRM: number };
    confirmedOnOtherStatuses: { count: number; amountRM: number };
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
    reviewStatus: 'pending' | 'released' | 'rejected' | null;
    reviewVersion: number | null;
    reviewEvidence: string | null;
    releaseCheck: { reason: string | null; orderChecksPassed: boolean; matured: boolean; eligibleAfter: string } | null;
  }[];
  attributionTotalCount: number;
  attributionPageSize: number;
  attributionHasMore: boolean;
  attributionNextCursor: { sortValue: string; createdAt: string; id: string } | null;
  attributionSnapshotCutoff: string;
  funnel: Funnel;
}

type AdminAttributionRow = AdminAffiliateStats["attributions"][number];
type AdminAttributionCursor = { sortValue: string; createdAt: string; id: string };
interface AdminAttributionPage {
  items: AdminAttributionRow[];
  totalCount: number;
  pageSize: number;
  hasMore: boolean;
  nextCursor: AdminAttributionCursor | null;
  snapshotCutoff: string;
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

function releasePreviewReasonKey(reason: string): string {
  switch (reason) {
    case "no_show_policy":
    case "order_exception_open":
    case "order_missing":
    case "order_not_paid":
    case "pickup_unconfirmed":
    case "refund_review":
      return reason;
    default:
      return "preview_unavailable";
  }
}

interface TierDraft {
  ratePercent: string;
  minReferrals: string;
  minSalesAmountRM: string;
  activePeriodDays: string; // empty = no requirement (null)
  maxFraudRatePercent: string; // empty = no cap (null)
}

function draftFromTier(tier: AdminTier): TierDraft {
  return {
    ratePercent: formatRatePercent(tier.rate),
    minReferrals: String(tier.minReferrals),
    minSalesAmountRM: String(tier.minSalesAmountSen / 100),
    activePeriodDays: tier.activePeriodDays === null ? "" : String(tier.activePeriodDays),
    maxFraudRatePercent: tier.maxFraudRatePercent === null ? "" : String(tier.maxFraudRatePercent),
  };
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
  const [attributionPage, setAttributionPage] = useState(1);
  const [attributionCursorHistory, setAttributionCursorHistory] = useState<(AdminAttributionCursor | null)[]>([null]);
  const attributionSnapshotCutoff = useRef<string | null>(null);
  const [attributionResult, setAttributionResult] = useState<AdminAttributionPage | null>(null);
  const [attributionLoading, setAttributionLoading] = useState(true);
  const [attributionUnavailable, setAttributionUnavailable] = useState(false);
  const [attributionRefreshKey, setAttributionRefreshKey] = useState(0);
  const attributionRequestId = useRef(0);
  const [clearing, setClearing] = useState(false);
  const [clearingResult, setClearingResult] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [tierDrafts, setTierDrafts] = useState<Record<string, TierDraft>>({});
  const [savingTierId, setSavingTierId] = useState<string | null>(null);
  const [tierError, setTierError] = useState<string | null>(null);

  const [fraudFlags, setFraudFlags] = useState<FraudFlag[] | null | undefined>(undefined);
  const [fraudTotal, setFraudTotal] = useState(0);
  const [fraudPage, setFraudPage] = useState(1);
  const fraudPageSize = 10;
  const [fraudCounters, setFraudCounters] = useState<FraudCounters | null>(null);
  const [disabledLinks, setDisabledLinks] = useState<DisabledLink[]>([]);
  const [disabledLinksTotal, setDisabledLinksTotal] = useState(0);
  const [disabledLinksPage, setDisabledLinksPage] = useState(1);
  const disabledLinksPageSize = 10;
  const [fraudTypeFilter, setFraudTypeFilter] = useState("all");
  const [fraudSeverityFilter, setFraudSeverityFilter] = useState("all");
  const [fraudStatusFilter, setFraudStatusFilter] = useState("open");
  const [fraudSearch, setFraudSearch] = useState("");
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
            data.tiers.map((t) => [t.id, draftFromTier(t)]),
          ),
        );
      }
    } catch {
      setStats(null);
    }
  }

  const currentAttributionCursor = attributionCursorHistory[attributionPage - 1] ?? null;

  useEffect(() => {
    const requestId = ++attributionRequestId.current;
    const timer = window.setTimeout(() => {
      setAttributionLoading(true);
      setAttributionUnavailable(false);
      const params = new URLSearchParams({
        status: statusFilter,
        search: search.trim(),
        sortKey,
        sortDir,
        pageSize: "10",
      });
      if (currentAttributionCursor) params.set("cursor", JSON.stringify(currentAttributionCursor));
      if (attributionSnapshotCutoff.current) params.set("snapshotCutoff", attributionSnapshotCutoff.current);
      void fetch(`/api/admin/affiliate/attributions?${params.toString()}`, { cache: "no-store" })
        .then(async (response) => {
          const body = await response.json() as { data: AdminAttributionPage | null };
          if (requestId !== attributionRequestId.current) return;
          if (!response.ok || !body.data) {
            setAttributionUnavailable(true);
            setAttributionResult(null);
            return;
          }
          setAttributionResult(body.data);
          attributionSnapshotCutoff.current = body.data.snapshotCutoff;
        })
        .catch(() => {
          if (requestId === attributionRequestId.current) {
            setAttributionUnavailable(true);
            setAttributionResult(null);
          }
        })
        .finally(() => {
          if (requestId === attributionRequestId.current) setAttributionLoading(false);
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      attributionRequestId.current += 1;
    };
  }, [attributionPage, attributionCursorHistory, attributionRefreshKey, currentAttributionCursor, search, sortDir, sortKey, statusFilter]);

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
          minSalesAmountRM: Number(draft.minSalesAmountRM || 0),
          activePeriodDays: draft.activePeriodDays.trim() === "" ? null : Number(draft.activePeriodDays),
          maxFraudRatePercent: draft.maxFraudRatePercent.trim() === "" ? null : Number(draft.maxFraudRatePercent),
        }),
      });
      const body = (await res.json()) as { error: { message: string } | null };
      if (!res.ok) {
        setTierError(body.error?.message ?? t("affiliate.errors.saveTier"));
        return;
      }
      showFeedback("success", t("affiliate.success.tierSaved"));
      await loadStats();
    } catch {
      setTierError(t("affiliate.errors.saveTier"));
      showFeedback("error", t("affiliate.errors.saveAffiliateTier"));
    } finally {
      setSavingTierId(null);
    }
  }

  const loadFraudFlags = useCallback(async () => {
    setFraudFlags(undefined);
    try {
      const params = new URLSearchParams({ page: String(fraudPage), pageSize: String(fraudPageSize), disabledPage: String(disabledLinksPage), type: fraudTypeFilter, severity: fraudSeverityFilter, status: fraudStatusFilter });
      if (fraudSearch.trim()) params.set("search", fraudSearch.trim());
      const res = await fetch(`/api/admin/affiliate/fraud-flags?${params.toString()}`, { cache: "no-store" });
      const body = (await res.json()) as {
        data: { flags: FraudFlag[]; total: number; counters: FraudCounters; disabledLinks: DisabledLink[]; disabledLinksTotal: number; disabledLinksPage: number } | null;
      };
      if (res.ok && body.data) {
        const maxPage = Math.max(1, Math.ceil(body.data.total / fraudPageSize));
        if (fraudPage > maxPage) {
          setFraudPage(maxPage);
          return;
        }
        setFraudFlags(body.data.flags);
        setFraudTotal(body.data.total);
        setFraudCounters(body.data.counters);
        setDisabledLinks(body.data.disabledLinks);
        setDisabledLinksTotal(body.data.disabledLinksTotal);
        if (disabledLinksPage > Math.max(1, Math.ceil(body.data.disabledLinksTotal / disabledLinksPageSize))) {
          setDisabledLinksPage(Math.max(1, Math.ceil(body.data.disabledLinksTotal / disabledLinksPageSize)));
        }
      } else {
        setFraudFlags(null);
      }
    } catch {
      setFraudFlags(null);
    }
  }, [disabledLinksPage, disabledLinksPageSize, fraudPage, fraudPageSize, fraudSearch, fraudSeverityFilter, fraudStatusFilter, fraudTypeFilter]);

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
      if (!response.ok) { const body = await response.json().catch(() => ({})); showFeedback("error", body?.error?.message ?? t("affiliate.errors.reactivateLink")); return; }
      showFeedback("success", t("affiliate.success.linkReactivated"));
      await loadFraudFlags();
    } catch {
      showFeedback("error", t("affiliate.errors.reactivateLinkRetry"));
    } finally {
      setReactivatingLinkId(null);
    }
  }

  useEffect(() => {
    (async () => {
      await loadStats();
    })();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadFraudFlags(); }, 200);
    return () => window.clearTimeout(timer);
  }, [loadFraudFlags]);

  const fraudTotalPages = Math.ceil(fraudTotal / fraudPageSize);
  const attributionTotalPages = Math.max(1, Math.ceil((attributionResult?.totalCount ?? 0) / 10));

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
        showFeedback("error", t("affiliate.errors.exportRetry"));
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const fileName = /filename="([^"]+)"/.exec(disposition)?.[1] ?? "mylawatan-affiliate-report.pdf";
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      showFeedback("error", t("affiliate.errors.exportRetry"));
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
        data: { linksScanned: number; flagsCreated: unknown[]; hasMore?: boolean; busy?: boolean } | null;
        error: { message: string } | null;
      };
      if (res.ok && body.data) {
        const progress = body.data.busy
          ? t("affiliate.jobs.busy")
          : body.data.hasMore
            ? t("affiliate.jobs.more")
            : "";
        setSweepResult([t("affiliate.sweep.result", { links: body.data.linksScanned, flags: body.data.flagsCreated.length }), progress].filter(Boolean).join(" "));
        await Promise.all([loadFraudFlags(), loadFraudAnalytics(fraudRange)]);
      } else {
        setSweepResult(body.error?.message ?? t("affiliate.errors.fraudSweep"));
      }
    } catch {
      setSweepResult(t("affiliate.errors.fraudSweep"));
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
      if (!response.ok) { const body = await response.json().catch(() => ({})); showFeedback("error", body?.error?.message ?? t("affiliate.errors.reviewFlag")); return; }
      showFeedback("success", action === "confirm" ? t("affiliate.success.flagConfirmed") : t("affiliate.success.flagDismissed"));
      await Promise.all([loadFraudFlags(), loadStats(), loadFraudAnalytics(fraudRange)]);
    } catch {
      showFeedback("error", t("affiliate.errors.reviewFlagRetry"));
    } finally {
      setReviewingFlagId(null);
    }
  }

  async function applyFlagBatch(action: "dismiss" | "confirm") {
    if (batchBusy) return;
    const selected = filteredFraudFlags.filter((flag) => selectedFlagIds.has(flag.id) && flag.status === "open" && (action === "dismiss" || Boolean(flag.linkId)));
    if (!selected.length || selected.length !== selectedFlagIds.size) {
      showFeedback("error", action === "confirm" ? t("affiliate.errors.flagNeedsLink") : t("affiliate.errors.selectOpenFlags"));
      return;
    }
    setBatchBusy(true);
    try {
      const responses = await Promise.all(selected.map((flag) => fetch(`/api/admin/affiliate/fraud-flags/${flag.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) })));
      const failed = responses.find((response) => !response.ok);
      if (failed) {
        const body = await failed.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? t("affiliate.errors.batchFlags"));
      }
      setSelectedFlagIds(new Set());
      showFeedback("success", t("affiliate.success.batchFlags", { count: selected.length }));
      await loadFraudFlags();
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : t("affiliate.errors.batchFlagUpdate"));
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
        const safeCode = body.error?.code;
        showFeedback(
          "error",
          safeCode === "CLEARING_RESULT_UNCERTAIN"
            ? t("affiliate.errors.clearingUncertain", { requestId: body.error?.requestId ?? res.headers.get("x-request-id") ?? t("affiliate.errors.requestIdUnavailable") })
            : safeCode === "AFFILIATE_NO_SHOW_POLICY_REVIEW"
            ? t("affiliate.errors.noShowPolicy")
            : safeCode === "AFFILIATE_ORDER_REVIEW_REQUIRED"
              ? t("affiliate.errors.orderReview")
              : body.error?.message ??
            (action === "accept"
              ? t("affiliate.errors.accept")
              : t("affiliate.errors.reject")),
        );
        return;
      }
      showFeedback(
        "success",
        action === "accept"
          ? t("affiliate.success.accepted")
          : t("affiliate.success.rejected"),
      );
      await loadStats();
      setAttributionRefreshKey((key) => key + 1);
    } catch {
      showFeedback(
        "error",
        action === "accept"
          ? t("affiliate.errors.accept")
          : t("affiliate.errors.reject"),
      );
    } finally {
      setReviewingId(null);
    }
  }

  async function reviewGuestCommission(id: string, version: number, action: "release" | "reject") {
    if (reviewingId) return;
    setReviewingId(id);
    try {
      const response = await fetch(`/api/admin/affiliate/attributions/${id}/guest-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, version }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        showFeedback("error", body.error?.message ?? t("affiliate.errors.guestReview"));
        return;
      }
      showFeedback("success", action === "release" ? t("affiliate.success.guestReviewReleased") : t("affiliate.success.rejected"));
      await loadStats();
      setAttributionRefreshKey((key) => key + 1);
    } catch {
      showFeedback("error", t("affiliate.errors.guestReview"));
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
        data: { cleared: unknown[]; reversed: unknown[]; skipped: number; errors: { requestId?: string }[]; orderReviewRequired?: number; hasMore?: boolean; busy?: boolean } | null;
        error: { message: string } | null;
      };
      if (res.ok && body.data) {
        const progress = body.data.busy
          ? t("affiliate.jobs.busy")
          : body.data.hasMore
            ? t("affiliate.jobs.more")
            : "";
        const orderReview = body.data.orderReviewRequired
          ? t("affiliate.clearing.orderReviewRequired", { count: body.data.orderReviewRequired })
          : "";
        const errorRefs = body.data.errors.map((error) => error.requestId).filter((id): id is string => Boolean(id)).slice(0, 3);
        const clearingErrors = body.data.errors.length
          ? t("affiliate.clearing.rowErrors", { count: body.data.errors.length, requestIds: errorRefs.join(", ") || t("affiliate.errors.requestIdUnavailable") })
          : "";
        setClearingResult([
          t("affiliate.clearing.result", { cleared: body.data.cleared.length, reversed: body.data.reversed.length, skipped: body.data.skipped, errors: "" }),
          orderReview,
          clearingErrors,
          progress,
        ].filter(Boolean).join(" "));
        await loadStats();
        setAttributionRefreshKey((key) => key + 1);
      } else {
        setClearingResult(body.error?.message ?? t("affiliate.errors.clearing"));
      }
    } catch {
      setClearingResult(t("affiliate.errors.clearing"));
    } finally {
      setClearing(false);
    }
  }

  const filteredAttributions = attributionResult?.items ?? [];

  const filteredFraudFlags = fraudFlags ?? [];

  function resetAttributionPagination() {
    setAttributionPage(1);
    setAttributionCursorHistory([null]);
    attributionSnapshotCutoff.current = null;
  }

  function toggleSort(key: SortKey) {
    resetAttributionPagination();
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  function goToNextAttributionPage() {
    const nextCursor = attributionResult?.nextCursor;
    if (!nextCursor || !attributionResult.hasMore) return;
    setAttributionCursorHistory((history) => [...history.slice(0, attributionPage), nextCursor]);
    setAttributionPage((page) => page + 1);
  }

  function goToPreviousAttributionPage() {
    if (attributionPage <= 1) return;
    setAttributionPage((page) => page - 1);
  }

  if (stats === undefined) {
    return <AdminPageShell><AdminPageHeader eyebrow={<span className="flex items-center gap-2"><Share2 size={14} /> {t("affiliate.eyebrow")}</span>} title={t("affiliate.title")} /><p className="text-sm text-muted-foreground">{t("affiliate.loading")}</p></AdminPageShell>;
  }
  if (stats === null) {
    return <AdminPageShell><AdminPageHeader eyebrow={<span className="flex items-center gap-2"><Share2 size={14} /> {t("affiliate.eyebrow")}</span>} title={t("affiliate.title")} /><EmptyState title={t("affiliate.errors.loadTitle")} description={t("affiliate.errors.loadDescription")} /></AdminPageShell>;
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={<span className="flex items-center gap-2"><Share2 size={14} /> {t("affiliate.eyebrow")}</span>}
        title={t("affiliate.title")}
        actions={<div className="flex items-start gap-2 text-right">
          <div>
            <Button size="sm" variant="outline" onClick={exportPdf} disabled={exportingPdf}>
              <Download size={13} /> {exportingPdf ? t("affiliate.exporting") : t("affiliate.exportPdf")}
            </Button>
          </div>
          <div>
            <Button size="sm" variant="outline" onClick={runClearing} disabled={clearing}>
              <RefreshCw size={13} className={clearing ? "animate-spin" : ""} /> {clearing ? t("affiliate.running") : t("affiliate.runClearing")}
            </Button>
            {clearingResult && <p className="text-[0.6875rem] text-muted-foreground mt-1 max-w-[220px]">{clearingResult}</p>}
          </div>
          <div>
            <Button size="sm" variant="outline" onClick={runFraudSweepAction} disabled={sweeping}>
              <AlertTriangle size={13} className={sweeping ? "animate-pulse" : ""} /> {sweeping ? t("affiliate.scanning") : t("affiliate.runFraudSweep")}
            </Button>
            {sweepResult && <p className="text-[0.6875rem] text-muted-foreground mt-1 max-w-[220px]">{sweepResult}</p>}
          </div>
        </div>}
      />
      <div className="rounded-xl bg-card p-4 mb-6" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">{t("affiliate.commissionTiers")}</p>
        <div className="space-y-2">
          {stats.tiers.map((tier) => {
            const draft = tierDrafts[tier.id] ?? draftFromTier(tier);
            return (
              <div key={tier.id || tier.tierName} className="flex items-center gap-3 flex-wrap text-sm">
                <span className="w-16 capitalize text-foreground font-medium">{tier.tierName}</span>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  {t("affiliate.rate")}
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
                  {t("affiliate.minReferrals")}
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
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  {t("affiliate.minSalesAmount")}
                  <input
                    type="number"
                    step="1"
                    min="0"
                    value={draft.minSalesAmountRM}
                    disabled={!tier.id}
                    onChange={(e) =>
                      setTierDrafts((d) => ({ ...d, [tier.id]: { ...draft, minSalesAmountRM: e.target.value } }))
                    }
                    className="h-7 w-20 rounded-lg border border-border px-2 text-xs bg-background text-foreground"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  {t("affiliate.activePeriodDays")}
                  <input
                    type="number"
                    step="1"
                    min="0"
                    placeholder={t("affiliate.noLimit")}
                    value={draft.activePeriodDays}
                    disabled={!tier.id}
                    onChange={(e) =>
                      setTierDrafts((d) => ({ ...d, [tier.id]: { ...draft, activePeriodDays: e.target.value } }))
                    }
                    className="h-7 w-16 rounded-lg border border-border px-2 text-xs bg-background text-foreground"
                  />
                </label>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  {t("affiliate.maxFraudRate")}
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    placeholder={t("affiliate.noLimit")}
                    value={draft.maxFraudRatePercent}
                    disabled={!tier.id}
                    onChange={(e) =>
                      setTierDrafts((d) => ({ ...d, [tier.id]: { ...draft, maxFraudRatePercent: e.target.value } }))
                    }
                    className="h-7 w-16 rounded-lg border border-border px-2 text-xs bg-background text-foreground"
                  />
                  %
                </label>
                <Button size="sm" variant="outline" disabled={!tier.id || savingTierId === tier.id} onClick={() => saveTier(tier)}>
                  {savingTierId === tier.id ? t("affiliate.saving") : t("common.actions.save")}
                </Button>
              </div>
            );
          })}
        </div>
        {tierError && <p className="text-[0.6875rem] text-destructive mt-2">{tierError}</p>}
      </div>

      <AdminMetricGrid items={[
          { label: t("affiliate.metrics.affiliates"), value: String(stats.totals.totalAffiliates) },
          { label: t("affiliate.metrics.clicks"), value: String(stats.totals.totalClicks) },
          { label: t("affiliate.metrics.referrals"), value: String(stats.totals.totalReferrals) },
          { label: t("affiliate.metrics.commission"), value: formatMYR(stats.totals.totalCommission) },
      ]} />

      <div className="rounded-xl border border-border bg-card p-4 mb-6" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <p className="text-xs font-bold uppercase tracking-wider text-primary mb-1">{t("affiliate.maturityExposure.title")}</p>
        <p className="text-xs text-muted-foreground mb-3">{t("affiliate.maturityExposure.description")}</p>
        <AdminMetricGrid items={[
          { label: t("affiliate.maturityExposure.pending"), value: `${formatMYR(stats.maturityExposure.pending.amountRM)} · ${stats.maturityExposure.pending.count}` },
          { label: t("affiliate.maturityExposure.paid"), value: `${formatMYR(stats.maturityExposure.confirmedOnPaidOrders.amountRM)} · ${stats.maturityExposure.confirmedOnPaidOrders.count}` },
          { label: t("affiliate.maturityExposure.refunded"), value: `${formatMYR(stats.maturityExposure.confirmedOnRefundedOrders.amountRM)} · ${stats.maturityExposure.confirmedOnRefundedOrders.count}` },
          { label: t("affiliate.maturityExposure.other"), value: `${formatMYR(stats.maturityExposure.confirmedOnOtherStatuses.amountRM)} · ${stats.maturityExposure.confirmedOnOtherStatuses.count}` },
        ]} />
        <p className="mt-2 text-[0.6875rem] text-muted-foreground">{t("affiliate.maturityExposure.updated", { date: new Date(stats.maturityExposure.generatedAt).toLocaleString(locale) })}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-1.5">
            <Share2 size={13} /> {t("affiliate.platformFunnel")}
          </p>
          <AffiliateFunnelSection funnel={stats.funnel} conversionLabel={t("affiliate.conversions")} />
        </div>
        <AffiliateInsightCard scope="admin" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-1.5">
            <TrendingUp size={13} /> {t("affiliate.topEarners")}
          </p>
          {stats.topEarners.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("affiliate.noCommissions")}</p>
          ) : (
            <div className="space-y-2">
              {stats.topEarners.map((e, i) => (
                <div key={e.userId} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    {i + 1}. {e.userName} <span className="capitalize text-muted-foreground font-normal">({e.tierName})</span>
                  </span>
                  <span className="text-muted-foreground">
                    {t("affiliate.referralCount", { count: e.referrals })} · <span className="font-semibold text-foreground">{formatMYR(e.commission)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <p className="text-xs font-bold uppercase tracking-wider text-destructive mb-3 flex items-center gap-1.5">
            <AlertTriangle size={13} /> {t("affiliate.fraudGuards")}
          </p>
          {fraudCounters ? (
            <div className="space-y-1.5 text-sm">
              <p className="text-foreground">{t("affiliate.fraudCounters.selfReferralsBlocked", { count: fraudCounters.selfReferralsBlocked })}</p>
              <p className="text-foreground">{t("affiliate.fraudCounters.duplicatePayoutsPrevented", { count: fraudCounters.duplicatePayoutsPrevented })}</p>
              <p className="text-muted-foreground text-xs pt-1">{t("affiliate.fraudCounters.openFlagsSummary", { flags: fraudCounters.openFlags, links: fraudCounters.linksDisabled })}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("affiliate.loading")}</p>
          )}
        </div>

        <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">{t("affiliate.disabledLinks")}</p>
          {disabledLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("affiliate.noDisabledLinks")}</p>
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
                    {reactivatingLinkId === l.linkId ? t("affiliate.reEnabling") : t("affiliate.reEnable")}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {disabledLinksTotal > disabledLinksPageSize && (
            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>{t("affiliate.pagination.showing", { first: (disabledLinksPage - 1) * disabledLinksPageSize + 1, last: Math.min(disabledLinksPage * disabledLinksPageSize, disabledLinksTotal), total: disabledLinksTotal })}</span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" aria-label={t("affiliate.pagination.previous")} disabled={disabledLinksPage <= 1} onClick={() => setDisabledLinksPage((page) => Math.max(1, page - 1))}><ChevronLeft size={14} /></Button>
                <Button size="sm" variant="outline" aria-label={t("affiliate.pagination.next")} disabled={disabledLinksPage >= Math.ceil(disabledLinksTotal / disabledLinksPageSize)} onClick={() => setDisabledLinksPage((page) => page + 1)}><ChevronRight size={14} /></Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <p className="text-xs font-bold uppercase tracking-wider text-destructive flex items-center gap-1.5">
          <AlertTriangle size={13} /> {t("affiliate.fraudAnalytics")}
        </p>
        <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
          {(["7d", "30d", "90d"] as FraudAnalyticsRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setFraudRange(r)}
              className={`h-7 px-3 rounded-md text-xs font-medium transition-colors ${
                fraudRange === r ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {fraudAnalytics === undefined ? (
        <p className="text-sm text-muted-foreground mb-6">{t("affiliate.loadingFraudAnalytics")}</p>
      ) : fraudAnalytics === null ? (
        <p className="text-sm text-muted-foreground mb-6">{t("affiliate.errors.loadFraudAnalytics")}</p>
      ) : (
        <>
          <AdminMetricGrid items={[
              { label: t("affiliate.analytics.totalFlags"), value: String(fraudAnalytics.headline.totalFlags) },
              { label: t("affiliate.analytics.selfReferrals"), value: String(fraudAnalytics.headline.selfReferralsBlocked) },
              { label: t("affiliate.analytics.duplicatePayouts"), value: String(fraudAnalytics.headline.duplicatePayoutsPrevented) },
              { label: t("affiliate.analytics.disabledLinks"), value: String(fraudAnalytics.headline.linksAutoDisabled) },
              {
                label: t("affiliate.analytics.openVsReviewed"),
                value: fraudAnalytics.headline.totalFlags
                  ? t("affiliate.analytics.openPercentage", { percent: Math.round((fraudAnalytics.headline.openFlags / fraudAnalytics.headline.totalFlags) * 100) })
                  : "—",
              },
          ]} />

          <div className="rounded-xl bg-card p-4 mb-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
            <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">{t("affiliate.analytics.flagsOverTime")}</p>
            <FraudTrendChart data={fraudAnalytics.overTime} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
              <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">{t("affiliate.analytics.byType")}</p>
              <FraudTypeBarChart data={fraudAnalytics.byType} />
            </div>

            <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
              <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">{t("affiliate.analytics.bySeverity")}</p>
              <FraudSeverityDonut data={fraudAnalytics.bySeverity} />
            </div>
          </div>

          <div className="rounded-xl bg-card p-4 mb-6" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
            <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">{t("affiliate.analytics.topFlagged")}</p>
            {fraudAnalytics.topFlaggedAffiliates.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("affiliate.analytics.noFlags")}</p>
            ) : (
              <div className="space-y-2">
                {fraudAnalytics.topFlaggedAffiliates.map((a, i) => (
                  <div key={a.userId} className="flex items-center justify-between text-sm">
                    <span className="text-foreground">
                      {i + 1}. {a.userName}
                      {a.affiliateCode && <span className="text-muted-foreground font-normal"> ({a.affiliateCode})</span>}
                    </span>
                    <span className="text-muted-foreground">
                      {t("affiliate.analytics.flagCount", { count: a.flagCount })}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      <AdminFilterBar className="mb-3">
        <input
          value={fraudSearch}
          onChange={(event) => { setFraudSearch(event.target.value); setFraudPage(1); setSelectedFlagIds(new Set()); }}
          placeholder={t("affiliate.searchPlaceholder")}
          aria-label={t("affiliate.searchPlaceholder")}
          className={`${adminFilterControlClassName} min-w-[220px] flex-1`}
        />
        <div className="flex items-center gap-2">
          <select
            value={fraudTypeFilter}
            onChange={(e) => { setFraudTypeFilter(e.target.value); setFraudPage(1); setSelectedFlagIds(new Set()); }}
            className={adminFilterControlClassName}
          >
            <option value="all">{t("affiliate.filters.allTypes")}</option>
            {Object.keys(FLAG_TYPE_LABEL).map((key) => (
              <option key={key} value={key}>
                {t(`affiliate.flagTypes.${key}`)}
              </option>
            ))}
          </select>
          <select
            value={fraudSeverityFilter}
            onChange={(e) => { setFraudSeverityFilter(e.target.value); setFraudPage(1); setSelectedFlagIds(new Set()); }}
            className={adminFilterControlClassName}
          >
            <option value="all">{t("affiliate.filters.allSeverities")}</option>
            <option value="high">{t("affiliate.severity.high")}</option>
            <option value="medium">{t("affiliate.severity.medium")}</option>
            <option value="low">{t("affiliate.severity.low")}</option>
          </select>
          <select
            value={fraudStatusFilter}
            onChange={(e) => { setFraudStatusFilter(e.target.value); setFraudPage(1); setSelectedFlagIds(new Set()); }}
            className={adminFilterControlClassName}
          >
            <option value="all">{t("affiliate.filters.allStatuses")}</option>
            <option value="open">{t("filters.open")}</option>
            <option value="reviewed">{t("affiliate.status.reviewed")}</option>
            <option value="dismissed">{t("filters.dismissed")}</option>
          </select>
        </div>
      </AdminFilterBar>

      <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-card" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-xs"><input type="checkbox" aria-label={t("affiliate.accessibility.selectAllFlags")} checked={filteredFraudFlags.length > 0 && filteredFraudFlags.filter((flag) => flag.status === "open").every((flag) => selectedFlagIds.has(flag.id))} onChange={(event) => setSelectedFlagIds((previous) => { const next = new Set(previous); filteredFraudFlags.filter((flag) => flag.status === "open").forEach((flag) => { if (event.target.checked) next.add(flag.id); else next.delete(flag.id); }); return next; })} /><span className="text-muted-foreground">{t("affiliate.selectAllOpen")}</span></div>
        <AdminBatchActionBar selectedCount={filteredFraudFlags.filter((flag) => selectedFlagIds.has(flag.id)).length} onClear={() => setSelectedFlagIds(new Set())} onApply={(action) => void applyFlagBatch(action as "dismiss" | "confirm")} actions={[{ value: "dismiss", label: t("batchActions.dismiss") }, { value: "confirm", label: t("batchActions.confirm") }]} busy={batchBusy} />
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">{t("affiliate.columns.select")}</th>
              <th className="text-left px-4 py-2.5 font-semibold">{t("affiliate.columns.affiliate")}</th>
              <th className="text-left px-4 py-2.5 font-semibold">{t("affiliate.columns.type")}</th>
              <th className="text-left px-4 py-2.5 font-semibold">{t("affiliate.columns.severity")}</th>
              <th className="text-left px-4 py-2.5 font-semibold">{t("affiliate.columns.evidence")}</th>
              <th className="text-left px-4 py-2.5 font-semibold">{t("affiliate.columns.when")}</th>
              <th className="text-left px-4 py-2.5 font-semibold">{t("affiliate.columns.status")}</th>
              <th className="text-right px-4 py-2.5 font-semibold">{t("affiliate.columns.actions")}</th>
            </tr>
          </thead>
          <tbody>
            {fraudFlags === undefined ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("affiliate.loading")}
                </td>
              </tr>
            ) : filteredFraudFlags.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("affiliate.noFlags")}
                </td>
              </tr>
            ) : (
              filteredFraudFlags.map((f) => (
                <tr key={f.id} className="border-t border-border align-top">
                  <td className="px-4 py-2.5"><input type="checkbox" aria-label={t("affiliate.accessibility.selectFlag", { name: f.userName })} disabled={f.status !== "open"} checked={selectedFlagIds.has(f.id)} onChange={(event) => setSelectedFlagIds((previous) => { const next = new Set(previous); if (event.target.checked) next.add(f.id); else next.delete(f.id); return next; })} /></td>
                  <td className="px-4 py-2.5 text-foreground">
                    {f.userName}
                    {f.affiliateCode && <span className="text-muted-foreground"> ({f.affiliateCode})</span>}
                  </td>
                  <td className="px-4 py-2.5 text-foreground">{t(`affiliate.flagTypes.${f.flagType}`)}</td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs capitalize ${SEVERITY_STYLE[f.severity] ?? ""}`}>
                      {t(`affiliate.severity.${f.severity}`)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs max-w-[240px]">
                    {f.detail ? Object.entries(f.detail).map(([k, v]) => `${k}: ${v}`).join(" · ") : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{new Date(f.createdAt).toLocaleDateString(locale)}</td>
                  <td className="px-4 py-2.5 text-foreground capitalize">{t(`affiliate.status.${f.status}`)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {f.status === "open" && (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reviewingFlagId === f.id}
                          onClick={() => reviewFlag(f.id, "dismiss")}
                        >
                          {t("batchActions.dismiss")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={reviewingFlagId === f.id || !f.linkId}
                          onClick={() => reviewFlag(f.id, "confirm")}
                        >
                          {t("batchActions.confirm")}
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
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>{t("affiliate.pagination.showing", { first: fraudTotal ? (fraudPage - 1) * fraudPageSize + 1 : 0, last: Math.min(fraudPage * fraudPageSize, fraudTotal), total: fraudTotal })}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={fraudPage <= 1} aria-label={t("affiliate.pagination.previous")} onClick={() => { setFraudPage((page) => Math.max(1, page - 1)); setSelectedFlagIds(new Set()); }}>
            <ChevronLeft size={14} /> {t("affiliate.pagination.previous")}
          </Button>
          <span className="min-w-24 text-center">{t("affiliate.pagination.pageOf", { page: fraudPage, total: Math.max(1, fraudTotalPages) })}</span>
          <Button variant="outline" size="sm" disabled={fraudPage >= fraudTotalPages || fraudTotalPages === 0} aria-label={t("affiliate.pagination.next")} onClick={() => { setFraudPage((page) => page + 1); setSelectedFlagIds(new Set()); }}>
            {t("affiliate.pagination.next")} <ChevronRight size={14} />
          </Button>
        </div>
      </div>

      <AdminFilterBar className="mb-3">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">{t("affiliate.allAttributions")}</p>
        <div className="flex min-w-[220px] flex-1 items-center gap-2">
          <input
            value={search}
            onChange={(e) => { resetAttributionPagination(); setSearch(e.target.value); }}
            placeholder={t("affiliate.searchPlaceholder")}
            className={`${adminFilterControlClassName} min-w-0 flex-1`}
          />
          <select
            value={statusFilter}
            onChange={(e) => { resetAttributionPagination(); setStatusFilter(e.target.value); }}
            className={adminFilterControlClassName}
          >
            <option value="all">{t("affiliate.filters.allStatuses")}</option>
            <option value="pending">{t("affiliate.status.pending")}</option>
            <option value="confirmed">{t("affiliate.status.confirmed")}</option>
            <option value="reversed">{t("affiliate.status.reversed")}</option>
            <option value="rejected">{t("affiliate.status.rejected")}</option>
          </select>
        </div>
      </AdminFilterBar>

      <div className="overflow-hidden rounded-2xl border border-border bg-card" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              {(
                [
                  ["userName", t("affiliate.columns.user")],
                  ["productName", t("affiliate.columns.activity")],
                  ["createdAt", t("affiliate.columns.date")],
                  ["status", t("affiliate.columns.status")],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th key={key} className="text-left px-4 py-2.5 font-semibold">
                  <button onClick={() => toggleSort(key)}>
                    {label}
                    {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
              <th className="text-right px-4 py-2.5 font-semibold">{t("affiliate.columns.commission")}</th>
              <th className="text-right px-4 py-2.5 font-semibold">{t("affiliate.columns.review")}</th>
            </tr>
          </thead>
          <tbody>
            {attributionLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">{t("affiliate.loading")}</td></tr>
            ) : attributionUnavailable ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-destructive">{t("affiliate.errors.loadDescription")}</td></tr>
            ) : filteredAttributions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t("affiliate.noAttributions")}
                </td>
              </tr>
            ) : (
              filteredAttributions.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2.5 text-foreground">{r.userName}</td>
                  <td className="px-4 py-2.5 text-foreground">{r.productName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{new Date(r.createdAt).toLocaleDateString(locale)}</td>
                  <td className="px-4 py-2.5 text-foreground capitalize">{t(`affiliate.status.${r.status}`)}</td>
                  <td className="px-4 py-2.5 text-right font-[family-name:var(--font-mono)] text-foreground">
                    {formatMYR(r.commissionAmount)}
                    {r.status === "pending" && r.releaseCheck ? (
                      <div className="mt-1 max-w-64 text-left text-xs font-normal text-muted-foreground">
                        <span className="font-medium">{t("affiliate.releasePreview.label")}: </span>
                        {r.releaseCheck.reason ? (
                          <>
                            <div>{t("affiliate.releasePreview.orderReference", { id: r.orderId })}</div>
                            {t(`affiliate.releasePreview.reasons.${releasePreviewReasonKey(r.releaseCheck.reason)}`)}
                            {r.releaseCheck.reason !== "no_show_policy" && r.releaseCheck.reason !== "preview_unavailable" ? (
                              <> · <a className="underline underline-offset-2" href="/admin/reports/reconciliation">{t("affiliate.releasePreview.openReconciliation")}</a></>
                            ) : null}
                          </>
                        ) : r.releaseCheck.matured ? t("affiliate.releasePreview.ready") : t("affiliate.releasePreview.waitingForMaturity", { date: new Date(r.releaseCheck.eligibleAfter).toLocaleDateString(locale) })}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {r.status === "pending" && r.reviewStatus === "pending" && r.reviewVersion !== null ? (
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="max-w-64 text-right text-xs text-amber-700">{t("affiliate.guestReview.reason")}</span>
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" disabled={reviewingId === r.id}
                            onClick={() => reviewGuestCommission(r.id, r.reviewVersion!, "release")}>{t("affiliate.guestReview.release")}</Button>
                          <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs text-destructive hover:text-destructive" disabled={reviewingId === r.id}
                            onClick={() => reviewGuestCommission(r.id, r.reviewVersion!, "reject")}>{t("affiliate.guestReview.reject")}</Button>
                        </div>
                      </div>
                    ) : r.status === "pending" ? (
                      <div className="flex justify-end gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs"
                          disabled={reviewingId === r.id}
                          onClick={() => reviewAttribution(r.id, "accept")}
                        >
                          {t("affiliate.accept")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs text-destructive hover:text-destructive"
                          disabled={reviewingId === r.id}
                          onClick={() => reviewAttribution(r.id, "reject")}
                        >
                          {t("affiliate.reject")}
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
      <div className="mt-3 flex items-center justify-center gap-3">
        <Button variant="outline" size="sm" disabled={attributionPage <= 1 || attributionLoading} aria-label={t("affiliate.pagination.previous")}
          onClick={goToPreviousAttributionPage}>
          <ChevronLeft size={14} /> {t("affiliate.pagination.previous")}
        </Button>
        <span className="min-w-24 text-center text-sm text-muted-foreground">
          {t("affiliate.pagination.pageOf", { page: attributionPage, total: attributionTotalPages })}
          {attributionResult ? ` · ${attributionResult.totalCount}` : ""}
        </span>
        <Button variant="outline" size="sm" disabled={!attributionResult?.hasMore || attributionLoading} aria-label={t("affiliate.pagination.next")}
          onClick={goToNextAttributionPage}>
          {t("affiliate.pagination.next")} <ChevronRight size={14} />
        </Button>
      </div>
    </AdminPageShell>
  );
}
