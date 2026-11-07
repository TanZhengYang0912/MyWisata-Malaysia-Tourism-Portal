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

type Reservation = {
  id: string;
  orderId: string;
  displayId: string;
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

  const days = [...new Set((items ?? []).map((item) => item.pickupDate))];

  return (
    <div className="w-full space-y-5 pb-0 lg:pb-24">
      <VendorPageHeader
        eyebrow={<><ClipboardList size={15} aria-hidden="true" /> {t('navigationSections.promotion')}</>}
        title={t('ui.eventOrders.title')}
        actions={<>
          <label className="text-xs font-semibold text-muted-foreground">
            {t('ui.eventOrders.date')}
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 h-11 sm:h-9" />
          </label>
          {date && <Button type="button" variant="outline" size="sm" onClick={() => setDate('')} className="min-h-11">{t('ui.eventOrders.upcoming')}</Button>}
          <Button asChild size="sm" className="min-h-11"><Link href="/vendor/scanner"><ScanLine size={15} aria-hidden="true" /> {t('ui.eventOrders.scan')}</Link></Button>
        </>}
      />

      {items === null ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={16} className="animate-spin" aria-hidden="true" /> {t('ui.eventOrders.loading')}</p>
      ) : error ? (
        <p role="alert" className="text-sm text-destructive">{t('ui.eventOrders.loadError')}</p>
      ) : items.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">{t('ui.eventOrders.empty')}</p>
      ) : days.map((day) => (
        <section key={day} className="space-y-3">
          <div className="space-y-3 md:hidden">
            <h2 className="rounded-xl border border-border bg-secondary/40 px-4 py-2.5 text-sm font-bold text-foreground">
              {formatEventDate(day, locale)}
            </h2>
            <div data-mobile-event-order-list className="space-y-3">
              {items.filter((item) => item.pickupDate === day).map((item) => (
                <VendorMobileRecordCard
                  key={item.id}
                  header={
                    <>
                      <p className="break-all font-mono text-xs font-semibold text-muted-foreground">
                        {item.displayId}
                      </p>
                      <span className={`shrink-0 rounded-full px-2 py-1 text-right text-xs font-bold ${item.status === 'fulfilled' ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200' : 'bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200'}`}>
                        {item.status === 'fulfilled' ? t('ui.eventOrders.collected') : t('ui.eventOrders.toCollect')}
                      </span>
                    </>
                  }
                >
                  <p className="break-words text-sm font-semibold text-foreground">
                    {item.quantity} × {item.itemName}
                  </p>
                  <dl className="grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs">
                    <div className="min-w-0">
                      <dt className="font-semibold text-muted-foreground">{t('ui.eventOrders.pickup')}</dt>
                      <dd className="mt-1 break-words text-foreground">{item.pickupLabel || '—'}</dd>
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
          <div className="hidden md:block overflow-hidden rounded-2xl border border-border bg-card">
            <h2 className="border-b border-border bg-secondary/40 px-4 py-2.5 text-sm font-bold text-foreground">
              {formatEventDate(day, locale)}
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-2">{t('ui.eventOrders.order')}</th>
                    <th scope="col" className="px-4 py-2">{t('ui.eventOrders.pickup')}</th>
                    <th scope="col" className="px-4 py-2">{t('ui.eventOrders.item')}</th>
                    <th scope="col" className="px-4 py-2 text-right">{t('ui.eventOrders.total')}</th>
                    <th scope="col" className="px-4 py-2">{t('ui.eventOrders.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.filter((item) => item.pickupDate === day).map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-2.5 font-mono text-xs">{item.displayId}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{item.pickupLabel}</td>
                      <td className="px-4 py-2.5 text-foreground">{item.quantity} × {item.itemName}</td>
                      <td className="px-4 py-2.5 text-right">{item.lineTotal === 0 ? t('ui.eventOrders.free') : formatMYR(item.lineTotal)}</td>
                      <td className="px-4 py-2.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${item.status === 'fulfilled' ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200' : 'bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200'}`}>
                          {item.status === 'fulfilled' ? t('ui.eventOrders.collected') : t('ui.eventOrders.toCollect')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
