"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronLeft, ChevronRight, Eye, Filter, Play, Search } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { getVendorRecommendations } from "@/backend/domains/discovery";
import { StatusBadge } from "@/components/shared/status-badge";
import { VerifiedContributorBadge } from "@/components/shared/verified-contributor-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type { VendorRecommendation } from "@/backend/core/types";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { AdminBatchActionBar } from "@/components/admin/batch-action-bar";
import { AdminFilterBar, adminFilterControlClassName } from "@/components/admin/filter-bar";
import { AdminMetricGrid, AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { useTranslation } from "react-i18next";

const PENDING_PAGE_SIZE = 10;

export default function AdminRecommendationsPage() {
  const { currentUser } = useAuth();
  const { showFeedback } = useActionFeedback();
  const { t } = useTranslation("admin");
  const [recs, setRecs] = useState<VendorRecommendation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const [clearingMessage, setClearingMessage] = useState<string | null>(null);
  const [pendingPage, setPendingPage] = useState(1);
  const [reviewedPage, setReviewedPage] = useState(1);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stateFilter, setStateFilter] = useState("all");
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  useEffect(() => {
    getVendorRecommendations().then(setRecs);
  }, []);

  useEffect(() => {
    if (currentUser?.role === "super_admin") {
      void fetch("/api/admin/recommendations/mark-seen", { method: "POST" }).catch(() => {
        // best-effort — a read-state failure must not block the moderation queue
      });
    }
  }, [currentUser?.role]);

  async function runRewardClearing() {
    if (clearing) return;
    setClearing(true);
    setClearingMessage(null);
    setError(null);
    try {
      const response = await fetch('/api/admin/recommendations/run-clearing', { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = body?.error?.message ?? t("ui.recommendations.rewardClearing.error");
        setError(message);
        showFeedback('error', message);
        return;
      }
      const result = body?.data ?? {};
      const message = t("ui.recommendations.rewardClearing.completed", {
        cleared: result.cleared?.length ?? 0,
        reversed: result.reversed?.length ?? 0,
        skipped: result.skipped ?? 0,
      });
      setClearingMessage(message);
      showFeedback('success', message);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("ui.recommendations.rewardClearing.error");
      setError(message);
      showFeedback('error', message);
    } finally {
      setClearing(false);
    }
  }

  async function applyBatch(action: "approve" | "request_changes" | "reject") {
    const selected = visiblePending.filter((recommendation) => selectedPendingIds.has(recommendation.id));
    if (!selected.length || batchBusy) return;
    const reason = action === "approve" ? undefined : window.prompt(action === "reject"
      ? t("ui.recommendations.batch.rejectReasonPrompt")
      : t("ui.recommendations.batch.changesReasonPrompt"))?.trim();
    if (action !== "approve" && (!reason || reason.length < 10)) {
      setError(t("ui.recommendations.batch.reasonError"));
      return;
    }
    setBatchBusy(true);
    setError(null);
    try {
      const responses = await Promise.all(selected.map((recommendation) => fetch("/api/admin/recommendations/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recommendationId: recommendation.id, action, ...(reason ? { reason } : {}) }),
      })));
      const failed = responses.find((response) => !response.ok);
      if (failed) {
        const body = await failed.json().catch(() => ({}));
        throw new Error(body.error?.message ?? t("ui.recommendations.batch.reviewFailed"));
      }
      setSelectedPendingIds(new Set());
      showFeedback("success", t("ui.recommendations.batch.processed", { count: selected.length }));
      setRecs(await getVendorRecommendations());
    } catch (err) {
      const message = err instanceof Error ? err.message : t("ui.recommendations.batch.reviewFailed");
      setError(message);
      showFeedback("error", message);
    } finally {
      setBatchBusy(false);
    }
  }

  const filteredRecs = recs.filter((recommendation) => {
    const query = search.trim().toLowerCase();
    const matchesSearch = !query || [recommendation.name, recommendation.category, recommendation.state, recommendation.author?.name]
      .filter(Boolean)
      .some((value) => value?.toLowerCase().includes(query));
    const matchesCategory = categoryFilter === "all" || recommendation.category === categoryFilter;
    const matchesState = stateFilter === "all" || recommendation.state === stateFilter;
    return matchesSearch && matchesCategory && matchesState;
  });
  const pending  = filteredRecs.filter((r) => r.status === "pending");
  const reviewed = filteredRecs.filter((r) => r.status !== "pending");
  const approved = filteredRecs.filter((r) => r.status === "approved").length;
  const rejected = filteredRecs.filter((r) => r.status === "rejected").length;
  const pendingPageCount = Math.max(1, Math.ceil(pending.length / PENDING_PAGE_SIZE));
  const reviewedPageCount = Math.max(1, Math.ceil(reviewed.length / PENDING_PAGE_SIZE));
  const activePendingPage = Math.min(pendingPage, pendingPageCount);
  const activeReviewedPage = Math.min(reviewedPage, reviewedPageCount);
  const visiblePending = pending.slice(
    (activePendingPage - 1) * PENDING_PAGE_SIZE,
    activePendingPage * PENDING_PAGE_SIZE,
  );
  const visibleReviewed = reviewed.slice(
    (activeReviewedPage - 1) * PENDING_PAGE_SIZE,
    activeReviewedPage * PENDING_PAGE_SIZE,
  );
  const categories = Array.from(new Set(recs.map((recommendation) => recommendation.category).filter(Boolean))).sort();
  const states = Array.from(new Set(recs.map((recommendation) => recommendation.state).filter(Boolean))).sort();
  const hasFilters = Boolean(search.trim()) || categoryFilter !== "all" || stateFilter !== "all";

  function clearFilters() {
    setSearch("");
    setCategoryFilter("all");
    setStateFilter("all");
    setPendingPage(1);
    setReviewedPage(1);
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        title={t("ui.recommendations.title")}
        description={<>{t("ui.recommendations.subtitle")}<br />{t("ui.recommendations.description")}</>}
      />

      <AdminMetricGrid items={[
        { label: t("ui.recommendations.pending", { count: pending.length }), value: pending.length },
        { label: t("ui.recommendations.reviewed", { count: reviewed.length }), value: reviewed.length },
        { label: t("filters.approved"), value: approved },
        { label: t("filters.rejected"), value: rejected },
      ]} />

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      <AdminFilterBar className="mb-6">
        <label className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPendingPage(1); setReviewedPage(1); }}
            placeholder={t("ui.recommendations.searchPlaceholder")}
            className={`${adminFilterControlClassName} w-full pl-9`}
          />
        </label>
        <select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPendingPage(1); setReviewedPage(1); }} className={adminFilterControlClassName}>
          <option value="all">{t("ui.recommendations.allCategories")}</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <select value={stateFilter} onChange={(event) => { setStateFilter(event.target.value); setPendingPage(1); setReviewedPage(1); }} className={adminFilterControlClassName}>
          <option value="all">{t("ui.recommendations.allStates")}</option>
          {states.map((state) => <option key={state} value={state}>{state}</option>)}
        </select>
        <span className="whitespace-nowrap text-xs font-semibold text-muted-foreground">{t("ui.pagination.perPage", { count: PENDING_PAGE_SIZE })}</span>
        <Button type="button" variant="outline" onClick={clearFilters} disabled={!hasFilters} className="gap-1.5">
          <Filter size={14} /> {t("ui.actions.clear")}
        </Button>
      </AdminFilterBar>

      <section className="mb-6 rounded-2xl border border-border bg-card p-5" aria-label={t("ui.recommendations.rewardClearing.ariaLabel")}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-foreground">{t("ui.recommendations.rewardClearing.title")}</h2>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              {t("ui.recommendations.rewardClearing.description")}
            </p>
          </div>
          <Button type="button" onClick={runRewardClearing} disabled={clearing} className="shrink-0 gap-2">
            {clearing ? <CheckCircle2 size={15} className="animate-pulse" /> : <Play size={15} />}
            {clearing ? t("ui.recommendations.rewardClearing.running") : t("ui.recommendations.rewardClearing.run")}
          </Button>
        </div>
        {clearingMessage && <p className="mt-3 text-xs font-medium text-primary">{clearingMessage}</p>}
      </section>

      <div className="rounded-2xl overflow-hidden border border-border bg-card mb-6" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <div className="flex flex-col gap-3 border-b border-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-bold text-foreground">{t("ui.recommendations.pending", { count: pending.length })}</h2>
          {pendingPageCount > 1 && (
            <nav aria-label={t("ui.recommendations.pendingPagination")} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="mr-1 hidden sm:inline">{t("ui.pagination.pageOf", { page: activePendingPage, total: pendingPageCount })}</span>
              <button
                type="button"
                aria-label={t("ui.pagination.previousPage")}
                onClick={() => setPendingPage((page) => Math.max(1, page - 1))}
                disabled={activePendingPage === 1}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 font-semibold text-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} /> {t("ui.pagination.previous")}
              </button>
              <span className="min-w-20 text-center font-semibold text-foreground sm:hidden">{activePendingPage} / {pendingPageCount}</span>
              <button
                type="button"
                aria-label={t("ui.pagination.nextPage")}
                onClick={() => setPendingPage((page) => Math.min(pendingPageCount, page + 1))}
                disabled={activePendingPage === pendingPageCount}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 font-semibold text-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("ui.pagination.next")} <ChevronRight size={14} />
              </button>
            </nav>
          )}
        </div>
        <div className="flex items-center gap-2 border-b border-border px-6 py-3 text-xs"><input type="checkbox" aria-label={t("ui.recommendations.selectAllPending")} checked={visiblePending.length > 0 && visiblePending.every((recommendation) => selectedPendingIds.has(recommendation.id))} onChange={(event) => setSelectedPendingIds((previous) => { const next = new Set(previous); visiblePending.forEach((recommendation) => event.target.checked ? next.add(recommendation.id) : next.delete(recommendation.id)); return next; })} /><span className="text-muted-foreground">{t("ui.batch.selectAllOnPage")}</span></div>
        <AdminBatchActionBar selectedCount={visiblePending.filter((recommendation) => selectedPendingIds.has(recommendation.id)).length} onClear={() => setSelectedPendingIds(new Set())} onApply={(action) => void applyBatch(action as "approve" | "request_changes" | "reject")} actions={[{ value: "approve", label: t("ui.actions.approve") }, { value: "request_changes", label: t("ui.actions.requestChanges") }, { value: "reject", label: t("ui.actions.reject") }]} busy={batchBusy} />
        {pending.length === 0 ? (
          <EmptyState title={t("ui.recommendations.noPending")} />
        ) : (
          <div className="divide-y divide-border">
            {visiblePending.map((r) => {
              return (
                <div key={r.id} className="px-6 py-4 flex items-center gap-4 flex-wrap">
                  <input type="checkbox" aria-label={t("ui.recommendations.selectRecommendation", { name: r.name })} checked={selectedPendingIds.has(r.id)} onChange={(event) => setSelectedPendingIds((previous) => { const next = new Set(previous); event.target.checked ? next.add(r.id) : next.delete(r.id); return next; })} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{r.name}</p>
                      {r.duplicate && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">{t("ui.recommendations.duplicate")}</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{t("ui.recommendations.contributorLine", { category: r.category, state: r.state, author: r.author?.name ?? t("ui.recommendations.member") })}</span>
                      {r.author && <VerifiedContributorBadge verified={r.author.isKycVerified} />}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-16 h-1.5 rounded-full overflow-hidden bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${r.qualityScore}%`, backgroundColor: r.qualityScore > 70 ? "var(--primary)" : r.qualityScore > 50 ? "var(--accent)" : "var(--destructive)" }}
                      />
                    </div>
                    <span className="text-xs font-bold font-[family-name:var(--font-mono)]" style={{ color: r.qualityScore > 70 ? "var(--primary)" : r.qualityScore > 50 ? "var(--accent)" : "var(--destructive)" }}>
                      {r.qualityScore}
                    </span>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/admin/recommendations/${r.id}`} className="gap-1.5">
                      <Eye size={14} /> {t("ui.actions.viewDetails")}
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        {pending.length > 0 && (
          <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            {t("ui.recommendations.range", { first: (activePendingPage - 1) * PENDING_PAGE_SIZE + 1, last: Math.min(activePendingPage * PENDING_PAGE_SIZE, pending.length), total: pending.length, kind: t("ui.recommendations.pendingLabel") })}
          </div>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden border border-border bg-card" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <div className="flex flex-col gap-3 border-b border-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-bold text-foreground">{t("ui.recommendations.reviewed", { count: reviewed.length })}</h2>
          {reviewedPageCount > 1 && (
            <nav aria-label={t("ui.recommendations.reviewedPagination")} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="mr-1 hidden sm:inline">{t("ui.pagination.pageOf", { page: activeReviewedPage, total: reviewedPageCount })}</span>
              <button
                type="button"
                aria-label={t("ui.pagination.previousPage")}
                onClick={() => setReviewedPage((page) => Math.max(1, page - 1))}
                disabled={activeReviewedPage === 1}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 font-semibold text-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} /> {t("ui.pagination.previous")}
              </button>
              <span className="min-w-20 text-center font-semibold text-foreground sm:hidden">{activeReviewedPage} / {reviewedPageCount}</span>
              <button
                type="button"
                aria-label={t("ui.pagination.nextPage")}
                onClick={() => setReviewedPage((page) => Math.min(reviewedPageCount, page + 1))}
                disabled={activeReviewedPage === reviewedPageCount}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 font-semibold text-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                {t("ui.pagination.next")} <ChevronRight size={14} />
              </button>
            </nav>
          )}
        </div>
        <div className="divide-y divide-border">
          {visibleReviewed.map((r) => (
            <div key={r.id} className="px-6 py-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{r.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("ui.recommendations.reviewedContributorLine", { category: r.category, state: r.state, author: r.author?.name ?? t("ui.recommendations.member") })}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <StatusBadge status={r.status} />
                <Button asChild size="sm" variant="outline">
                  <Link href={`/admin/recommendations/${r.id}`} className="gap-1.5">
                    <Eye size={14} /> {t("ui.actions.viewDetails")}
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
        {reviewed.length > 0 && (
          <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            {t("ui.recommendations.range", { first: (activeReviewedPage - 1) * PENDING_PAGE_SIZE + 1, last: Math.min(activeReviewedPage * PENDING_PAGE_SIZE, reviewed.length), total: reviewed.length, kind: t("ui.recommendations.reviewedLabel") })}
          </div>
        )}
      </div>
    </AdminPageShell>
  );
}
