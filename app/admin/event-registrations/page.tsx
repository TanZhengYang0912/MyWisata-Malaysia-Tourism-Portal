"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, RefreshCw, ClipboardCheck, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Pagination } from "@/components/shared/pagination";
import { AdminFilterBar, adminFilterControlClassName } from "@/components/admin/filter-bar";
import { AdminMetricGrid, AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusBadge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";

import { useVisibleReviewRefresh } from "@/hooks/use-visible-review-refresh";

interface AdminCampaignRegistration {
  id: string;
  campaignId: string;
  campaignTitle: string;
  locationName: string;
  vendorId: string;
  vendorName: string;
  stallNumber: string;
  requestedStallNumber?: string | null;
  status: "pending" | "approved" | "rejected" | "changes_requested";
  createdAt: string;
}

type StatusFilter = "all" | AdminCampaignRegistration["status"];

export default function EventRegistrationsPage() {
  const { t } = useTranslation("admin");
  const [registrations, setRegistrations] = useState<AdminCampaignRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [counts, setCounts] = useState<Record<string, number>>({});

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!signal) setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), search });
      if (statusFilter !== "all") params.set("status", statusFilter);
      const response = await fetch(`/api/admin/event-registrations?${params}`, { cache: "no-store", signal });
      if (response.status === 401 || response.status === 403) { setRegistrations([]); throw Object.assign(new Error(t("reviewRefresh.denied")), { status: response.status }); }
      if (response.status === 403 || response.status === 401) setRegistrations([]);
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message ?? t("eventRegistrations.errors.load"));
      setRegistrations(body.data?.registrations ?? []);
      setTotal(body.data?.total ?? 0);
      setTotalPages(body.data?.totalPages ?? 0);
      setCounts(body.data?.counts ?? {});
      if (body.data?.page && body.data.page !== page) setPage(body.data.page);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("eventRegistrations.errors.load"));
      if (signal) throw err;
    } finally {
      if (!signal) setLoading(false);
    }
  }, [t, page, pageSize, search, statusFilter]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  const visible = registrations;
  const reviewRefresh = useVisibleReviewRefresh({ enabled: true, onRefresh: load });

  return (
    <AdminPageShell>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><Button type="button" size="sm" variant="outline" onClick={reviewRefresh.refresh}>{t("actions.refresh")}</Button><span role="status">{reviewRefresh.hasRefreshError ? t("reviewRefresh.stale") : t("dashboard.lastRefreshed")} · {reviewRefresh.lastSuccessAt ? new Date(reviewRefresh.lastSuccessAt).toLocaleTimeString() : "—"}</span></div>
      <AdminPageHeader
        eyebrow={<><ClipboardCheck size={18} /> {t("eventRegistrations.eyebrow")}</>}
        title={t("eventRegistrations.title")}
        description={t("eventRegistrations.description")}
      />
      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      <AdminMetricGrid items={[
        { label: t("eventRegistrations.metrics.pending"), value: counts.pending ?? 0 },
        { label: t("eventRegistrations.metrics.changesRequested"), value: counts.changes_requested ?? 0 },
        { label: t("eventRegistrations.metrics.approved"), value: counts.approved ?? 0 },
        { label: t("eventRegistrations.metrics.total"), value: counts.all ?? 0 },
      ]} />

      <AdminFilterBar>
        <label className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder={t("eventRegistrations.filters.search")} aria-label={t("eventRegistrations.filters.search")} className={`${adminFilterControlClassName} w-full pl-9`} />
        </label>
        <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value as StatusFilter); setPage(1); }} aria-label={t("eventRegistrations.filters.status")} className={adminFilterControlClassName}>
          <option value="all">{t("eventRegistrations.filters.allStatuses")}</option>
          <option value="pending">{t("eventRegistrations.status.pending")}</option>
          <option value="changes_requested">{t("eventRegistrations.status.changesRequested")}</option>
          <option value="approved">{t("eventRegistrations.status.approved")}</option>
          <option value="rejected">{t("eventRegistrations.status.rejected")}</option>
        </select>
        <select aria-label={t("catalogue.pagination.pageSize")} className={adminFilterControlClassName} value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>{[10,25,50].map(size => <option key={size} value={size}>{t("ui.pagination.perPage", { count: size })}</option>)}</select>
        <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw size={14} />{t("actions.refresh")}</Button>
      </AdminFilterBar>

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t("eventRegistrations.loading")}</p>
        ) : visible.length === 0 ? (
          <EmptyState icon={<ClipboardCheck size={28} />} title={t("eventRegistrations.empty.title")} description={t("eventRegistrations.empty.description")} />
        ) : (
          <div className="divide-y divide-border">
            {visible.map((registration) => (
              <Link
                key={registration.id}
                href={`/admin/event-registrations/${registration.id}`}
                className="flex items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-secondary/40"
              >
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{registration.vendorName}</p>
                  <p className="text-xs text-muted-foreground">{registration.campaignTitle} · {registration.locationName} · {registration.status === "pending" || registration.status === "changes_requested" || registration.status === "rejected"
                    ? t("eventRegistrations.preferredStall", { number: registration.requestedStallNumber || t("eventRegistrations.adminAllocate") })
                    : t("eventRegistrations.stallLabel", { number: registration.stallNumber })}</p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <StatusBadge status={registration.status} />
                  <ChevronRight size={16} className="text-muted-foreground" aria-hidden="true" />
                </div>
              </Link>
            ))}
          </div>
        )}
        <Pagination currentPage={page} totalPages={totalPages} totalItems={total} pageSize={pageSize} onPageChange={setPage} disabled={loading} className="mt-0 border-t border-border px-5 py-3" />
      </section>
    </AdminPageShell>
  );
}
