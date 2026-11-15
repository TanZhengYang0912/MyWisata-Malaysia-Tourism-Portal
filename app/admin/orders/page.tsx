'use client';

import { FormEvent, KeyboardEvent, useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Pagination } from '@/components/shared/pagination';
import { AdminFilterBar, adminFilterControlClassName } from '@/components/admin/filter-bar';
import { AdminPageHeader, AdminPageShell } from '@/components/admin/admin-page-shell';
import { AdminMobileRecordCard } from '@/components/admin/admin-mobile-record-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAppDialog } from '@/components/providers/app-dialog';
import { useTranslation } from 'react-i18next';
import Link from 'next/link';
import { createEventShortageReason, EVENT_SHORTAGE_REASON_OPTIONS } from './shortage-reason';

type OrderItem = {
  id: string;
  eventListingId: string | null;
  pickupDate: string | null;
  productName: string;
  quantity: number;
  lineTotal: number;
  fulfilStatus: string;
  vendorName: string | null;
  outletName: string | null;
};

type AdminOrder = {
  id: string;
  isGuest: boolean;
  canCorrectGuestContact: boolean;
  display_id: string | null;
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
  itemCount: number;
  itemsHasMore: boolean;
  paymentCount: number;
  paymentsHasMore: boolean;
  payments?: { id: string; method: string; provider: string | null; status: string; amount: number }[];
  payment: { id: string; method: string; provider: string | null; status: string; amount: number } | null;
};

type VendorOption = { id: string; name: string };

type ContactCorrectionPreview = {
  order: { id: string; displayId: string | null; status: string; contactEmail: string | null; totalAmount: number; currency: string };
  eligibility: string;
  pendingOldAddressMailCount: number;
  successfulPayments: { id: string; method: string; provider: string | null; amount: number }[];
};

const PAGE_SIZE = 25;
const STATUS_OPTIONS = ['all', 'pending_payment', 'paid', 'completed', 'cancelled', 'failed', 'refunded'] as const;
function formatMoney(amount: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(Number(amount));
}

export default function AdminOrdersPage() {
  const { t, i18n } = useTranslation('admin');
  const { confirm } = useAppDialog();
  const locale = i18n.resolvedLanguage === 'ms' ? 'ms-MY' : i18n.resolvedLanguage === 'zh-CN' ? 'zh-CN' : 'en-MY';
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selectedVendor, setSelectedVendor] = useState<VendorOption | null>(null);
  const [vendorSearchInput, setVendorSearchInput] = useState('');
  const [vendorOptions, setVendorOptions] = useState<VendorOption[]>([]);
  const [activeVendorIndex, setActiveVendorIndex] = useState(0);
  const [vendorSearchLoading, setVendorSearchLoading] = useState(false);
  const [vendorSearchError, setVendorSearchError] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [shortageItem, setShortageItem] = useState<OrderItem | null>(null);
  const [shortageReasonCode, setShortageReasonCode] = useState('');
  const [shortageManualReason, setShortageManualReason] = useState('');
  const shortageSubmissionActive = useRef(false);
  const [correctionOrder, setCorrectionOrder] = useState<AdminOrder | null>(null);
  const [correctionPreview, setCorrectionPreview] = useState<ContactCorrectionPreview | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [supportTicketId, setSupportTicketId] = useState('');
  const [evidenceKind, setEvidenceKind] = useState<'existing_order_access' | 'provider_confirmed_payer'>('provider_confirmed_payer');
  const [paymentId, setPaymentId] = useState('');
  const [correctionRequestId, setCorrectionRequestId] = useState('');
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionMessage, setCorrectionMessage] = useState('');

  const loadOrders = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(page), status });
    if (search) params.set('search', search);
    if (selectedVendor) params.set('vendorId', selectedVendor.id);
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
  }, [page, search, selectedVendor, status, t]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) void loadOrders(controller.signal);
    });
    return () => controller.abort();
  }, [loadOrders]);

  useEffect(() => {
    const term = vendorSearchInput.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      void (async () => {
        setVendorSearchLoading(true);
        setVendorSearchError(false);
        try {
          const response = await fetch(`/api/admin/orders/vendors?search=${encodeURIComponent(term)}`, {
            cache: 'no-store',
            signal: controller.signal,
          });
          const payload = await response.json() as {
            data?: { vendors: VendorOption[] };
          };
          if (!response.ok || !payload.data) throw new Error('vendor-search-failed');
          setVendorOptions(payload.data.vendors);
          setActiveVendorIndex(0);
        } catch (reason) {
          if (reason instanceof DOMException && reason.name === 'AbortError') return;
          setVendorOptions([]);
          setVendorSearchError(true);
        } finally {
          if (!controller.signal.aborted) setVendorSearchLoading(false);
        }
      })();
    }, 250);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [vendorSearchInput]);

  function applySearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  }

  function selectVendor(vendor: VendorOption) {
    if (selectedVendor?.id !== vendor.id) {
      setSelectedVendor(vendor);
      setPage(1);
    }
    setVendorSearchInput('');
    setVendorOptions([]);
    setActiveVendorIndex(0);
    setVendorSearchLoading(false);
    setVendorSearchError(false);
  }

  function updateVendorSearch(value: string) {
    setVendorSearchInput(value);
    setVendorOptions([]);
    setActiveVendorIndex(0);
    setVendorSearchLoading(value.trim().length >= 2);
    setVendorSearchError(false);
  }

  function handleVendorSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') {
      event.preventDefault();
      const activeVendor = vendorOptions[activeVendorIndex];
      if (activeVendor) selectVendor(activeVendor);
    } else if (event.key === 'ArrowDown' && vendorOptions.length > 0) {
      event.preventDefault();
      setActiveVendorIndex((current) => Math.min(current + 1, vendorOptions.length - 1));
    } else if (event.key === 'ArrowUp' && vendorOptions.length > 0) {
      event.preventDefault();
      setActiveVendorIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === 'Escape') {
      setVendorSearchInput('');
      setVendorOptions([]);
      setVendorSearchLoading(false);
      setVendorSearchError(false);
    }
  }

  function clearVendorFilter() {
    if (!selectedVendor) return;
    setSelectedVendor(null);
    setPage(1);
  }

  function openShortageDialog(item: OrderItem) {
    setShortageItem(item);
    setShortageReasonCode('');
    setShortageManualReason('');
  }

  async function resolveShortage(item: OrderItem, reason: string) {
    const input = { listingId: item.eventListingId, pickupDate: item.pickupDate, reason };
    try {
      const preview = await fetch('/api/admin/orders/event-shortage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
      const body = await preview.json();
      if (!preview.ok) throw new Error(t('eventOperations.conflict'));
      if (!await confirm(t('eventOperations.shortageConfirm', { orders: body.data.orders, units: body.data.units, amount: formatMoney(body.data.amountSen / 100, 'MYR', locale) }))) return;
      const saved = await fetch('/api/admin/orders/event-shortage', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...input, version: body.data.version }) });
      if (!saved.ok) throw new Error(t('eventOperations.conflict'));
      await loadOrders();
    } catch { setError(t('eventOperations.conflict')); }
  }

  function submitShortageReason(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!shortageItem || shortageSubmissionActive.current) return;
    const reason = createEventShortageReason(shortageReasonCode, shortageManualReason, (key) => t(key));
    if (!reason) return;

    const item = shortageItem;
    shortageSubmissionActive.current = true;
    setShortageItem(null);
    void resolveShortage(item, reason).finally(() => { shortageSubmissionActive.current = false; });
  }

  async function openGuestContactCorrection(order: AdminOrder) {
    if (!order.isGuest || !order.canCorrectGuestContact || !order.customer.email) return;
    setError('');
    setCorrectionMessage('');
    setCorrectionOrder(order);
    setCorrectionPreview(null);
    setNewEmail('');
    setSupportTicketId('');
    setEvidenceKind('provider_confirmed_payer');
    setPaymentId('');
    setCorrectionRequestId(window.crypto.randomUUID());
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(order.id)}/guest-contact`, { cache: 'no-store' });
      const body = await response.json() as { data?: ContactCorrectionPreview; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? t('orderOperations.contactCorrection.error'));
      setCorrectionPreview(body.data);
      if (body.data.order.contactEmail) setCorrectionOrder((current) => current ? { ...current, customer: { ...current.customer, email: body.data!.order.contactEmail } } : current);
      setPaymentId(body.data.successfulPayments[0]?.id ?? '');
    } catch (reason) {
      setCorrectionOrder(null);
      setError(reason instanceof Error ? reason.message : t('orderOperations.contactCorrection.error'));
    }
  }

  async function submitGuestContactCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!correctionOrder?.customer.email || !correctionPreview || correctionPreview.eligibility !== 'eligible') return;
    if (evidenceKind === 'provider_confirmed_payer' && !paymentId) { setCorrectionMessage(t('orderOperations.contactCorrection.noPayment')); return; }
    if (!await confirm(t('orderOperations.contactCorrection.confirm', { order: correctionOrder.display_id ?? correctionOrder.id, oldEmail: correctionOrder.customer.email, newEmail }))) return;
    setCorrectionBusy(true);
    setCorrectionMessage('');
    try {
      const response = await fetch(`/api/admin/orders/${encodeURIComponent(correctionOrder.id)}/guest-contact`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ requestId: correctionRequestId, expectedContactEmail: correctionOrder.customer.email, newEmail, supportTicketId, evidenceKind, paymentId: evidenceKind === 'provider_confirmed_payer' ? paymentId : null }),
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) {
        if (response.status === 409) {
          const previewResponse = await fetch(`/api/admin/orders/${encodeURIComponent(correctionOrder.id)}/guest-contact`, { cache: 'no-store' });
          const previewBody = await previewResponse.json() as { data?: ContactCorrectionPreview };
          if (previewResponse.ok && previewBody.data) {
            setCorrectionPreview(previewBody.data);
            if (previewBody.data.order.contactEmail) setCorrectionOrder((current) => current ? { ...current, customer: { ...current.customer, email: previewBody.data!.order.contactEmail } } : current);
            setCorrectionRequestId(window.crypto.randomUUID());
          }
        }
        throw new Error(body.error?.message ?? t('orderOperations.contactCorrection.error'));
      }
      setCorrectionMessage(t('orderOperations.contactCorrection.queued'));
      await loadOrders();
    } catch (reason) {
      setCorrectionMessage(reason instanceof Error ? reason.message : t('orderOperations.contactCorrection.error'));
    } finally {
      setCorrectionBusy(false);
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={t('orderOperations.eyebrow')}
        title={t('orderOperations.title')}
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
          <div className="relative min-w-[220px] text-sm">
            <label htmlFor="admin-order-vendor-search" className="mb-1.5 block font-medium">{t('orderOperations.vendorFilter')}</label>
            {selectedVendor && (
              <div className="mb-1 flex min-h-10 items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 px-3">
                <span className="min-w-0 truncate">{selectedVendor.name}</span>
                <Button type="button" variant="ghost" size="sm" onClick={clearVendorFilter}>{t('orderOperations.clearVendorFilter')}</Button>
              </div>
            )}
            <Input
              id="admin-order-vendor-search"
              value={vendorSearchInput}
              onChange={(event) => updateVendorSearch(event.target.value)}
              onKeyDown={handleVendorSearchKeyDown}
              placeholder={t('orderOperations.vendorSearchPlaceholder')}
              maxLength={100}
              aria-label={t('orderOperations.vendorFilter')}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={vendorSearchInput.trim().length >= 2}
              aria-controls={vendorSearchInput.trim().length >= 2 ? 'admin-order-vendor-results' : undefined}
              aria-activedescendant={vendorOptions[activeVendorIndex] ? `admin-order-vendor-option-${vendorOptions[activeVendorIndex].id}` : undefined}
              autoComplete="off"
            />
            {vendorSearchInput.trim().length > 0 && vendorSearchInput.trim().length < 2 && (
              <p role="status" className="mt-1 text-xs text-muted-foreground">{t('orderOperations.vendorSearchHint')}</p>
            )}
            {vendorSearchInput.trim().length >= 2 && (
              <div id="admin-order-vendor-results" className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg">
                {vendorSearchLoading ? (
                  <p role="status" className="px-3 py-2 text-xs text-muted-foreground">{t('orderOperations.vendorSearchLoading')}</p>
                ) : vendorSearchError ? (
                  <p role="alert" className="px-3 py-2 text-xs text-destructive">{t('orderOperations.vendorSearchError')}</p>
                ) : vendorOptions.length === 0 ? (
                  <p role="status" className="px-3 py-2 text-xs text-muted-foreground">{t('orderOperations.vendorSearchEmpty')}</p>
                ) : (
                  <ul role="listbox" aria-label={t('orderOperations.vendorSearchResults')}>
                    {vendorOptions.map((vendor, index) => (
                      <li key={vendor.id}>
                        <Button
                          id={`admin-order-vendor-option-${vendor.id}`}
                          type="button"
                          variant="ghost"
                          className="h-auto w-full justify-start px-3 py-2 text-left"
                          aria-label={`${vendor.name} ${vendor.id}`}
                          aria-selected={activeVendorIndex === index}
                          role="option"
                          onClick={() => selectVendor(vendor)}
                        >
                          <span className="min-w-0 truncate">{vendor.name}</span>
                          <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">{vendor.id.slice(0, 8)}</span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
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
          <div className="space-y-3 p-3 lg:hidden">
            {orders.map((order) => (
              <AdminMobileRecordCard
                key={order.id}
                header={<div className="min-w-0"><p className="break-all font-mono text-sm font-semibold">{order.display_id ?? order.id}</p><p className="mt-1 text-sm text-muted-foreground">{t(`orderOperations.statuses.${STATUS_OPTIONS.includes(order.status as typeof STATUS_OPTIONS[number]) ? order.status : 'all'}`)}</p></div>}
                footer={order.isGuest && order.canCorrectGuestContact && ['paid', 'completed'].includes(order.status) && order.customer.email ? <Button size="sm" variant="outline" onClick={() => void openGuestContactCorrection(order)}>{t('orderOperations.contactCorrection.action')}</Button> : undefined}
              >
                <div><p className="text-xs font-semibold text-muted-foreground">{t('orderOperations.customer')}</p><p className="mt-1 font-medium">{order.customer.name ?? t('orderOperations.unknownCustomer')}</p><p className="break-all text-sm text-muted-foreground">{order.customer.email ?? '—'}</p></div>
                <div><p className="text-xs font-semibold text-muted-foreground">{t('orderOperations.items')}</p><ul className="mt-1 space-y-3">{order.items.map((item) => <li key={item.id}><p className="font-medium">{item.quantity} × {item.productName}</p>{item.eventListingId && item.pickupDate && ['pending', 'ready'].includes(item.fulfilStatus) && <Button className="mt-1" size="sm" variant="outline" onClick={() => openShortageDialog(item)}>{t('eventOperations.shortage')}</Button>}<p className="text-xs text-muted-foreground">{item.vendorName ?? '—'} · {item.outletName ?? '—'} · {t('orderOperations.fulfilment')}: {item.fulfilStatus}</p></li>)}</ul></div>
                <p className="text-xs text-muted-foreground">{t('orderOperations.detail.associationCounts', { items: order.itemCount, payments: order.paymentCount })}</p>
                <Link href={`/admin/orders/${order.id}`} className="text-sm font-semibold text-primary hover:underline">{t('orderOperations.detail.viewOrder')}</Link>
                <div><p className="text-xs font-semibold text-muted-foreground">{t('orderOperations.payment')}</p>{(order.payments?.length ? order.payments : order.payment ? [order.payment] : []).length ? (order.payments?.length ? order.payments : order.payment ? [order.payment] : []).map((payment, index) => <p key={index} className="mt-1 text-sm">{payment.method} · {formatMoney(payment.amount, order.currency || 'MYR', locale)} <span className="text-muted-foreground">· {payment.status}</span></p>) : <p className="mt-1 text-sm">{t('orderOperations.paymentPending')}</p>}</div>
                <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-3"><span className="text-sm text-muted-foreground">{t('orderOperations.created')}: {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.created_at))}</span><span className="font-semibold">{t('orderOperations.total')}: {formatMoney(order.total_amount, order.currency || 'MYR', locale)}</span></div>
              </AdminMobileRecordCard>
            ))}
          </div>
        )}
        {!loading && orders.length > 0 && <div className="hidden overflow-x-auto lg:block">
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
                      <Link className="font-mono text-xs font-semibold text-primary hover:underline" href={`/admin/orders/${order.id}?returnTo=${encodeURIComponent(`/admin/orders?search=${encodeURIComponent(search)}&status=${status}&page=${page}`)}`}>
                        {order.display_id ?? order.id}
                      </Link>
                      {order.display_id && <p className="mt-1 font-mono text-[10px] text-muted-foreground">{order.id}</p>}
                      <p className="mt-1 capitalize text-muted-foreground">{t(`orderOperations.statuses.${STATUS_OPTIONS.includes(order.status as typeof STATUS_OPTIONS[number]) ? order.status : 'all'}`)}</p>
                      {order.isGuest && order.canCorrectGuestContact && ['paid', 'completed'].includes(order.status) && order.customer.email && <Button className="mt-2" size="sm" variant="outline" onClick={() => void openGuestContactCorrection(order)}>{t('orderOperations.contactCorrection.action')}</Button>}
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
                            {item.eventListingId && item.pickupDate && ['pending','ready'].includes(item.fulfilStatus) && <Button variant="outline" onClick={() => openShortageDialog(item)}>{t('eventOperations.shortage')}</Button>}
                            <p className="text-xs text-muted-foreground">
                              <span>{item.vendorName ?? '—'}</span><span aria-hidden="true"> · </span>
                              <span>{item.outletName ?? '—'}</span><span aria-hidden="true"> · </span>
                              <span>{t('orderOperations.fulfilment')}</span><span aria-hidden="true">: </span><span>{item.fulfilStatus}</span>
                            </p>
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2 text-xs text-muted-foreground">{t('orderOperations.detail.associationCounts', { items: order.itemCount, payments: order.paymentCount })}</p>
                    </td>
                    <td className="px-4 py-4">
                      {(order.payments?.length ? order.payments : order.payment ? [order.payment] : []).map((payment, index) => (
                        <div key={index} className="mb-1">
                          <p>{payment.method} · {formatMoney(payment.amount, order.currency || 'MYR', locale)}</p>
                          <p className="text-xs text-muted-foreground">{payment.status}</p>
                        </div>
                      ))}
                      {!order.payments?.length && !order.payment && <p>{t('orderOperations.paymentPending')}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-4 text-right font-semibold">{formatMoney(order.total_amount, order.currency || 'MYR', locale)}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.created_at))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
        <Pagination currentPage={page} totalPages={pageCount} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} disabled={loading} className="mt-0 border-t border-border px-4 py-3" />
      </section>
      <Dialog open={Boolean(shortageItem)} onOpenChange={(open) => { if (!open) setShortageItem(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('eventOperations.shortage')}</DialogTitle>
            <DialogDescription>{t('eventOperations.shortageReason')}</DialogDescription>
          </DialogHeader>
          {shortageItem && <form onSubmit={submitShortageReason} className="space-y-4">
            <Select value={shortageReasonCode} onValueChange={(value) => setShortageReasonCode(value)}>
              <SelectTrigger aria-label={t('eventOperations.shortageReasonLabel')}>
                <SelectValue placeholder={t('eventOperations.shortageReasonPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {EVENT_SHORTAGE_REASON_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{t(option.key)}</SelectItem>)}
                <SelectItem value="other">{t('eventOperations.shortageReasonOptions.other')}</SelectItem>
              </SelectContent>
            </Select>
            {shortageReasonCode === 'other' && <label className="block space-y-1.5 text-sm">
              <span>{t('eventOperations.shortageManualReasonLabel')}</span>
              <Textarea
                required
                minLength={5}
                maxLength={500}
                value={shortageManualReason}
                onChange={(event) => setShortageManualReason(event.target.value)}
                aria-describedby="shortage-reason-length"
              />
              <span id="shortage-reason-length" className="text-xs text-muted-foreground">{t('eventOperations.shortageReasonLength')}</span>
            </label>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShortageItem(null)}>{t('orderOperations.contactCorrection.cancel')}</Button>
              <Button type="submit" disabled={!createEventShortageReason(shortageReasonCode, shortageManualReason, (key) => t(key))}>{t('eventOperations.shortagePreview')}</Button>
            </DialogFooter>
          </form>}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(correctionOrder)} onOpenChange={(open) => { if (!open && !correctionBusy) setCorrectionOrder(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('orderOperations.contactCorrection.title')}</DialogTitle>
            <DialogDescription>{t('orderOperations.contactCorrection.description')}</DialogDescription>
          </DialogHeader>
          {correctionOrder && <form onSubmit={submitGuestContactCorrection} className="space-y-4">
            <p className="text-sm">{t('orderOperations.contactCorrection.order', { order: correctionOrder.display_id ?? correctionOrder.id })}</p>
            <p className="text-sm text-muted-foreground">{t('orderOperations.contactCorrection.current', { email: correctionOrder.customer.email })}</p>
            {!correctionPreview ? <p role="status" className="text-sm text-muted-foreground">{t('orderOperations.contactCorrection.loading')}</p> : <>
              <p role="status" className="rounded-lg border border-border p-3 text-sm">{t(`orderOperations.contactCorrection.eligibility.${correctionPreview.eligibility}`, { count: correctionPreview.pendingOldAddressMailCount })}</p>
              <label className="block text-sm">{t('orderOperations.contactCorrection.newEmailLabel')}<Input required type="email" autoComplete="email" maxLength={254} className="mt-1 w-full" value={newEmail} onChange={(event) => { setNewEmail(event.target.value); setCorrectionRequestId(window.crypto.randomUUID()); setCorrectionMessage(''); }} /></label>
              <label className="block text-sm">{t('orderOperations.contactCorrection.supportCaseLabel')}<Input required className="mt-1 w-full" value={supportTicketId} onChange={(event) => { setSupportTicketId(event.target.value); setCorrectionRequestId(window.crypto.randomUUID()); setCorrectionMessage(''); }} /></label>
              <label className="block text-sm">{t('orderOperations.contactCorrection.evidenceLabel')}<select required className={`${adminFilterControlClassName} mt-1 w-full`} value={evidenceKind} onChange={(event) => { setEvidenceKind(event.target.value as typeof evidenceKind); setCorrectionRequestId(window.crypto.randomUUID()); setCorrectionMessage(''); }}><option value="provider_confirmed_payer">{t('orderOperations.contactCorrection.providerEvidence')}</option><option value="existing_order_access">{t('orderOperations.contactCorrection.accessEvidence')}</option></select></label>
              {evidenceKind === 'provider_confirmed_payer' && <label className="block text-sm">{t('orderOperations.contactCorrection.paymentLabel')}<select required className={`${adminFilterControlClassName} mt-1 w-full`} value={paymentId} onChange={(event) => { setPaymentId(event.target.value); setCorrectionRequestId(window.crypto.randomUUID()); setCorrectionMessage(''); }}><option value="">{t('orderOperations.contactCorrection.selectPayment')}</option>{correctionPreview.successfulPayments.map((payment) => <option key={payment.id} value={payment.id}>{payment.provider ?? payment.method} · {formatMoney(payment.amount, correctionOrder.currency || 'MYR', locale)} · {payment.id}</option>)}</select></label>}
              <p className="text-xs text-muted-foreground">{t('orderOperations.contactCorrection.oldLinkWarning')}</p>
            </>}
            {correctionMessage && <p role="status" className="text-sm text-muted-foreground">{correctionMessage}</p>}
            <DialogFooter><Button type="button" variant="outline" disabled={correctionBusy} onClick={() => setCorrectionOrder(null)}>{t('orderOperations.contactCorrection.cancel')}</Button><Button type="submit" disabled={correctionBusy || !correctionPreview || correctionPreview.eligibility !== 'eligible'}>{correctionBusy ? t('orderOperations.contactCorrection.saving') : t('orderOperations.contactCorrection.submit')}</Button></DialogFooter>
          </form>}
        </DialogContent>
      </Dialog>
    </AdminPageShell>
  );
}
