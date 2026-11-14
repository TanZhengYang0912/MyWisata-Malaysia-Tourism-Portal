'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ClipboardList, Loader2, ScanLine } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatMYR } from '@/lib/i18n/format';
import { DEFAULT_LOCALE, isAppLocale } from '@/lib/i18n/locale';
import { formatEventDate } from '@/lib/promotion-campaigns/locations';
import { VendorPageHeader } from '@/components/vendor/vendor-page-header';
import { VendorMobileRecordCard } from '@/components/vendor/mobile-record-card';
import { StatusBadge } from '@/components/ui/badge';
import { FilterSegmented } from '@/components/vendor/compact-filter-bar';

type Reservation = {
  id: string;
  orderId: string;
  displayId: string;
  locationId: string;
  locationName: string;
  pickupDate: string;
  pickupLabel: string | null;
  itemName: string;
  quantity: number;
  lineTotal: number;
  status: string;
};

/** Paid event reservations to hand over, by pickup date and window. */
export default function VendorEventOrdersPage() {
  const { t, i18n } = useTranslation('vendor');
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const { user } = useAuth();
  const vendorId = user?.activeVendorId;
  const [date, setDate] = useState('');
  const [items, setItems] = useState<Reservation[] | null>(null);
  const [error, setError] = useState(false);
  // On-site view: hide handed-over reservations without another request.
  const [view, setView] = useState<'all' | 'to_collect'>('all');

  const load = useCallback(async () => {
    if (!vendorId) return;
    setError(false);
    try {
      const query = date ? `?date=${date}` : '';
      const response = await fetch(`/api/vendors/${vendorId}/event-orders${query}`, { cache: 'no-store' });
      const body = await response.json() as { data?: { items?: Reservation[] } };
      if (!response.ok) throw new Error('load');
      setItems(body.data?.items ?? []);
    } catch {
      setItems([]);
      setError(true);
    }
  }, [date, vendorId]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const groupsByContext = new Map<string, {
    locationId: string;
    locationName: string;
    pickupDate: string;
    items: Reservation[];
  }>();
  const visibleItems = (items ?? []).filter((item) => view === 'all' || item.status !== 'fulfilled');
  const collectedCount = (items ?? []).filter((item) => item.status === 'fulfilled').length;
  for (const item of visibleItems) {
    const key = `${item.locationId}:${item.pickupDate}`;
    const group = groupsByContext.get(key) ?? {
      locationId: item.locationId,
      locationName: item.locationName,
      pickupDate: item.pickupDate,
      items: [],
    };
    group.items.push(item);
    groupsByContext.set(key, group);
  }
  const reservationGroups = [...groupsByContext.values()];

  // The group header already names the location; show only the pickup window in each row.
  function pickupWindow(item: Reservation) {
    const label = item.pickupLabel?.trim();
    if (!label) return '—';
    const prefix = `${item.locationName} · `;
    return label.startsWith(prefix) ? label.slice(prefix.length) : label;
  }

  return (
    <div className="w-full space-y-5 pb-0 lg:pb-24">
      <VendorPageHeader
        eyebrow={<><ClipboardList size={15} aria-hidden="true" /> {t('navigationSections.promotion')}</>}
        title={t('ui.eventOrders.title')}
      />

      {/* One toolbar: what to show (status view) on the left, which day on the right. */}
      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        {items && items.length > 0 ? (
          <FilterSegmented
            ariaLabel={t('ui.eventOrders.viewFilter')}
            options={[
              { value: 'all', label: <span className="tabular-nums">{t('ui.eventOrders.showAll')} · {items.length}</span> },
              { value: 'to_collect', label: <span className="tabular-nums">{t('ui.eventOrders.showToCollect')} · {items.length - collectedCount}</span> },
            ]}
            value={view}
            onChange={(value) => setView(value as 'all' | 'to_collect')}
          />
        ) : <span />}
        <div className="flex items-end gap-2">
          <label className="min-w-0 flex-1 text-xs font-semibold text-muted-foreground sm:flex-none">
            {t('ui.eventOrders.date')}
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 h-10 tabular-nums" />
          </label>
          {date && <Button type="button" variant="outline" size="sm" onClick={() => setDate('')} className="h-10">{t('ui.eventOrders.upcoming')}</Button>}
        </div>
      </div>
      {items === null ? (
        <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> {t('ui.eventOrders.loading')}</p>
      ) : error ? (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">{t('ui.eventOrders.loadError')} <Button type="button" variant="outline" size="sm" onClick={() => void load()}>{t('ui.eventOrders.retry')}</Button></p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">{t('ui.eventOrders.empty')}</p>
      ) : reservationGroups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">{t('ui.eventOrders.allCollected')}</p>
      ) : reservationGroups.map((group) => {
        const scanHref = `/vendor/scanner?mode=event-pickup&locationId=${encodeURIComponent(group.locationId)}&date=${encodeURIComponent(group.pickupDate)}&locationName=${encodeURIComponent(group.locationName)}`;
        const groupItems = (items ?? []).filter((item) => item.locationId === group.locationId && item.pickupDate === group.pickupDate);
        const groupCollected = groupItems.filter((item) => item.status === 'fulfilled').length;
        const groupProgress = groupItems.length ? Math.round((groupCollected / groupItems.length) * 100) : 0;
        return (
        <section key={`${group.locationId}:${group.pickupDate}`} aria-labelledby={`event-group-${group.locationId}-${group.pickupDate}`} className="space-y-3 md:space-y-0 md:overflow-hidden md:rounded-2xl md:border md:border-border md:bg-card md:shadow-sm">
          {/* Context first (where + which day + how far along), then the one on-site action. */}
          <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 md:rounded-none md:border-0 md:border-b md:px-5">
            <div className="min-w-0 flex-1">
              <h2 id={`event-group-${group.locationId}-${group.pickupDate}`} className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-foreground">
                <span className="break-words">{group.locationName}</span>
                <span className="text-xs font-medium text-muted-foreground tabular-nums">{formatEventDate(group.pickupDate, locale)}</span>
              </h2>
              <div className="mt-2 flex items-center gap-3">
                <div className="h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={groupItems.length} aria-valuenow={groupCollected} aria-label={t('ui.eventOrders.progress', { collected: groupCollected, total: groupItems.length })}>
                  <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${groupProgress}%` }} />
                </div>
                <p className="shrink-0 text-xs tabular-nums text-muted-foreground">{t('ui.eventOrders.progress', { collected: groupCollected, total: groupItems.length })}</p>
              </div>
            </div>
            <Button asChild size="sm" className="min-h-11"><Link href={scanHref}><ScanLine size={15} aria-hidden="true" /> {t('ui.eventOrders.scan')}</Link></Button>
          </header>
          <div className="space-y-3 md:hidden">
            <div data-mobile-event-order-list className="space-y-3">
              {group.items.map((item) => (
                <VendorMobileRecordCard
                  key={item.id}
                  header={
                    <>
                      <p className="break-all font-mono text-xs font-semibold text-muted-foreground">
                        {item.displayId}
                      </p>
                      <StatusBadge status={item.status === 'fulfilled' ? 'completed' : 'pending'} label={item.status === 'fulfilled' ? t('ui.eventOrders.collected') : t('ui.eventOrders.toCollect')} />
                    </>
                  }
                >
                  <p className="break-words text-sm font-semibold text-foreground">
                    {item.quantity} × {item.itemName}
                  </p>
                  <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
                    <div className="min-w-0">
                      <dt className="font-semibold text-muted-foreground">{t('ui.eventOrders.pickup')}</dt>
                      <dd className="mt-1 break-words text-foreground">{pickupWindow(item)}</dd>
                    </div>
                    <div className="min-w-0 text-right">
                      <dt className="font-semibold text-muted-foreground">{t('ui.eventOrders.total')}</dt>
                      <dd className="mt-1 font-semibold text-foreground">{item.lineTotal === 0 ? t('ui.eventOrders.free') : formatMYR(item.lineTotal)}</dd>
                    </div>
                  </dl>
                </VendorMobileRecordCard>
              ))}
            </div>
          </div>
          <div className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs font-medium text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-5 py-2">{t('ui.eventOrders.order')}</th>
                    <th scope="col" className="px-4 py-2">{t('ui.eventOrders.pickup')}</th>
                    <th scope="col" className="px-4 py-2">{t('ui.eventOrders.item')}</th>
                    <th scope="col" className="px-4 py-2 text-right">{t('ui.eventOrders.total')}</th>
                    <th scope="col" className="px-4 py-2">{t('ui.eventOrders.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {group.items.map((item) => (
                    <tr key={item.id}>
                      <td className="px-5 py-2.5 font-mono text-xs">{item.displayId}</td>
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{pickupWindow(item)}</td>
                      <td className="px-4 py-2.5 text-foreground">{item.quantity} × {item.itemName}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{item.lineTotal === 0 ? t('ui.eventOrders.free') : formatMYR(item.lineTotal)}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={item.status === 'fulfilled' ? 'completed' : 'pending'} label={item.status === 'fulfilled' ? t('ui.eventOrders.collected') : t('ui.eventOrders.toCollect')} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ); })}
    </div>
  );
}
