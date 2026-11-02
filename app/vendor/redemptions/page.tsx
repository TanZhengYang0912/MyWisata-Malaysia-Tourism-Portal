'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LOCALE, isAppLocale } from '@/lib/i18n/locale';
import { formatDateTime } from '@/lib/i18n/format';
import {
  Check,
  ClipboardCheck,
  Copy,
  Download,
  MapPin,
  PackageCheck,
  RefreshCw,
  Search,
  Store,
  Ticket,
  TicketPercent,
  Users,
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import type { RedemptionRecord } from '@/app/api/vendors/[vendorId]/redemptions/route';

interface OutletOption {
  id: string;
  name: string;
}

export default function VendorRedemptionsPage() {
  const { t, i18n } = useTranslation('vendor');
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const { user } = useAuth();
  const vendorId = user?.activeVendorId;

  const [records, setRecords] = useState<RedemptionRecord[]>([]);
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [stats, setStats] = useState({
    totalCount: 0,
    todayCount: 0,
    voucherCount: 0,
    ticketCount: 0,
    retailCount: 0,
    activeOutletsCount: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [outletFilter, setOutletFilter] = useState('');
  const [kindFilter, setKindFilter] = useState<'all' | 'voucher' | 'ticket' | 'event_pickup' | 'retail_pickup'>('all');
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Load Outlets for filter
  useEffect(() => {
    if (!vendorId) return;
    fetch(`/api/vendors/${vendorId}/outlets?page=1&pageSize=100&sort=name`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((payload) => {
        if (payload.data?.items) {
          setOutlets(payload.data.items.map((o: { id: string; name: string }) => ({ id: o.id, name: o.name })));
        }
      })
      .catch(() => {
        // silently fallback
      });
  }, [vendorId]);

  // Load Redemptions
  const loadRedemptions = useCallback(
    async (currentPage = 1) => {
      if (!vendorId) return;
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({
          page: String(currentPage),
          pageSize: '15',
          kind: kindFilter,
        });
        if (outletFilter) params.set('outletId', outletFilter);
        if (search.trim()) params.set('q', search.trim());

        const res = await fetch(`/api/vendors/${vendorId}/redemptions?${params.toString()}`, { cache: 'no-store' });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload.error?.message || t('ui.redemptions.loadFailed', 'Unable to load redemption records.'));

        setRecords(payload.data?.items || []);
        if (payload.data?.pagination) {
          setPage(payload.data.pagination.page);
          setTotalPages(payload.data.pagination.totalPages);
          setTotalRecords(payload.data.pagination.total);
        }
        if (payload.data?.stats) {
          setStats(payload.data.stats);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('ui.redemptions.loadFailed', 'Unable to load redemption records.'));
      } finally {
        setLoading(false);
      }
    },
    [kindFilter, outletFilter, search, t, vendorId],
  );

  useEffect(() => {
    // Load the first results page when the vendor and current filters are ready.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRedemptions(1);
  }, [loadRedemptions]);

  async function copyToClipboard(text: string, id: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      // fallback
    }
  }

  function handleExportCsv() {
    if (!records.length) return;
    const headers = ['ID', 'Type', 'Time', 'Outlet', 'Item Name', 'Code', 'Details', 'Customer Name', 'Customer Email', 'Staff'];
    const csvRows = records.map((r) => [
      `"${r.id}"`,
      `"${r.kind}"`,
      `"${new Date(r.redeemedAt).toLocaleString()}"`,
      `"${r.outlet.fullName}"`,
      `"${r.item.name.replace(/"/g, '""')}"`,
      `"${r.item.code || ''}"`,
      `"${r.item.details}"`,
      `"${r.customer.name.replace(/"/g, '""')}"`,
      `"${r.customer.email}"`,
      `"${r.staff?.name || 'Self-service'}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...csvRows.map((row) => row.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `redemptions-report-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <ClipboardCheck size={16} />
            <span>{t('ui.redemptions.eyebrow', 'Store Redemptions')}</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-950 dark:text-foreground sm:text-3xl">
            {t('ui.redemptions.title', 'Redemptions & Scan Logs')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500 dark:text-muted-foreground">
            {t(
              'ui.redemptions.description',
              'Audit logs of in-store voucher redemptions and ticket admissions across all your outlets.',
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => loadRedemptions(page)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card px-3.5 py-2.5 text-sm font-semibold text-gray-700 dark:text-foreground shadow-sm transition hover:bg-gray-50 dark:hover:bg-muted/50 disabled:opacity-40"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>{t('actions.refresh', 'Refresh')}</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={loading || records.length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/20 bg-secondary px-3.5 py-2.5 text-sm font-semibold text-primary shadow-sm transition hover:bg-secondary/80 disabled:opacity-40"
          >
            <Download size={15} />
            <span>{t('actions.exportCsv', 'Export CSV')}</span>
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <div className="rounded-2xl border border-gray-100 dark:border-border bg-white dark:bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500 dark:text-muted-foreground">{t('ui.redemptions.totalRedemptions', 'Total Redemptions')}</p>
          <p className="mt-1 text-2xl font-bold text-gray-950 dark:text-foreground">{stats.totalCount}</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-muted-foreground">{t('ui.redemptions.allTime', 'All recorded scans')}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 dark:border-border bg-white dark:bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500 dark:text-muted-foreground">{t('ui.redemptions.todayScans', "Today's Scans")}</p>
          <p className="mt-1 text-2xl font-bold text-primary">{stats.todayCount}</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-muted-foreground">{t('ui.redemptions.redeemedToday', 'Redeemed today')}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 dark:border-border bg-white dark:bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500 dark:text-muted-foreground">{t('ui.redemptions.vouchersUsed', 'Vouchers Redeemed')}</p>
          <p className="mt-1 text-2xl font-bold text-emerald-600 dark:text-emerald-300">{stats.voucherCount}</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-muted-foreground">{t('ui.redemptions.storePromos', 'Store vouchers')}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 dark:border-border bg-white dark:bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500 dark:text-muted-foreground">{t('ui.redemptions.ticketsAdmitted', 'Tickets Admitted')}</p>
          <p className="mt-1 text-2xl font-bold text-[#b45309]">{stats.ticketCount}</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-muted-foreground">{t('ui.redemptions.checkedInGuests', 'Guest check-ins')}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 dark:border-border bg-white dark:bg-card p-4 shadow-sm">
          <p className="text-xs font-medium text-gray-500 dark:text-muted-foreground">{t('ui.redemptions.retailPickups', 'Retail pickups')}</p>
          <p className="mt-1 text-2xl font-bold text-primary">{stats.retailCount}</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-muted-foreground">{t('ui.redemptions.retailItemsHandedOver', 'Order lines handed over')}</p>
        </div>
      </section>

      {/* Filter and Search Bar */}
      <section className="flex flex-col gap-3 rounded-2xl border border-gray-100 dark:border-border bg-white dark:bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {/* Kind Filter Pills */}
          <div className="inline-flex rounded-xl bg-gray-100 dark:bg-muted p-1 text-xs font-semibold">
            {(
              [
                { value: 'all', label: t('ui.redemptions.filters.all', 'All Activity') },
                { value: 'voucher', label: t('ui.redemptions.filters.vouchers', 'Vouchers') },
                { value: 'ticket', label: t('ui.redemptions.filters.tickets', 'Tickets') },
                { value: 'retail_pickup', label: t('ui.redemptions.filters.retail', 'Retail pickups') },
              ] as const
            ).map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => {
                  setKindFilter(item.value);
                  setPage(1);
                }}
                className={`rounded-lg px-3 py-1.5 transition ${
                  kindFilter === item.value ? 'bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-sm' : 'text-gray-500 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <span className="text-xs text-gray-500 dark:text-muted-foreground">{t('ui.redemptions.filteredCount', { count: totalRecords })}</span>

          {/* Outlet Filter */}
          {outlets.length > 1 && (
            <select
              value={outletFilter}
              onChange={(e) => {
                setOutletFilter(e.target.value);
                setPage(1);
              }}
              className="h-9 w-full min-w-0 max-w-full rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card px-3 text-xs font-semibold text-gray-700 dark:text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary sm:w-auto sm:max-w-xs"
            >
              <option value="">{t('ui.redemptions.allOutlets', 'All Outlets')}</option>
              {outlets.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Search */}
        <div className="relative w-full sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t('ui.redemptions.searchPlaceholder', 'Search code, item, staff...')}
            className="h-9 w-full rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card pl-9 pr-3 text-xs text-gray-800 dark:text-foreground outline-none placeholder:text-gray-400 dark:placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
          />
        </div>
      </section>

      {/* Main Table */}
      <section className="overflow-hidden rounded-2xl border border-gray-100 dark:border-border bg-white dark:bg-card shadow-sm">
        {loading ? (
          <div className="p-8 text-center text-sm text-gray-500 dark:text-muted-foreground">
            <RefreshCw size={24} className="mx-auto mb-2 animate-spin text-primary" />
            <p>{t('ui.redemptions.loading', 'Loading redemption records...')}</p>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-sm text-red-600 dark:text-red-300">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => loadRedemptions(page)}
              className="mt-2 text-xs font-semibold text-primary underline"
            >
              {t('actions.tryAgain', 'Try again')}
            </button>
          </div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardCheck size={36} className="mx-auto text-gray-300" />
            <h3 className="mt-3 text-base font-bold text-gray-900 dark:text-foreground">
              {t('ui.redemptions.emptyTitle', 'No redemption records found')}
            </h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-muted-foreground">
              {t('ui.redemptions.emptyDescription', 'When customers redeem vouchers or check in tickets at your outlets, scan activity will appear here.')}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Six columns cannot share a phone width; keep a readable minimum and scroll inside the card. */}
            <table className="w-full min-w-[56rem] text-left text-sm">
              <thead className="border-b border-gray-100 dark:border-border bg-gray-50/75 dark:bg-muted/75 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-muted-foreground">
                <tr>
                  <th className="px-5 py-3.5">{t('ui.redemptions.table.type', 'Type')}</th>
                  <th className="px-5 py-3.5">{t('ui.redemptions.table.item', 'Item & Code')}</th>
                  <th className="px-5 py-3.5">{t('ui.redemptions.table.outlet', 'Outlet')}</th>
                  <th className="px-5 py-3.5">{t('ui.redemptions.table.customer', 'Customer')}</th>
                  <th className="px-5 py-3.5">{t('ui.redemptions.table.verifiedBy', 'Verified By')}</th>
                  <th className="px-5 py-3.5">{t('ui.redemptions.table.time', 'Time')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-border text-gray-700 dark:text-foreground">
                {records.map((r) => (
                  <tr key={r.id} className="transition hover:bg-gray-50/60 dark:hover:bg-muted/60">
                    {/* Type Badge */}
                    <td className="whitespace-nowrap px-5 py-4">
                      {r.kind === 'voucher' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-200">
                          <TicketPercent size={13} />
                          <span>{t('ui.redemptions.kindVoucher', 'Voucher')}</span>
                        </span>
                      ) : r.kind === 'retail_pickup' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                          <PackageCheck size={13} />
                          <span>{t('ui.redemptions.kindRetailPickup', 'Retail pickup')}</span>
                        </span>
                      ) : r.kind === 'event_pickup' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 dark:bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-700 dark:text-violet-200">
                          <Store size={13} />
                          <span>{t('ui.redemptions.kindEventPickup', 'Event pickup')}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-200">
                          <Ticket size={13} />
                          <span>{t('ui.redemptions.kindTicket', 'Ticket Pass')}</span>
                        </span>
                      )}
                    </td>

                    {/* Item & Code */}
                    <td className="px-5 py-4">
                      <p className="font-semibold text-gray-900 dark:text-foreground">{r.item.name}</p>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="whitespace-nowrap font-mono text-xs font-bold text-primary">
                          {r.item.code || '—'}
                        </span>
                        {r.item.code && (
                          <button
                            type="button"
                            onClick={() => copyToClipboard(r.item.code!, r.id)}
                            title={t('ui.vouchers.copyCode')}
                            className="rounded p-1 text-gray-400 dark:text-muted-foreground transition hover:bg-gray-100 dark:hover:bg-muted hover:text-gray-700 dark:hover:text-foreground"
                          >
                            {copiedId === r.id ? (
                              <Check size={12} className="text-emerald-600 dark:text-emerald-300" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        )}
                        <span className="text-xs text-gray-400 dark:text-muted-foreground">· {r.item.details}</span>
                      </div>
                    </td>

                    {/* Outlet */}
                    <td className="px-5 py-4">
                      <p className="flex items-center gap-1 font-medium text-gray-900 dark:text-foreground">
                        <Store size={14} className="shrink-0 text-primary" />
                        <span>{r.outlet.name}</span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-gray-400 dark:text-muted-foreground">
                        <MapPin size={11} />
                        <span>{r.outlet.location}</span>
                      </p>
                    </td>

                    {/* Customer */}
                    <td className="px-5 py-4">
                      <p className="font-medium text-gray-900 dark:text-foreground">{r.customer.name}</p>
                      <p className="text-xs text-gray-400 dark:text-muted-foreground">{r.customer.email}</p>
                    </td>

                    {/* Verified By */}
                    <td className="px-5 py-4">
                      {r.staff ? (
                        <div>
                          <p className="flex items-center gap-1 text-xs font-semibold text-gray-800 dark:text-foreground">
                            <Users size={12} className="text-primary" />
                            <span>{r.staff.name}</span>
                          </p>
                          <p className="text-[11px] text-gray-400 dark:text-muted-foreground">{r.staff.email}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 dark:text-muted-foreground">{t('ui.redemptions.selfService', 'Counter checkout')}</span>
                      )}
                    </td>

                    {/* Time */}
                    <td className="whitespace-nowrap px-5 py-4 text-xs font-medium text-gray-500 dark:text-muted-foreground">
                      {formatDateTime(r.redeemedAt, locale, { timeZone: 'Asia/Kuala_Lumpur' })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 dark:border-border px-5 py-3 text-xs text-gray-500 dark:text-muted-foreground">
            <span>
              {t('ui.pagination.pageOf', { page, total: totalPages }) || `Page ${page} of ${totalPages}`}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-gray-200 dark:border-border px-3 py-1.5 font-semibold text-gray-700 dark:text-foreground transition hover:bg-gray-50 dark:hover:bg-muted/50 disabled:opacity-40"
              >
                {t('actions.previous', 'Previous')}
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="rounded-lg border border-gray-200 dark:border-border px-3 py-1.5 font-semibold text-gray-700 dark:text-foreground transition hover:bg-gray-50 dark:hover:bg-muted/50 disabled:opacity-40"
              >
                {t('actions.next', 'Next')}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
