"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Download, RefreshCw, Scale } from "lucide-react";
import { useAppDialog } from "@/components/providers/app-dialog";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { formatMYRFromSen } from "@/lib/i18n/format";
import { csvRow } from "@/lib/admin/csv";
import { AdminFilterBar, adminFilterControlClassName } from "@/components/admin/filter-bar";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { malaysiaDateTimeLocalToIso } from '@/lib/datetime/malaysia';
import { filterOrderReconciliationRows, summarizeOrderReconciliationRows, formatReconciliationSen, type ReconciliationFilters } from '@/lib/admin/reconciliation-filtering';
import { DEFAULT_EVENT_OPERATIONS_FILTERS, EVENT_CASE_KINDS, EVENT_CASE_HANDLING, EVENT_CASE_OWNERS, EVENT_CASE_DEADLINES, type EventOperationsFilters } from '@/lib/admin/event-operations-filters';
import { paginateStaffConductRecords } from "@/components/admin/staff-conduct-filtering";
import type { OrderReconciliation, EventOperations } from "@/lib/admin/reconciliation";
import { PlatformFundsPanel } from "@/components/admin/platform-funds-panel";

const PAGE_SIZES = [15, 25, 50] as const;

function currentMonth() {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return `${p.find((x) => x.type === "year")?.value}-${p.find((x) => x.type === "month")?.value}`;
}

function futureDeadlineIso(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const iso = malaysiaDateTimeLocalToIso(value);
    return Date.parse(iso) > Date.now() ? iso : null;
  } catch {
    return null;
  }
}

export default function ReconciliationPage() {
  const { prompt, confirm } = useAppDialog();
  const { t, i18n } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const locale = i18n.language === "zh-CN" ? "zh-CN" : i18n.language === "ms" ? "ms-MY" : "en-MY";
  const [period, setPeriod] = useState(currentMonth);
  const [data, setData] = useState<(OrderReconciliation & { eventOperations: EventOperations }) | null>(null);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<ReconciliationFilters>({ search: '', status: 'all', net: 'all' });
  const [financialPage, setFinancialPage] = useState(1);
  const [financialPageSize, setFinancialPageSize] = useState<(typeof PAGE_SIZES)[number]>(15);
  const [caseFilters, setCaseFilters] = useState<EventOperationsFilters>(DEFAULT_EVENT_OPERATIONS_FILTERS);
  const [caseSearchInput, setCaseSearchInput] = useState('');
  const [loadedKey, setLoadedKey] = useState('');
  const controllerRef = useRef<AbortController | null>(null);
  const requestKey = new URLSearchParams({ period, ...Object.fromEntries(Object.entries(caseFilters).map(([key, value]) => [key, String(value)])) }).toString();
  const [dueDates, setDueDates] = useState<Record<string, string>>({});
  const [busyCase, setBusyCase] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setLoading(true);
    setError("");
    setActionError("");
    try {
      const res = await fetch(`/api/admin/reconciliation?${requestKey}`, { cache: "no-store", signal: controller.signal });
      const body = (await res.json()) as { data?: OrderReconciliation & { eventOperations: EventOperations }; error?: { message?: string } };
      if (controller.signal.aborted) return;
      if (!res.ok || !body.data) throw new Error(body.error?.message ?? t("reconciliation.errors.load"));
      setData(body.data);
      setLoadedKey(requestKey);
    } catch (err) {
      if (!controller.signal.aborted) setError(err instanceof Error ? err.message : t("reconciliation.errors.load"));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [requestKey, t]);

  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; controllerRef.current?.abort(); };
  }, [load]);

  const ready = !!data && loadedKey === requestKey && !loading && !error;
  const filteredRows = filterOrderReconciliationRows(data?.rows ?? [], filters);
  const filteredReport = { rows: filteredRows, totals: summarizeOrderReconciliationRows(filteredRows) };
  const pagedRows = paginateStaffConductRecords(filteredRows, financialPage, financialPageSize);
  useEffect(() => {
    if (financialPage === pagedRows.page) return;
    let active = true;
    queueMicrotask(() => { if (active) setFinancialPage(pagedRows.page); });
    return () => { active = false; };
  }, [financialPage, pagedRows.page]);
  function changeFinancialFilter<K extends keyof ReconciliationFilters>(key: K, value: ReconciliationFilters[K]) {
    setFilters((old) => ({ ...old, [key]: value }));
    setFinancialPage(1);
  }
  const statusOptions = [...new Set((data?.rows ?? []).map((row) => row.status))].sort();
  function statusLabel(status: string) {
    const key = `orderOperations.statuses.${status}`;
    return i18n.exists(key, { ns: 'admin' }) ? t(key) : t('reconciliation.filters.unknownStatus');
  }
  function changeCaseFilter<K extends keyof EventOperationsFilters>(key: K, value: EventOperationsFilters[K]) {
    setCaseFilters((old) => ({ ...old, [key]: value, casePage: 1 }));
  }

  async function claimCase(row: EventOperations['cases'][number]) {
    const dueAt = futureDeadlineIso(dueDates[row.id]);
    if (!dueAt) { setActionError(t('eventOperations.dueRequired')); return; }
    setActionError('');
    setBusyCase(row.id);
    try {
      const response = await fetch(`/api/admin/reconciliation/event-exceptions/${row.id}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'claim', version: row.version, dueAt }),
      });
      if (!response.ok) throw new Error(t('eventOperations.conflict'));
      await load();
    } catch { setActionError(t('eventOperations.conflict')); } finally { setBusyCase(null); }
  }

  async function refreshPickups() {
    setActionError('');
    setBusyCase('refresh');
    try {
      const response = await fetch('/api/admin/reconciliation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'refresh_overdue' }) });
      if (!response.ok) throw new Error(t('eventOperations.conflict'));
      await load();
    } catch { setActionError(t('eventOperations.conflict')); } finally { setBusyCase(null); }
  }

  async function closePickupCase(row: EventOperations['cases'][number], action: 'resolve' | 'confirm_no_show') {
    const note = (await prompt(t(action === 'confirm_no_show' ? 'eventOperations.noShowNote' : 'eventOperations.resolveNote')))?.trim();
    if (!note || note.length < (action === 'confirm_no_show' ? 20 : 5)) return;
    if (action === 'confirm_no_show' && !await confirm(t('eventOperations.noShowConfirm'))) return;
    setActionError('');
    setBusyCase(row.id);
    try {
      const response = await fetch(`/api/admin/reconciliation/event-exceptions/${row.id}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, version: row.version, note }),
      });
      if (!response.ok) throw new Error(t('eventOperations.conflict'));
      await load();
    } catch { setActionError(t('eventOperations.conflict')); } finally { setBusyCase(null); }
  }

  function downloadCsv() {
    if (!ready || !filteredReport.rows.length) return;
    const header = ["order", "status", "paid_at", "gross_rm", "platform_fee_rm", "vendor_net_rm", "affiliate_rm", "recommendation_rm", "platform_net_rm"];
    const lines = filteredReport.rows.map((r) => csvRow([
      r.orderDisplayId ?? t('reconciliation.filters.orderWithoutNumber'), r.status, r.paidAt ?? "",
      (r.grossSen / 100).toFixed(2), (r.platformFeeSen / 100).toFixed(2), (r.vendorNetSen / 100).toFixed(2),
      (r.affiliatePayoutSen / 100).toFixed(2), (r.recommendationPayoutSen / 100).toFixed(2), (r.platformNetSen / 100).toFixed(2),
    ]));
    const blob = new Blob([[csvRow(header), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `reconciliation-${period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const metrics: [string, number][] = ready ? [
    [t("reconciliation.metrics.gross"), filteredReport.totals.grossSen],
    [t("reconciliation.metrics.platformFee"), filteredReport.totals.platformFeeSen],
    [t("reconciliation.metrics.vendorNet"), filteredReport.totals.vendorNetSen],
    [t("reconciliation.metrics.affiliate"), filteredReport.totals.affiliatePayoutSen],
    [t("reconciliation.metrics.recommendation"), filteredReport.totals.recommendationPayoutSen],
    [t("reconciliation.metrics.platformNet"), filteredReport.totals.platformNetSen],
  ] : [];

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={<span className="flex items-center gap-2"><Scale size={14} /> {t("reconciliation.eyebrow")}</span>}
        title={t("reconciliation.title")}
      />

      <PlatformFundsPanel />

      {(error || actionError) && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error || actionError}</p>}

      {data?.eventOperations && (
        <section className="mt-5 space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-lg font-semibold">{t('eventOperations.title')}</h2>
          <p className="text-sm text-muted-foreground">{t('eventOperations.summary', {
            open: data.eventOperations.summary.open, unassigned: data.eventOperations.summary.unassigned,
            undated: data.eventOperations.summary.undated, overdue: data.eventOperations.summary.overdue,
            amount: formatMYRFromSen(data.eventOperations.summary.outstandingSen),
          })}</p>
          <Button variant="outline" disabled={loading || busyCase !== null} onClick={() => void refreshPickups()}>{t('eventOperations.refreshPickups')}</Button>
          {data.eventOperations.jobs.map((job) => (
            <p key={job.jobKey} className="text-sm">
              {job.jobKey === 'expire_checkout_sessions' ? t('eventOperations.expiryJob') : t('eventOperations.refundJob')}: {' '}
              {({ never_run: t('eventOperations.neverRun'), running: t('eventOperations.running'), failed: t('eventOperations.failed'),
                stale: t('eventOperations.stale'), succeeded: t('eventOperations.healthy') })[job.status]}
              {job.finishedAt && ` · ${new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'short', timeStyle: 'short' }).format(new Date(job.finishedAt))}`}
            </p>
          ))}
          <AdminFilterBar>
            <form className="flex min-w-[220px] flex-1 flex-wrap items-end gap-2.5" onSubmit={(event) => { event.preventDefault(); changeCaseFilter('caseSearch', caseSearchInput.trim()); }}>
              <label className="min-w-[220px] flex-1 text-sm"><span className="mb-1.5 block">{t('eventOperations.filters.search')}</span>
                <input value={caseSearchInput} onChange={(event) => setCaseSearchInput(event.target.value)} maxLength={100} className={`${adminFilterControlClassName} w-full`} />
              </label>
              <Button type="submit">{t('orderOperations.search')}</Button>
            </form>
            {([
              ['caseKind', EVENT_CASE_KINDS], ['caseHandling', EVENT_CASE_HANDLING],
              ['caseOwner', EVENT_CASE_OWNERS], ['caseDeadline', EVENT_CASE_DEADLINES],
            ] as const).map(([key, values]) => (
              <label key={key} className="text-sm"><span className="mb-1.5 block">{t(`eventOperations.filters.labels.${key}`)}</span>
                <select className={adminFilterControlClassName} aria-label={t(`eventOperations.filters.labels.${key}`)} value={caseFilters[key]} onChange={(event) => changeCaseFilter(key, event.target.value as EventOperationsFilters[typeof key])}>
                  {values.map((value) => <option key={value} value={value}>{t(`eventOperations.filters.${key}.${value}`)}</option>)}
                </select>
              </label>
            ))}
            <Button variant="outline" onClick={() => { setCaseSearchInput(''); setCaseFilters(DEFAULT_EVENT_OPERATIONS_FILTERS); }}>{t('reconciliation.filters.clear')}</Button>
            <Button variant="outline" disabled={loading} onClick={() => void load()}><RefreshCw size={15} />{t('reconciliation.reload')}</Button>
          </AdminFilterBar>
          {loading && <p role="status" className="text-sm text-muted-foreground">{t('reconciliation.loading')}</p>}
          {ready && <p className="text-sm">{t('eventOperations.filters.matching', { count: data.eventOperations.total, amount: formatMYRFromSen(data.eventOperations.matchingOutstandingSen) })}</p>}
          {ready && data.eventOperations.cases.length === 0 && <p className="text-sm text-muted-foreground">{t('eventOperations.filters.noMatches')}</p>}
          {ready && data.eventOperations.cases.map((row) => (
            <div key={row.id} className="space-y-2 rounded-xl border border-border p-4">
              <p className="font-semibold">{row.orderNumber ?? t('eventOperations.orderWithoutNumber')} · {formatMYRFromSen(row.outstandingSen)}</p>
              <p className="text-sm">{t(`eventOperations.filters.caseHandling.${row.handling}`)}</p>
              <p className="text-sm">{row.kind === 'payment_unfulfillable' ? t('eventOperations.paymentException') : row.kind === 'pickup_overdue' ? t('eventOperations.pickupOverdue') : t('eventOperations.refundAttention')}</p>
              {['checkout_eligibility_lost', 'checkout_hold_expired'].includes(row.reasonCode) && <p className="text-sm text-muted-foreground">{t(`eventOperations.${row.reasonCode}`)}</p>}
              <p className="text-sm text-muted-foreground">{t('eventOperations.owner')}: {row.assignedName ?? t('eventOperations.unassigned')}
                {' · '}{row.dueAt ? new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.dueAt)) : t('eventOperations.undated')}
                {row.overdue && <span className="ml-2 text-destructive">{t('eventOperations.overdue')}</span>}
              </p>
              {row.kind === 'pickup_overdue' && row.pickupItems?.map((item, index) => <p key={index} className="text-sm text-muted-foreground">{item.quantity} × {item.name} · {item.vendorName} · {item.pickupDate} · {item.pickupLabel}</p>)}
              {row.refundId && <a className="text-sm text-primary underline" href="/admin/refunds">{t('eventOperations.reviewRefund')}</a>}
              {row.state === 'resolved' && <p className="text-sm text-muted-foreground">{row.refundCompleted ? t('eventOperations.filters.refundConfirmed') : t('eventOperations.filters.closureRecorded')}
                {row.resolvedAt && ` · ${new Intl.DateTimeFormat(locale, { timeZone: 'Asia/Kuala_Lumpur', dateStyle: 'short', timeStyle: 'short' }).format(new Date(row.resolvedAt))}`}
              </p>}
              {row.state === 'resolved' && row.resolutionCode && <p className="text-sm">{t(`eventOperations.resolutions.${row.resolutionCode}`)}{row.resolutionNote && ` · ${row.resolutionNote}`}</p>}
              {row.state === 'open' && row.kind === 'pickup_overdue' && row.isMine && <div className="flex flex-wrap gap-2">
                <Button variant="outline" disabled={busyCase !== null} onClick={() => void closePickupCase(row, 'resolve')}>{t('eventOperations.resolvePickup')}</Button>
                <Button variant="outline" disabled={busyCase !== null || !!row.refundId} onClick={() => void closePickupCase(row, 'confirm_no_show')}>{t('eventOperations.confirmNoShow')}</Button>
              </div>}
              {row.state === 'open' && <div className="flex flex-wrap items-end gap-2">
                <label className="text-sm">{t('eventOperations.dueMalaysia')}
                  <input type="datetime-local" value={dueDates[row.id] ?? ''} onChange={(e) => { setDueDates((old) => ({ ...old, [row.id]: e.target.value })); setActionError(''); }} className={`ml-2 ${adminFilterControlClassName}`} />
                </label>
                <Button variant="outline" disabled={busyCase !== null || (row.assigned && !row.isMine) || !futureDeadlineIso(dueDates[row.id])} onClick={() => void claimCase(row)}>{t('eventOperations.claim')}</Button>
              </div>}
            </div>
          ))}
          {ready && <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">{t('eventOperations.filters.page', { page: data.eventOperations.page, pages: Math.max(1, Math.ceil(data.eventOperations.total / data.eventOperations.pageSize)) })}</p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={data.eventOperations.page <= 1} onClick={() => setCaseFilters((old) => ({ ...old, casePage: data.eventOperations.page - 1 }))}>{t('eventOperations.filters.previous')}</Button>
              <Button variant="outline" disabled={data.eventOperations.page * data.eventOperations.pageSize >= data.eventOperations.total} onClick={() => setCaseFilters((old) => ({ ...old, casePage: data.eventOperations.page + 1 }))}>{t('eventOperations.filters.next')}</Button>
            </div>
          </div>}
        </section>
      )}

      <section className="mt-5 space-y-5">
          <AdminFilterBar>
            <input type="month" aria-label={t('reconciliation.month')} value={period} onChange={(event) => { setPeriod(event.target.value); setFinancialPage(1); }} className={adminFilterControlClassName} />
            <input aria-label={t('reconciliation.filters.search')} className={`${adminFilterControlClassName} min-w-[220px] flex-1`} maxLength={100} value={filters.search} onChange={(event) => changeFinancialFilter('search', event.target.value)} />
            <select className={adminFilterControlClassName} aria-label={t('reconciliation.columns.status')} value={filters.status} onChange={(event) => changeFinancialFilter('status', event.target.value)}>
                <option value="all">{t('orderOperations.statuses.all')}</option>
                {[...new Set([...statusOptions, ...(filters.status === 'all' ? [] : [filters.status])])].map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}
            </select>
            <select className={adminFilterControlClassName} aria-label={t('reconciliation.metrics.platformNet')} value={filters.net} onChange={(event) => changeFinancialFilter('net', event.target.value as ReconciliationFilters['net'])}>
                {(['all', 'positive', 'zero', 'negative'] as const).map((net) => <option key={net} value={net}>{t(`reconciliation.filters.net.${net}`)}</option>)}
            </select>
            <select className={adminFilterControlClassName} aria-label={t('staffConduct.filters.perPageAriaLabel')} value={financialPageSize} onChange={(event) => { setFinancialPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number]); setFinancialPage(1); }}>
                {PAGE_SIZES.map((size) => <option key={size} value={size}>{t('ui.pagination.perPage', { count: size })}</option>)}
            </select>
            <Button variant="outline" onClick={() => { setFilters({ search: '', status: 'all', net: 'all' }); setFinancialPage(1); }}>{t('reconciliation.filters.clear')}</Button>
            <Button onClick={() => void load()} disabled={loading || !period}><RefreshCw size={15} />{loading ? t('reconciliation.loading') : t('reconciliation.reload')}</Button>
            <Button variant="outline" onClick={downloadCsv} disabled={!ready || !filteredReport.rows.length}><Download size={15} />{t('reconciliation.exportCsv')}</Button>
          </AdminFilterBar>
          {ready && <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {metrics.map(([label, sen]) => (
              <div key={label} className="rounded-2xl border border-border bg-card p-5">
                <p className="text-sm font-semibold text-muted-foreground">{label}</p>
                <p className={`mt-3 text-2xl font-bold tracking-[-0.04em] font-[family-name:var(--font-mono)] ${sen < 0 ? "text-destructive" : "text-foreground"}`}>{formatReconciliationSen(sen)}</p>
              </div>
            ))}
          </div>

          {filteredReport.totals.negativeOrders > 0 && (
            <p className="flex items-center gap-2 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
              <AlertTriangle size={16} className="shrink-0" />
              {t("reconciliation.negativeWarning", { count: filteredReport.totals.negativeOrders })}
            </p>
          )}

          <div className="rounded-2xl border border-border bg-card p-5">
            {filteredReport.rows.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">{t(data?.rows.length ? 'reconciliation.filters.noMatches' : 'reconciliation.noOrders')}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="py-3 pr-3">{t("reconciliation.columns.order")}</th>
                      <th className="py-3 pr-3">{t("reconciliation.columns.status")}</th>
                      <th className="py-3 pr-3 text-right">{t("reconciliation.columns.gross")}</th>
                      <th className="py-3 pr-3 text-right">{t("reconciliation.columns.fee")}</th>
                      <th className="py-3 pr-3 text-right">{t("reconciliation.columns.vendorNet")}</th>
                      <th className="py-3 pr-3 text-right">{t("reconciliation.columns.affiliate")}</th>
                      <th className="py-3 pr-3 text-right">{t("reconciliation.columns.recommendation")}</th>
                      <th className="py-3 text-right">{t("reconciliation.columns.platformNet")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {pagedRows.items.map((r) => (
                      <tr key={r.orderId} className={r.platformNetNegative ? "bg-amber-50/60 dark:bg-amber-500/10" : ""}>
                        <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">{r.orderDisplayId ?? t('reconciliation.filters.orderWithoutNumber')}</td>
                        <td className="py-3 pr-3 text-xs text-muted-foreground">
                          {r.paidAt ? new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(r.paidAt)) : "—"} · {statusLabel(r.status)}
                        </td>
                        <td className="py-3 pr-3 text-right font-mono">{formatReconciliationSen(r.grossSen)}</td>
                        <td className="py-3 pr-3 text-right font-mono text-muted-foreground">{formatReconciliationSen(r.platformFeeSen)}</td>
                        <td className="py-3 pr-3 text-right font-mono">{formatReconciliationSen(r.vendorNetSen)}</td>
                        <td className="py-3 pr-3 text-right font-mono text-muted-foreground">{r.affiliatePayoutSen ? `−${formatReconciliationSen(r.affiliatePayoutSen)}` : "—"}</td>
                        <td className="py-3 pr-3 text-right font-mono text-muted-foreground">{r.recommendationPayoutSen ? `−${formatReconciliationSen(r.recommendationPayoutSen)}` : "—"}</td>
                        <td className={`py-3 text-right font-mono font-bold ${r.platformNetNegative ? "text-destructive" : "text-foreground"}`}>{formatReconciliationSen(r.platformNetSen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs text-muted-foreground">
              <span>{tCommon('pagination.showing', { first: filteredRows.length ? (pagedRows.page - 1) * financialPageSize + 1 : 0, last: Math.min(pagedRows.page * financialPageSize, filteredRows.length), total: filteredRows.length })}</span>
              <div className="flex items-center gap-2">
                <span>{t('ui.pagination.pageOf', { page: pagedRows.page, total: pagedRows.totalPages })}</span>
                {pagedRows.totalPages > 1 && <div className="flex gap-2">
                  <Button size="sm" variant="outline" aria-label={tCommon('accessibility.previousPage')} disabled={pagedRows.page <= 1 || loading} onClick={() => setFinancialPage(pagedRows.page - 1)}><ChevronLeft size={14} /></Button>
                  <Button size="sm" variant="outline" aria-label={tCommon('accessibility.nextPage')} disabled={pagedRows.page >= pagedRows.totalPages || loading} onClick={() => setFinancialPage(pagedRows.page + 1)}><ChevronRight size={14} /></Button>
                </div>}
              </div>
            </div>
          </div>
          </>}
        </section>
    </AdminPageShell>
  );
}
