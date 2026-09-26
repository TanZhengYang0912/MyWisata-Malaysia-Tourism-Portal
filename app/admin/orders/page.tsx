'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { AdminFilterBar, adminFilterControlClassName } from '@/components/admin/filter-bar';
import { AdminPageHeader, AdminPageShell } from '@/components/admin/admin-page-shell';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

type OrderItem = {
  id: string;
  productName: string;
  quantity: number;
  lineTotal: number;
  fulfilStatus: string;
  vendorName: string | null;
  outletName: string | null;
};

type AdminOrder = {
  id: string;
  status: string;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  currency: string;
  payment_method: string | null;
  voucher_code: string | null;
  paid_at: string | null;
  created_at: string;
  customer: { name: string | null; email: string | null };
  items: OrderItem[];
  payment: { method: string; provider: string | null; status: string; amount: number } | null;
};

const PAGE_SIZE = 25;
const STATUS_OPTIONS = ['all', 'pending_payment', 'paid', 'completed', 'cancelled', 'failed', 'refunded'] as const;

function formatMoney(amount: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(Number(amount));
}

export default function AdminOrdersPage() {
  const { t, i18n } = useTranslation('admin');
  const locale = i18n.resolvedLanguage === 'ms' ? 'ms-MY' : i18n.resolvedLanguage === 'zh-CN' ? 'zh-CN' : 'en-MY';
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOrders = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page), status });
    if (search) params.set('search', search);
    try {
      const response = await fetch(`/api/admin/orders?${params}`, { cache: 'no-store', signal });
      const payload = await response.json() as {
        data?: { orders: AdminOrder[]; total: number };
        error?: { message?: string };
      };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? t('orderOperations.errors.load'));
      setOrders(payload.data.orders);
      setTotal(payload.data.total);
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setError(reason instanceof Error ? reason.message : t('orderOperations.errors.load'));
      setOrders([]);
      setTotal(0);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [page, search, status, t]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadOrders(controller.signal);
    });
    return () => controller.abort();
  }, [loadOrders]);

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={t('orderOperations.eyebrow')}
        title={t('orderOperations.title')}
        description={t('orderOperations.description')}
        actions={<Button variant="outline" onClick={() => void loadOrders()} disabled={loading}><RefreshCw size={15} />{t('orderOperations.refresh')}</Button>}
      />

      <AdminFilterBar>
        <form onSubmit={applySearch} className="flex min-w-0 flex-1 flex-wrap items-end gap-3">
          <label className="min-w-[220px] flex-1 text-sm">
            <span className="mb-1.5 block font-medium">{t('orderOperations.searchLabel')}</span>
            <input
              className={`${adminFilterControlClassName} w-full`}
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t('orderOperations.searchPlaceholder')}
              maxLength={36}
              aria-label={t('orderOperations.searchLabel')}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block font-medium">{t('orderOperations.status')}</span>
            <select className={adminFilterControlClassName} value={status} onChange={(event) => { setPage(1); setStatus(event.target.value as typeof status); }}>
              {STATUS_OPTIONS.map((value) => <option key={value} value={value}>{t(`orderOperations.statuses.${value}`)}</option>)}
            </select>
          </label>
          <Button type="submit" disabled={loading}><Search size={15} />{t('orderOperations.search')}</Button>
        </form>
      </AdminFilterBar>

      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      <section className="overflow-hidden rounded-2xl border border-border bg-card">
        {loading ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t('orderOperations.loading')}</p>
        ) : orders.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t('orderOperations.empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">{t('orderOperations.order')}</th>
                  <th className="px-4 py-3">{t('orderOperations.customer')}</th>
                  <th className="px-4 py-3">{t('orderOperations.items')}</th>
                  <th className="px-4 py-3">{t('orderOperations.payment')}</th>
                  <th className="px-4 py-3 text-right">{t('orderOperations.total')}</th>
                  <th className="px-4 py-3">{t('orderOperations.created')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((order) => (
                  <tr key={order.id} className="align-top">
                    <td className="px-4 py-4">
                      <p className="font-mono text-xs font-semibold text-foreground">{order.id}</p>
                      <p className="mt-1 capitalize text-muted-foreground">{t(`orderOperations.statuses.${STATUS_OPTIONS.includes(order.status as typeof STATUS_OPTIONS[number]) ? order.status : 'all'}`)}</p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium">{order.customer.name ?? t('orderOperations.unknownCustomer')}</p>
                      <p className="text-xs text-muted-foreground">{order.customer.email ?? '—'}</p>
                    </td>
                    <td className="max-w-sm px-4 py-4">
                      <ul className="space-y-2">
                        {order.items.map((item) => (
                          <li key={item.id}>
                            <p className="font-medium">{item.quantity} × {item.productName}</p>
                            <p className="text-xs text-muted-foreground">
                              <span>{item.vendorName ?? '—'}</span><span aria-hidden="true"> · </span>
                              <span>{item.outletName ?? '—'}</span><span aria-hidden="true"> · </span>
                              <span>{t('orderOperations.fulfilment')}</span><span aria-hidden="true">: </span><span>{item.fulfilStatus}</span>
                            </p>
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-4 py-4">
                      <p>{order.payment?.method ?? order.payment_method ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">{order.payment?.status ?? t('orderOperations.paymentPending')}</p>
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold">{formatMoney(order.total_amount, order.currency || 'MYR', locale)}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.created_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <footer className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm">
          <span className="text-muted-foreground">{t('orderOperations.count', { total })}</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>{t('orderOperations.previous')}</Button>
            <span className="min-w-16 text-center text-xs text-muted-foreground">{page} / {pageCount}</span>
            <Button variant="outline" size="sm" disabled={page >= pageCount || loading} onClick={() => setPage((value) => value + 1)}>{t('orderOperations.next')}</Button>
          </div>
        </footer>
      </section>
    </AdminPageShell>
  );
}
