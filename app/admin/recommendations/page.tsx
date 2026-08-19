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

const PENDING_PAGE_SIZE = 10;

export default function AdminRecommendationsPage() {
  const { currentUser } = useAuth();
  const { showFeedback } = useActionFeedback();
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
        const message = body?.error?.message ?? 'Unable to clear recommendation rewards.';
        setError(message);
        showFeedback('error', message);
        return;
      }
      const result = body?.data ?? {};
      const message = `Cleared ${result.cleared?.length ?? 0}, reversed ${result.reversed?.length ?? 0}, and kept ${result.skipped ?? 0} pending.`;
      setClearingMessage(message);
      showFeedback('success', message);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to clear recommendation rewards.';
      setError(message);
      showFeedback('error', message);
    } finally {
      setClearing(false);
    }
  }

  async function applyBatch(action: "approve" | "request_changes" | "reject") {
    const selected = visiblePending.filter((recommendation) => selectedPendingIds.has(recommendation.id));
    if (!selected.length || batchBusy) return;
    const reason = action === "approve" ? undefined : window.prompt(action === "reject" ? "Reason for rejecting all selected recommendations (at least 10 characters):" : "What needs to be changed for all selected recommendations? (at least 10 characters):")?.trim();
    if (action !== "approve" && (!reason || reason.length < 10)) {
      setError("Batch reject/request changes requires a reason of at least 10 characters.");
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
        throw new Error(body.error?.message ?? "One or more recommendation reviews failed.");
      }
      setSelectedPendingIds(new Set());
      showFeedback("success", `${selected.length} recommendations processed.`);
      setRecs(await getVendorRecommendations());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Batch recommendation review failed.";
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
    <div className="min-h-full bg-background px-4 py-6 sm:px-6 sm:py-8 xl:px-8">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.04em] text-foreground sm:text-4xl">Recommendation Moderation</h1>
      <p className="text-xs text-muted-foreground mb-2">Community-submitted vendors and hidden gems.</p>
      <p className="mb-6 max-w-2xl text-xs text-muted-foreground">Approve quality recommendations for outreach. Approval does not publish a vendor; link the approved recommendation from Vendor Management after the vendor joins so attribution and commission remain attached.</p>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-destructive/10 text-destructive text-sm">{error}</div>
      )}

      <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center">
        <label className="relative min-w-0 flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => { setSearch(event.target.value); setPendingPage(1); setReviewedPage(1); }}
            placeholder="Search recommendation, category, state or contributor…"
            className="h-11 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          />
        </label>
        <select value={categoryFilter} onChange={(event) => { setCategoryFilter(event.target.value); setPendingPage(1); setReviewedPage(1); }} className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground">
          <option value="all">All categories</option>
          {categories.map((category) => <option key={category} value={category}>{category}</option>)}
        </select>
        <select value={stateFilter} onChange={(event) => { setStateFilter(event.target.value); setPendingPage(1); setReviewedPage(1); }} className="h-11 rounded-xl border border-border bg-background px-3 text-sm text-foreground">
          <option value="all">All states</option>
          {states.map((state) => <option key={state} value={state}>{state}</option>)}
        </select>
        <span className="whitespace-nowrap text-xs font-semibold text-muted-foreground">10 per page</span>
        <Button type="button" variant="outline" onClick={clearFilters} disabled={!hasFilters} className="gap-1.5">
          <Filter size={14} /> Clear
        </Button>
      </div>

      <section className="mb-6 rounded-2xl border border-border bg-card p-5" aria-label="Recommendation reward clearing">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-foreground">Recommendation reward clearing</h2>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">
              Moves seven-day pending rewards to available earnings only after KYC approval. Cancelled or refunded orders are reversed automatically.
            </p>
          </div>
          <Button type="button" onClick={runRewardClearing} disabled={clearing} className="shrink-0 gap-2">
            {clearing ? <CheckCircle2 size={15} className="animate-pulse" /> : <Play size={15} />}
            {clearing ? 'Running…' : 'Run reward clearing'}
          </Button>
        </div>
        {clearingMessage && <p className="mt-3 text-xs font-medium text-primary">{clearingMessage}</p>}
      </section>

      <div className="rounded-2xl overflow-hidden border border-border bg-card mb-6" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <div className="flex flex-col gap-3 border-b border-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-bold text-foreground">Pending ({pending.length})</h2>
          {pendingPageCount > 1 && (
            <nav aria-label="Pending recommendation pagination" className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="mr-1 hidden sm:inline">Page {activePendingPage} of {pendingPageCount}</span>
              <button
                type="button"
                aria-label="Previous pending recommendation page"
                onClick={() => setPendingPage((page) => Math.max(1, page - 1))}
                disabled={activePendingPage === 1}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 font-semibold text-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <span className="min-w-20 text-center font-semibold text-foreground sm:hidden">{activePendingPage} / {pendingPageCount}</span>
              <button
                type="button"
                aria-label="Next pending recommendation page"
                onClick={() => setPendingPage((page) => Math.min(pendingPageCount, page + 1))}
                disabled={activePendingPage === pendingPageCount}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 font-semibold text-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next <ChevronRight size={14} />
              </button>
            </nav>
          )}
        </div>
        <div className="flex items-center gap-2 border-b border-border px-6 py-3 text-xs"><input type="checkbox" aria-label="Select all visible pending recommendations" checked={visiblePending.length > 0 && visiblePending.every((recommendation) => selectedPendingIds.has(recommendation.id))} onChange={(event) => setSelectedPendingIds((previous) => { const next = new Set(previous); visiblePending.forEach((recommendation) => event.target.checked ? next.add(recommendation.id) : next.delete(recommendation.id)); return next; })} /><span className="text-muted-foreground">Select all on this page</span></div>
        <AdminBatchActionBar selectedCount={visiblePending.filter((recommendation) => selectedPendingIds.has(recommendation.id)).length} onClear={() => setSelectedPendingIds(new Set())} onApply={(action) => void applyBatch(action as "approve" | "request_changes" | "reject")} actions={[{ value: "approve", label: "Approve" }, { value: "request_changes", label: "Request changes" }, { value: "reject", label: "Reject" }]} busy={batchBusy} />
        {pending.length === 0 ? (
          <EmptyState title="No pending recommendations" />
        ) : (
          <div className="divide-y divide-border">
            {visiblePending.map((r) => {
              return (
                <div key={r.id} className="px-6 py-4 flex items-center gap-4 flex-wrap">
                  {/* eslint-disable-next-line @typescript-eslint/no-unused-expressions */}
                  <input type="checkbox" aria-label={`Select recommendation ${r.name}`} checked={selectedPendingIds.has(r.id)} onChange={(event) => setSelectedPendingIds((previous) => { const next = new Set(previous); event.target.checked ? next.add(r.id) : next.delete(r.id); return next; })} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{r.name}</p>
                      {r.duplicate && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-destructive/15 text-destructive">Duplicate</span>}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Customer recommendation · {r.category} · {r.state} · by {r.author?.name ?? "MyWisata member"}</span>
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
                      <Eye size={14} /> View details
                    </Link>
                  </Button>
                </div>
              );
            })}
          </div>
        )}
        {pending.length > 0 && (
          <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            Showing {(activePendingPage - 1) * PENDING_PAGE_SIZE + 1}–{Math.min(activePendingPage * PENDING_PAGE_SIZE, pending.length)} of {pending.length} pending recommendations
          </div>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden border border-border bg-card" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <div className="flex flex-col gap-3 border-b border-border px-6 py-5 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-bold text-foreground">Reviewed ({reviewed.length})</h2>
          {reviewedPageCount > 1 && (
            <nav aria-label="Reviewed recommendation pagination" className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="mr-1 hidden sm:inline">Page {activeReviewedPage} of {reviewedPageCount}</span>
              <button
                type="button"
                aria-label="Previous reviewed recommendation page"
                onClick={() => setReviewedPage((page) => Math.max(1, page - 1))}
                disabled={activeReviewedPage === 1}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 font-semibold text-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft size={14} /> Previous
              </button>
              <span className="min-w-20 text-center font-semibold text-foreground sm:hidden">{activeReviewedPage} / {reviewedPageCount}</span>
              <button
                type="button"
                aria-label="Next reviewed recommendation page"
                onClick={() => setReviewedPage((page) => Math.min(reviewedPageCount, page + 1))}
                disabled={activeReviewedPage === reviewedPageCount}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 font-semibold text-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next <ChevronRight size={14} />
              </button>
            </nav>
          )}
        </div>
        <div className="divide-y divide-border">
          {visibleReviewed.map((r) => (
            <div key={r.id} className="px-6 py-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm text-foreground">{r.name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{r.category} · {r.state} · by {r.author?.name ?? "MyWisata member"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <StatusBadge status={r.status} />
                <Button asChild size="sm" variant="outline">
                  <Link href={`/admin/recommendations/${r.id}`} className="gap-1.5">
                    <Eye size={14} /> View details
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
        {reviewed.length > 0 && (
          <div className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
            Showing {(activeReviewedPage - 1) * PENDING_PAGE_SIZE + 1}–{Math.min(activeReviewedPage * PENDING_PAGE_SIZE, reviewed.length)} of {reviewed.length} reviewed recommendations
          </div>
        )}
      </div>
    </div>
  );
}
