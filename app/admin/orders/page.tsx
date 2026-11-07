'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import { Pagination } from '@/components/shared/pagination';
import { AdminFilterBar, adminFilterControlClassName } from '@/components/admin/filter-bar';
import { AdminPageHeader, AdminPageShell } from '@/components/admin/admin-page-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAppDialog } from '@/components/providers/app-dialog';
import { useTranslation } from 'react-i18next';

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
  payments?: { id: string; method: string; provider: string | null; status: string; amount: number }[];
  payment: { id: string; method: string; provider: string | null; status: string; amount: number } | null;
};

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
  const { prompt, confirm } = useAppDialog();
  const locale = i18n.resolvedLanguage === 'ms' ? 'ms-MY' : i18n.resolvedLanguage === 'zh-CN' ? 'zh-CN' : 'en-MY';
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
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

  async function resolveShortage(item: OrderItem) {
    const reason = (await prompt(t('eventOperations.shortageReason')))?.trim();
    if (!reason || reason.length < 5) return;
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
                      <p className="font-mono text-xs font-semibold text-foreground">{order.display_id ?? order.id}</p>
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
                            {item.eventListingId && item.pickupDate && ['pending','ready'].includes(item.fulfilStatus) && <Button variant="outline" onClick={() => void resolveShortage(item)}>{t('eventOperations.shortage')}</Button>}
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
          </div>
        )}
        <Pagination currentPage={page} totalPages={pageCount} totalItems={total} pageSize={PAGE_SIZE} onPageChange={setPage} disabled={loading} className="mt-0 border-t border-border px-4 py-3" />
      </section>
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
