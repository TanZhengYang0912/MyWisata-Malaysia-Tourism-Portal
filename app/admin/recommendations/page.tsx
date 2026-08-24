"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Eye, Filter, Gift, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AdminFilterBar, adminFilterControlClassName } from "@/components/admin/filter-bar";
import { AdminMetricGrid, AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { useAuth } from "@/components/providers/auth";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/shared/status-badge";
import { VerifiedContributorBadge } from "@/components/shared/verified-contributor-badge";
import { Button } from "@/components/ui/button";

const PAGE_SIZE = 10;

type RecommendationListItem = {
  id: string;
  name: string;
  categoryId: string | null;
  category: string;
  state: string;
  status: string;
  createdAt: string;
  ageHours: number;
  slaState: "within_sla" | "due_soon" | "overdue";
  author: { id: string; name: string; isKycVerified: boolean };
  assignee: { id: string; name: string; claimedAt: string | null } | null;
  availableActions: string[];
};

type RecommendationListResponse = {
  items: RecommendationListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  counts: { pending: number; reviewed: number; approved: number; rejected: number };
  facets: { categories: Array<{ id: string; name: string }>; states: string[] };
};

const EMPTY_RESPONSE: RecommendationListResponse = {
  items: [], total: 0, page: 1, pageSize: PAGE_SIZE, totalPages: 0,
  counts: { pending: 0, reviewed: 0, approved: 0, rejected: 0 },
  facets: { categories: [], states: [] },
};

export default function AdminRecommendationsPage() {
  const { currentUser } = useAuth();
  const { t } = useTranslation("admin");
  const [data, setData] = useState<RecommendationListResponse>(EMPTY_RESPONSE);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("pending");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [state, setState] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRecommendations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), status });
      if (search.trim()) params.set("search", search.trim());
      if (categoryId) params.set("categoryId", categoryId);
      if (state) params.set("state", state);
      const response = await fetch(`/api/admin/recommendations?${params.toString()}`, { cache: "no-store" });
      const body = await response.json() as { data?: RecommendationListResponse; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? t("ui.recommendations.loadError"));
      setData(body.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t("ui.recommendations.loadError"));
    } finally {
      setLoading(false);
    }
  }, [categoryId, page, search, state, status, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRecommendations(); }, 250);
    return () => window.clearTimeout(timer);
  }, [loadRecommendations]);

  useEffect(() => {
    if (currentUser?.role === "super_admin") {
      void fetch("/api/admin/recommendations/mark-seen", { method: "POST" }).catch(() => undefined);
    }
  }, [currentUser?.role]);

  function clearFilters() {
    setSearch(""); setCategoryId(""); setState(""); setStatus("pending"); setPage(1);
  }

  const hasFilters = Boolean(search.trim() || categoryId || state || status !== "pending");

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={<span className="flex items-center gap-2"><CheckCircle2 size={14} /> {t("ui.recommendations.eyebrow")}</span>}
        title={t("ui.recommendations.title")}
        description={t("ui.recommendations.description")}
        actions={<Button asChild variant="outline"><Link href="/admin/recommendations/rewards" className="gap-2"><Gift size={15} /> {t("ui.recommendations.rewardClearing.operations")}</Link></Button>}
      />

      <AdminMetricGrid items={[
        { label: t("ui.recommendations.pendingLabel"), value: data.counts.pending },
        { label: t("ui.recommendations.reviewedLabel"), value: data.counts.reviewed },
        { label: t("filters.approved"), value: data.counts.approved },
        { label: t("filters.rejected"), value: data.counts.rejected },
      ]} />

      {error && <div role="alert" className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <AdminFilterBar>
        <label className="relative min-w-[220px] flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("ui.recommendations.searchPlaceholder")} className={`${adminFilterControlClassName} w-full pl-9`} />
        </label>
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className={adminFilterControlClassName}>
          <option value="pending">{t("ui.recommendations.pendingLabel")}</option>
          <option value="reviewed">{t("ui.recommendations.reviewedLabel")}</option>
          <option value="all">{t("ui.recommendations.allStatuses")}</option>
        </select>
        <select value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setPage(1); }} className={adminFilterControlClassName}>
          <option value="">{t("ui.recommendations.allCategories")}</option>
          {data.facets.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </select>
        <select value={state} onChange={(event) => { setState(event.target.value); setPage(1); }} className={adminFilterControlClassName}>
          <option value="">{t("ui.recommendations.allStates")}</option>
          {data.facets.states.map((stateName) => <option key={stateName} value={stateName}>{stateName}</option>)}
        </select>
        <Button type="button" variant="outline" onClick={clearFilters} disabled={!hasFilters} className="gap-1.5"><Filter size={14} /> {t("ui.actions.clear")}</Button>
      </AdminFilterBar>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_10px_rgba(1,0,102,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div><h2 className="font-bold text-foreground">{t("ui.recommendations.queueTitle", { count: data.total })}</h2><p className="mt-1 text-xs text-muted-foreground">{t("ui.recommendations.queueDescription")}</p></div>
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{t("ui.pagination.pageOf", { page, total: Math.max(data.totalPages, 1) })}</span>
        </div>

        {loading && data.items.length === 0 ? <p className="p-8 text-center text-sm text-muted-foreground">{t("ui.states.loadingEllipsis")}</p> : data.items.length === 0 ? <EmptyState title={t("ui.recommendations.noResults")} /> : (
          <div className="divide-y divide-border">
            {data.items.map((r) => (
              <article key={r.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">{r.name}</p><StatusBadge status={r.status} />
                    {r.slaState !== "within_sla" && <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800">{t(`ui.recommendations.sla.${r.slaState}`, { hours: r.ageHours })}</span>}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><span>{t("ui.recommendations.contributorLine", { category: r.category, state: r.state, author: r.author.name })}</span><VerifiedContributorBadge verified={r.author.isKycVerified} /></div>
                  <p className="mt-1 text-xs text-muted-foreground">{r.assignee ? t("ui.recommendations.assignedTo", { name: r.assignee.name }) : t("ui.recommendations.unassigned")}</p>
                </div>
                <Button asChild size="sm" variant="outline"><Link href={`/admin/recommendations/${r.id}`} className="gap-1.5"><Eye size={14} /> {t("ui.actions.viewDetails")}</Link></Button>
              </article>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-border px-5 py-3">
          <span className="text-xs text-muted-foreground">{t("ui.recommendations.range", { first: data.total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1, last: Math.min(page * PAGE_SIZE, data.total), total: data.total, kind: t("ui.recommendations.queueItems") })}</span>
          <div className="flex gap-2"><Button size="sm" variant="outline" aria-label={t("ui.pagination.previousPage")} disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={14} /></Button><Button size="sm" variant="outline" aria-label={t("ui.pagination.nextPage")} disabled={page >= data.totalPages || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight size={14} /></Button></div>
        </div>
      </section>
    </AdminPageShell>
  );
}
