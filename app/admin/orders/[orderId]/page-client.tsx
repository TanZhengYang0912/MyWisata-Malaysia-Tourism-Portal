'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import { AdminPageHeader, AdminPageShell } from '@/components/admin/admin-page-shell';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

type OrderView = {
  id: string;
  displayId: string | null;
  customerType: 'account' | 'guest';
  status: string;
  subtotal: number;
  discountAmount: number;
  totalAmount: number;
  currency: string;
  paymentMethod: string | null;
  voucherCode: string | null;
  paidAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Summary = {
  order: OrderView;
  items: Array<Record<string, unknown>>;
  payments: Array<Record<string, unknown>>;
  refunds: Array<Record<string, unknown>>;
  bookings: Array<Record<string, unknown>>;
  passes: Array<Record<string, unknown>>;
  checkIns: Array<Record<string, unknown>>;
  hasMore: Record<string, boolean>;
};

type TimelineEvent = {
  occurredAt: string;
  eventKey: string;
  kind: string;
  status: string | null;
  amount: number | null;
};

type ApiPayload<T> = { data?: T; error?: { message?: string } | null };

function formatMoney(value: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 2 }).format(value);
}

function formatDate(value: unknown, locale: string) {
  if (typeof value !== 'string' || !value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function AdminOrderDetailClient({ orderId, returnTo }: { orderId: string; returnTo: string }) {
  const { t, i18n } = useTranslation('admin');
  const locale = i18n.resolvedLanguage === 'ms' ? 'ms-MY' : i18n.resolvedLanguage === 'zh-CN' ? 'zh-CN' : 'en-MY';
  const [summary, setSummary] = useState<Summary | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [error, setError] = useState('');
  const [timelineError, setTimelineError] = useState('');

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const [summaryResponse, timelineResponse] = await Promise.all([
        fetch(`/api/admin/orders/${orderId}`, { cache: 'no-store', signal }),
        fetch(`/api/admin/orders/${orderId}?section=timeline`, { cache: 'no-store', signal }),
      ]);
      const [summaryPayload, timelinePayload] = await Promise.all([
        summaryResponse.json() as Promise<ApiPayload<Summary>>,
        timelineResponse.json() as Promise<ApiPayload<{ events: TimelineEvent[]; nextCursor: string | null }>>,
      ]);
      if (!summaryResponse.ok || !summaryPayload.data) throw new Error(summaryPayload.error?.message ?? t('orderOperations.detail.loadError'));
      setSummary(summaryPayload.data);
      if (timelineResponse.ok && timelinePayload.data) {
        setEvents(timelinePayload.data.events);
        setCursor(timelinePayload.data.nextCursor);
        setTimelineError('');
      } else {
        setTimelineError(timelinePayload.error?.message ?? t('orderOperations.detail.loadError'));
      }
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      setError(reason instanceof Error ? reason.message : t('orderOperations.detail.loadError'));
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, [orderId, t]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void Promise.resolve().then(() => {
      if (active) void load(controller.signal);
    });
    return () => { active = false; controller.abort(); };
  }, [load]);

  const loadMoreTimeline = async () => {
    if (!cursor || timelineLoading) return;
    setTimelineLoading(true);
    setTimelineError('');
    try {
      const response = await fetch(`/api/admin/orders/${orderId}?section=timeline&cursor=${encodeURIComponent(cursor)}`, { cache: 'no-store' });
      const payload = await response.json() as ApiPayload<{ events: TimelineEvent[]; nextCursor: string | null }>;
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? t('orderOperations.detail.loadError'));
      setEvents((current) => [...current, ...payload.data!.events]);
      setCursor(payload.data.nextCursor);
    } catch (reason) {
      setTimelineError(reason instanceof Error ? reason.message : t('orderOperations.detail.loadError'));
    } finally {
      setTimelineLoading(false);
    }
  };

  const order = summary?.order;
  const hasMoreDetail = Object.values(summary?.hasMore ?? {}).some(Boolean);

  return <AdminPageShell>
    <AdminPageHeader
      eyebrow={t('orderOperations.detail.eyebrow')}
      title={order?.displayId ?? t('orderOperations.detail.title')}
      description={order ? t('orderOperations.detail.customerType', { type: t(`orderOperations.detail.customerTypes.${order.customerType}`) }) : undefined}
      actions={<Button asChild variant="outline"><Link href={returnTo}><ArrowLeft size={15} />{t('orderOperations.detail.back')}</Link></Button>}
    />
    {error && <div role="alert" className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle size={17} />{error}<Button variant="outline" size="sm" onClick={() => void load()}><RefreshCw size={14} />{t('orderOperations.detail.retry')}</Button></div>}
    {loading && !summary ? <p role="status" className="text-sm text-muted-foreground">{t('orderOperations.detail.loading')}</p> : order && summary ? <>
      <section className="grid gap-4 rounded-2xl border border-border bg-card p-5 sm:grid-cols-2 xl:grid-cols-4">
        {[
          [t('orderOperations.detail.status'), order.status],
          [t('orderOperations.detail.total'), formatMoney(order.totalAmount, order.currency, locale)],
          [t('orderOperations.detail.paymentMethod'), order.paymentMethod ?? '—'],
          [t('orderOperations.detail.created'), formatDate(order.createdAt, locale)],
          [t('orderOperations.detail.paid'), formatDate(order.paidAt, locale)],
          [t('orderOperations.detail.completed'), formatDate(order.completedAt, locale)],
          [t('orderOperations.detail.customerTypeLabel'), t(`orderOperations.detail.customerTypes.${order.customerType}`)],
          [t('orderOperations.detail.updated'), formatDate(order.updatedAt, locale)],
        ].map(([label, value]) => <div key={label}><p className="text-xs font-semibold text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium text-foreground">{value}</p></div>)}
      </section>
      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">{t('orderOperations.detail.items')}</h2><div className="mt-4 divide-y divide-border">{summary.items.map((item) => <div key={String(item.id)} className="py-3"><div className="flex justify-between gap-3"><p className="font-medium">{String(item.productName ?? '—')}</p><p className="font-mono text-sm">{formatMoney(Number(item.lineTotal ?? 0), order.currency, locale)}</p></div><p className="mt-1 text-xs text-muted-foreground">{t('orderOperations.detail.itemContext', { quantity: t('orderOperations.detail.quantity', { count: Number(item.quantity ?? 0) }), vendor: String(item.vendorName ?? '—'), outlet: String(item.outletName ?? '—') })}</p><p className="mt-1 text-xs text-muted-foreground">{t('orderOperations.detail.fulfilmentContext', { status: String(item.fulfilmentStatus ?? '—'), date: formatDate(item.fulfilledAt, locale) })}</p></div>)}{summary.items.length === 0 && <p className="py-3 text-sm text-muted-foreground">{t('orderOperations.detail.noItems')}</p>}</div></div>
        <div className="rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">{t('orderOperations.detail.payments')}</h2><div className="mt-4 divide-y divide-border">{summary.payments.map((payment) => <div key={String(payment.id)} className="flex justify-between gap-3 py-3"><div><p className="font-medium">{t('orderOperations.detail.paymentContext', { method: String(payment.method ?? '—'), status: String(payment.status ?? '—') })}</p><p className="mt-1 text-xs text-muted-foreground">{t('orderOperations.detail.processedAt', { date: formatDate(payment.processedAt, locale) })}</p></div><p className="font-mono text-sm">{formatMoney(Number(payment.amount ?? 0), order.currency, locale)}</p></div>)}{summary.payments.length === 0 && <p className="py-3 text-sm text-muted-foreground">{t('orderOperations.detail.noPayments')}</p>}</div></div>
        <div className="rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">{t('orderOperations.detail.bookings')}</h2><div className="mt-4 divide-y divide-border">{summary.bookings.map((booking) => <div key={String(booking.id)} className="flex justify-between gap-3 py-3"><div><p className="font-medium">{String(booking.status ?? '—')}</p><p className="mt-1 text-xs text-muted-foreground">{t('orderOperations.detail.checkedInAt', { date: formatDate(booking.checkInAt, locale) })}</p></div></div>)}{summary.bookings.length === 0 && <p className="py-3 text-sm text-muted-foreground">{t('orderOperations.detail.noBookings')}</p>}</div><div className="mt-3 text-xs text-muted-foreground">{t('orderOperations.detail.passCounts', { passes: summary.passes.length, checkIns: summary.checkIns.length })}</div></div>
        <div className="rounded-2xl border border-border bg-card p-5"><h2 className="font-semibold">{t('orderOperations.detail.refunds')}</h2><div className="mt-4 divide-y divide-border">{summary.refunds.map((refund) => <div key={String(refund.id)} className="flex justify-between gap-3 py-3"><div><p className="font-medium">{String(refund.status ?? '—')}</p><p className="mt-1 text-xs text-muted-foreground">{t('orderOperations.detail.refundDates', { created: formatDate(refund.createdAt, locale), processed: formatDate(refund.processedAt, locale) })}</p></div><p className="font-mono text-sm">{formatMoney(Number(refund.amount ?? 0), order.currency, locale)}</p></div>)}{summary.refunds.length === 0 && <p className="py-3 text-sm text-muted-foreground">{t('orderOperations.detail.noRefunds')}</p>}</div></div>
      </section>
      {hasMoreDetail && <p className="text-xs text-muted-foreground">{t('orderOperations.detail.moreInTimeline')}</p>}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold">{t('orderOperations.detail.timeline')}</h2>
        {timelineError && <p role="alert" className="mt-3 text-sm text-destructive">{timelineError} <Button variant="outline" size="sm" onClick={() => void load()}>{t('orderOperations.detail.retry')}</Button></p>}
        <ol className="mt-4 divide-y divide-border">{events.map((event) => <li key={event.eventKey} className="flex items-center justify-between gap-4 py-3"><div><p className="text-sm font-medium">{t(`orderOperations.detail.eventKinds.${event.kind}`)}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(event.occurredAt, locale)}</p>{event.status && <p className="text-xs text-muted-foreground">{t('orderOperations.detail.statusAt', { status: event.status })}</p>}</div>{event.amount !== null && <p className="font-mono text-sm">{formatMoney(event.amount, order.currency, locale)}</p>}</li>)}</ol>
        {events.length === 0 && !timelineError && <p className="mt-3 text-sm text-muted-foreground">{t('orderOperations.detail.noTimeline')}</p>}
        {cursor && <div className="mt-4"><Button variant="outline" onClick={() => void loadMoreTimeline()} disabled={timelineLoading}>{timelineLoading ? t('orderOperations.detail.loading') : t('orderOperations.detail.loadMore')}</Button></div>}
      </section>
    </> : null}
  </AdminPageShell>;
}
