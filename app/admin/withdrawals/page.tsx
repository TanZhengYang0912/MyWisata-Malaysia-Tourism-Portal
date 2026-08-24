"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Search, ShieldCheck } from "lucide-react";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { AdminFilterBar, adminFilterControlClassName } from "@/components/admin/filter-bar";
import { AdminMetricGrid, AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { WithdrawalReviewQueueRow } from "@/components/admin/withdrawal-review-queue-row";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type { WithdrawalListItem } from "@/lib/wallet/withdrawal-review";

const PAGE_SIZES = [15, 25, 50, 100] as const;
const STATUS_OPTIONS = [
  { value: "review", labelKey: "withdrawals.status.needsReview" },
  ...["pending", "pending_second_approval", "hold", "overdue", "approved", "processing", "paid", "completed", "rejected", "failed"].map((value) => ({ value, labelKey: `withdrawals.status.${value}` })),
];

const ENUM_VALUE_KEYS: Record<string, string> = {
  low: "withdrawals.risk.low",
  review: "withdrawals.risk.review",
  high: "withdrawals.risk.high",
  pending: "withdrawals.status.pending",
  pending_second_approval: "withdrawals.status.pending_second_approval",
  hold: "withdrawals.status.hold",
  overdue: "withdrawals.status.overdue",
  approved: "withdrawals.status.approved",
  processing: "withdrawals.status.processing",
  paid: "withdrawals.status.paid",
  completed: "withdrawals.status.completed",
  rejected: "withdrawals.status.rejected",
  failed: "withdrawals.status.failed",
};

export default function AdminWithdrawalsPage() {
  const { t, i18n } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const { showFeedback } = useActionFeedback();
  const [items, setItems] = useState<WithdrawalListItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(15);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [status, setStatus] = useState("review");
  const [risk, setRisk] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [referenceNow, setReferenceNow] = useState<number | null>(null);

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (status) params.set("status", status);
      if (risk) params.set("risk", risk);
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/admin/withdrawals?${params.toString()}`, { cache: "no-store" });
      const body = await response.json() as { data?: { items: WithdrawalListItem[]; total: number; totalPages: number }; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? t("withdrawals.errors.loadRequests"));
      setItems(body.data.items);
      setTotal(body.data.total);
      setTotalPages(body.data.totalPages);
      setReferenceNow(Date.now());
    } catch (loadError) {
      showFeedback("error", loadError instanceof Error ? loadError.message : t("withdrawals.errors.loadRequests"));
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, risk, search, showFeedback, status, t]);

  useEffect(() => { queueMicrotask(() => { void loadList(); }); }, [loadList]);

  const formatRM = (valueSen: number) => `RM ${(valueSen / 100).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const displayStatus = (value: string | null | undefined) => value
    ? t(ENUM_VALUE_KEYS[value] ?? "withdrawals.status.unknown")
    : t("withdrawals.status.notAssessed");
  const formatAge = (createdAt: string) => {
    const createdAtTime = new Date(createdAt).getTime();
    const hours = Math.max(0, Math.floor(((referenceNow ?? createdAtTime) - createdAtTime) / 3_600_000));
    if (hours < 1) return t("withdrawals.age.lessThanHour");
    if (hours < 24) return t("withdrawals.age.hours", { count: hours });
    return t("withdrawals.age.daysHours", { days: Math.floor(hours / 24), hours: hours % 24 });
  };

  const visiblePayoutValue = items.reduce((sum, item) => sum + item.amountSen, 0);
  const visibleHighRisk = items.filter((item) => item.riskLevel === "high").length;
  const visibleOverdue = items.filter((item) => item.status === "overdue").length;
  const oldestRequest = items.reduce<WithdrawalListItem | null>((oldest, item) => !oldest || new Date(item.createdAt).getTime() < new Date(oldest.createdAt).getTime() ? item : oldest, null);

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={<><ShieldCheck size={14} /> {t("withdrawals.header.eyebrow")}</>}
        title={t("withdrawals.header.title")}
        description={t("withdrawals.header.description")}
        actions={<div className="rounded-xl border border-border bg-card px-4 py-3 text-right shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{t("withdrawals.header.reviewPriority")}</p><p className="mt-1 text-sm font-semibold text-foreground">{total > 0 ? t("withdrawals.header.oldestFirst") : t("withdrawals.header.queueClear")}</p></div>}
      />

      <div aria-label={t("withdrawals.accessibility.reviewSummary")}>
        <AdminMetricGrid items={[
          { label: t("withdrawals.metrics.needsAction"), value: total, detail: t("withdrawals.metrics.requestsInQueue") },
          { label: t("withdrawals.metrics.pendingPayoutValue"), value: formatRM(visiblePayoutValue), detail: t("withdrawals.metrics.visiblePageTotal") },
          { label: t("withdrawals.metrics.highRisk"), value: visibleHighRisk, detail: t("withdrawals.metrics.visiblePageTotal") },
          { label: t("withdrawals.metrics.overdue"), value: visibleOverdue, detail: oldestRequest ? t("withdrawals.metrics.oldestRequest", { age: formatAge(oldestRequest.createdAt) }) : t("withdrawals.metrics.noOverdueRequests") },
        ]} />
      </div>

      <AdminFilterBar>
        <div className="relative min-w-[220px] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { setPage(1); void loadList(); } }} placeholder={t("withdrawals.filters.searchCustomerOrEmail")} className={`${adminFilterControlClassName} w-full pl-9`} /></div>
        <select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className={adminFilterControlClassName}><option value="">{t("withdrawals.filters.allStatuses")}</option>{STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{t(item.labelKey)}</option>)}</select>
        <select value={risk} onChange={(event) => { setRisk(event.target.value); setPage(1); }} className={adminFilterControlClassName}><option value="">{t("withdrawals.filters.allRiskLevels")}</option><option value="low">{t("withdrawals.risk.low")}</option><option value="review">{t("withdrawals.risk.review")}</option><option value="high">{t("withdrawals.risk.high")}</option></select>
        <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number]); setPage(1); }} className={adminFilterControlClassName}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{t("withdrawals.filters.perPage", { count: size })}</option>)}</select>
      </AdminFilterBar>

      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_10px_rgba(1,0,102,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><h2 className="font-bold text-foreground">{t("withdrawals.queue.title", { count: total })}</h2><p className="mt-1 text-xs text-muted-foreground">{t("withdrawals.queue.description")}</p></div><span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{oldestRequest ? t("withdrawals.queue.oldestRequest", { age: formatAge(oldestRequest.createdAt) }) : t("withdrawals.queue.noOpenRequests")}</span></div>
        <div className="overflow-x-auto">
          <div className="min-w-[940px]">
            <div className="grid grid-cols-[minmax(210px,1.35fr)_120px_145px_150px_120px_145px_32px] items-center gap-4 border-b border-border bg-muted/30 px-5 py-3 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground"><span>{t("withdrawals.table.customer")}</span><span>{t("withdrawals.table.amount")}</span><span>{t("withdrawals.table.riskPriority")}</span><span>{t("withdrawals.table.approvalProgress")}</span><span>{t("withdrawals.table.ageSla")}</span><span>{t("withdrawals.table.status")}</span><span aria-hidden="true" /></div>
            {loading && items.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">{t("withdrawals.loading")}</div> : items.length === 0 ? <EmptyState title={t("withdrawals.empty.noRequests")} /> : <div className="divide-y divide-border">{items.map((item) => <WithdrawalReviewQueueRow key={item.id} item={item} locale={locale} t={(key, options) => t(key, options)} formatAmount={formatRM} formatAge={formatAge} displayStatus={displayStatus} />)}</div>}
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-border px-5 py-3 text-xs text-muted-foreground"><span>{t("withdrawals.pagination.pageOf", { page, totalPages: Math.max(totalPages, 1) })}</span>{totalPages > 1 && <div className="flex gap-2"><Button size="sm" variant="outline" aria-label={tCommon("accessibility.previousPage")} disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={14} /></Button><Button size="sm" variant="outline" aria-label={tCommon("accessibility.nextPage")} disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight size={14} /></Button></div>}</div>
      </section>
    </AdminPageShell>
  );
}
