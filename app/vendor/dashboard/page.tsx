// Vendor dashboard — all figures are derived from the remote Supabase database.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  AlertTriangle, ArrowRight, CalendarDays, Compass, Landmark, TicketPercent,
} from 'lucide-react';
import { getVendorDashboardData, formatGrowth, type DashboardFilter } from '@/lib/vendor-dashboard';
import { formatMYR } from '@/lib/i18n/format';
import SalesChart from '@/components/vendor/sales-chart';
import OutletPieChart from '@/components/vendor/outlet-pie-chart';
import DashboardFilterControl from '@/components/vendor/dashboard-filter';
import DashboardRealtime from '@/components/vendor/dashboard-realtime';
import RecentTransactions from '@/components/vendor/recent-transactions';
import PerformanceRankingCard from '@/components/vendor/performance-ranking-card';
import CompactThumbnail from '@/components/vendor/compact-thumbnail';
import { VendorRevenueAssistantCard } from '@/components/vendor/revenue-assistant-card';
import { dashboardFilterLabel } from '@/lib/vendor/performance-ranking';
import { getServerTranslation } from '@/lib/i18n/server';
import { normalizeDashboardSalesMode } from '@/lib/vendor/dashboard-metrics';
import { VendorPageHeader } from '@/components/vendor/vendor-page-header';
import { VendorMetricCard } from '@/components/vendor/vendor-metric-card';
import { DataFreshness } from '@/components/vendor/data-freshness';

interface Props { searchParams?: Promise<{ filter?: string; from?: string; to?: string; sales?: string | string[] }> }

const FILTERS: DashboardFilter[] = ['today', '7d', '30d', '12m', 'custom'];

function normalizeFilter(value: string | undefined): DashboardFilter {
  return FILTERS.includes(value as DashboardFilter) ? value as DashboardFilter : '30d';
}


export default async function VendorDashboard({ searchParams }: Props) {
  const { t } = await getServerTranslation('vendor');
  const params = await searchParams;
  const filter = normalizeFilter(params?.filter);
  const salesMode = normalizeDashboardSalesMode(params?.sales);
  const isDemoSales = salesMode === 'demo';
  const isAllSales = salesMode === 'all';
  const scopeLabel = t(`ui.dashboard.salesMode.${salesMode}`);
  const data = await getVendorDashboardData(filter, { from: params?.from, to: params?.to }, salesMode);
  if (!data) redirect('/login');
  const isOutletManager = data.role === 'outlet_manager';
  // Server render time of these figures; DashboardRealtime re-renders on vendor changes.
  const generatedAt = new Date().toISOString();

  // Outlet Managers come here to work: orders waiting for them lead. Owners lead with revenue.
  const stats: Array<{ label: string; value: string; note: string; attention?: boolean }> = isOutletManager ? [
    { label: t('ui.dashboard.ordersToFulfil'), value: data.stats.pendingOrders.toLocaleString(), note: t('ui.dashboard.assignedOutletOperations'), attention: data.stats.pendingOrders > 0 },
    { label: t(isDemoSales ? 'ui.dashboard.demoRevenue' : 'ui.dashboard.totalRevenue'), value: formatMYR(data.stats.totalRevenue), note: formatGrowth(data.stats.revenueGrowth) },
    { label: t('ui.dashboard.totalOrders'), value: data.stats.totalOrders.toLocaleString(), note: formatGrowth(data.stats.ordersGrowth) },
    { label: t('ui.dashboard.bookingActivity'), value: data.stats.bookingItems.toLocaleString(), note: t('ui.dashboard.bookingsInPeriod') },
  ] : [
    { label: t(isDemoSales ? 'ui.dashboard.demoRevenue' : 'ui.dashboard.totalRevenue'), value: formatMYR(data.stats.totalRevenue), note: formatGrowth(data.stats.revenueGrowth) },
    { label: t('ui.dashboard.totalOrders'), value: data.stats.totalOrders.toLocaleString(), note: formatGrowth(data.stats.ordersGrowth) },
    { label: t('ui.dashboard.activeListings'), value: data.stats.activeProducts.toLocaleString(), note: t('ui.dashboard.publishedProducts') },
    { label: t('ui.dashboard.outletsManaged'), value: data.stats.activeOutlets.toLocaleString(), note: t('ui.dashboard.acrossMalaysia') },
  ];

  return (
    <div className="space-y-8">
      <DashboardRealtime vendorId={data.vendor.id} />
      <VendorPageHeader
        eyebrow={<><Landmark size={15} aria-hidden="true" /> {t('ui.dashboard.partnerPortal')}</>}
        title={isOutletManager ? t('ui.dashboard.outletOperations') : t('ui.dashboard.overview')}
        actions={<div className="flex flex-wrap items-center justify-end gap-3"><DataFreshness generatedAt={generatedAt} /><DashboardFilterControl /></div>}
      />

      <section className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, note, attention }) => (
          <VendorMetricCard key={label} label={label} value={value} note={note} tone={attention ? 'attention' : 'default'} />
        ))}
      </section>

      {(isDemoSales || data.stats.simulatedOrders > 0 || data.stats.unverifiedOrders > 0) && <section className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/10 p-5" role="status">
        <div className="flex items-start gap-3">
          <AlertTriangle size={19} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-200" />
          <div className="min-w-0">
            <h2 className="font-semibold text-amber-950 dark:text-amber-200">{isDemoSales ? scopeLabel : t('ui.dashboard.salesProvenanceTitle')}</h2>
            <p className="mt-1 text-sm leading-6 text-amber-900 dark:text-amber-200">{t(isDemoSales ? 'ui.dashboard.demoSalesDescription' : isAllSales ? 'ui.dashboard.salesProvenanceAllDescription' : 'ui.dashboard.salesProvenanceDescription')}</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-medium text-amber-950 dark:text-amber-200">
              {data.stats.simulatedOrders > 0 && <span>{t(isDemoSales || isAllSales ? 'ui.dashboard.includedDemoSales' : 'ui.dashboard.simulatedSales', { amount: formatMYR(data.stats.simulatedRevenue), count: data.stats.simulatedOrders })}</span>}
              {data.stats.unverifiedOrders > 0 && <span>{t('ui.dashboard.unverifiedSales', { amount: formatMYR(data.stats.unverifiedRevenue), count: data.stats.unverifiedOrders })}</span>}
            </div>
          </div>
        </div>
      </section>}

      {data.stats.totalOrders === 0 && <section className="flex flex-col gap-3 rounded-2xl border border-primary/10 bg-secondary/70 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-primary">{t('ui.dashboard.noOrdersPeriod')}</p><p className="mt-1 text-sm text-primary">{data.stats.activeProducts > 0 ? t('ui.dashboard.checkAnotherRange') : t('ui.dashboard.publishListing')}</p></div><div className="flex gap-2"><Link href="/vendor/products" className="rounded-lg bg-white dark:bg-card px-3 py-2 text-sm font-semibold text-primary ring-1 ring-primary/20">{t('ui.dashboard.manageListings')}</Link><Link href="/vendor/orders" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">{t('ui.dashboard.viewOrders')}</Link></div></section>}

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 dark:border-border bg-white dark:bg-card p-6 shadow-sm lg:col-span-2"><SalesChart key={salesMode} data={data.chart} salesMode={salesMode} /></div>
        <OutletPieChart key={salesMode} data={data.salesByProduct} total={data.totalProductSales} salesMode={salesMode} />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <PerformanceRankingCard kind="selling" periodLabel={dashboardFilterLabel(data.filter)} items={data.topSelling} href="/vendor/products" salesMode={salesMode} />
        <PerformanceRankingCard kind="rated" periodLabel={t('ranking.rated.allTime')} items={data.topRated} href="/vendor/analytics" />
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-100 dark:border-border bg-white dark:bg-card shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 dark:border-border bg-gray-50/60 dark:bg-muted/60 p-6 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-lg text-gray-900 dark:text-foreground">{t('ui.dashboard.recentTransactions')}</h2><p className="mt-1 text-sm text-gray-500 dark:text-muted-foreground">{isOutletManager ? t('ui.dashboard.latestAssignedOutletOrders') : t('ui.dashboard.latestMalaysiaOutletOrders')}</p></div><Link href="/vendor/orders" className="inline-flex items-center gap-1 self-start rounded-lg bg-secondary px-3 py-2 text-sm font-semibold text-primary transition hover:bg-secondary/80">{t('ui.dashboard.viewAll')} <ArrowRight size={15} /></Link></div>
        <RecentTransactions items={data.recentTransactions} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-amber-100 dark:border-amber-500/30 bg-white dark:bg-card shadow-sm">
        <div className="flex flex-col gap-2 border-b border-amber-100 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-2"><AlertTriangle size={18} className="text-amber-700 dark:text-amber-200" /><h2 className="font-semibold text-lg text-gray-900 dark:text-foreground">{t('ui.dashboard.stockAlerts')}</h2></div><p className="mt-1 text-sm text-gray-600 dark:text-muted-foreground">{t('ui.dashboard.stockAlertsDescription')}</p></div>
          <Link href="/vendor/products" className="inline-flex items-center gap-1 self-start rounded-lg bg-white dark:bg-card px-3 py-2 text-sm font-semibold text-amber-800 dark:text-amber-200 ring-1 ring-amber-200 transition hover:bg-amber-50 dark:hover:bg-amber-500/10">{t('ui.dashboard.reviewCatalogue')} <ArrowRight size={15} /></Link>
        </div>
        {data.stockAlerts.length ? <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">{data.stockAlerts.map((alert) => <div key={alert.variantId} className={`flex items-center gap-3 rounded-xl border p-3 ${alert.available === 0 ? 'border-red-200 dark:border-red-500/30 bg-red-50/60 dark:bg-red-500/10' : 'border-amber-200 dark:border-amber-500/30 bg-amber-50/40 dark:bg-amber-500/10'}`}><CompactThumbnail src={alert.coverUrl} alt={alert.productName} kind="product" size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-900 dark:text-foreground">{alert.productName}</p><p className="mt-1 truncate text-xs text-gray-600 dark:text-muted-foreground">{alert.variantName} · {alert.available === 0 ? t('ui.dashboard.outOfStock') : t('ui.dashboard.availableCount', { count: alert.available })} · {t('ui.dashboard.alertAt', { threshold: alert.threshold })}</p></div></div>)}</div> : <div className="px-5 py-8 text-sm text-gray-500 dark:text-muted-foreground">{t('ui.dashboard.noLowStock')}</div>}
      </section>

      {data.inventorySetupCount > 0 && <section className="overflow-hidden rounded-2xl border border-amber-100 dark:border-amber-500/30 bg-white dark:bg-card shadow-sm">
        <div className="flex flex-col gap-2 border-b border-amber-100 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-2"><AlertTriangle size={18} className="text-amber-700 dark:text-amber-200" /><h2 className="font-semibold text-lg text-gray-900 dark:text-foreground">{t('ui.dashboard.inventorySetupTitle')}</h2></div><p className="mt-1 text-sm text-gray-600 dark:text-muted-foreground">{t('ui.dashboard.inventorySetupDescription', { count: data.inventorySetupCount })}</p></div>
          <Link href="/vendor/products" className="inline-flex items-center gap-1 self-start rounded-lg bg-white dark:bg-card px-3 py-2 text-sm font-semibold text-amber-800 dark:text-amber-200 ring-1 ring-amber-200 transition hover:bg-amber-50 dark:hover:bg-amber-500/10">{t('ui.dashboard.reviewCatalogue')} <ArrowRight size={15} /></Link>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">{data.inventorySetupItems.map((item) => <div key={`${item.productId}:${item.outletId}`} className="flex items-center gap-3 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/40 dark:bg-amber-500/10 p-3"><CompactThumbnail src={item.coverUrl} alt={item.productName} kind="product" size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-900 dark:text-foreground">{item.productName}</p><p className="mt-1 truncate text-xs text-gray-600 dark:text-muted-foreground">{item.outletName} · {t('ui.products.inventorySetupNeeded')}</p></div></div>)}</div>
      </section>}

      <VendorRevenueAssistantCard />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/vendor/bookings" className="flex items-center gap-3 rounded-2xl border border-gray-100 dark:border-border bg-white dark:bg-card p-4 shadow-sm transition hover:border-primary/20 hover:shadow-md"><CalendarDays className="text-primary" /><div><p className="text-sm font-semibold text-gray-900 dark:text-foreground">{t('ui.dashboard.bookingActivity')}</p><p className="text-xs text-gray-500 dark:text-muted-foreground">{t('ui.dashboard.itemsInPeriod', { count: data.stats.bookingItems })}</p></div></Link>
        <Link href="/vendor/products" className="flex items-center gap-3 rounded-2xl border border-gray-100 dark:border-border bg-white dark:bg-card p-4 shadow-sm transition hover:border-primary/20 hover:shadow-md"><Compass className="text-primary" /><div><p className="text-sm font-semibold text-gray-900 dark:text-foreground">{t('ui.dashboard.manageListings')}</p></div></Link>
        {!isOutletManager && <Link href="/vendor/vouchers" className="flex items-center gap-3 rounded-2xl border border-gray-100 dark:border-border bg-white dark:bg-card p-4 shadow-sm transition hover:border-primary/20 hover:shadow-md"><TicketPercent className="text-amber-700 dark:text-amber-200" /><div><p className="text-sm font-semibold text-gray-900 dark:text-foreground">{t('ui.dashboard.voucherCampaigns')}</p><p className="text-xs text-gray-500 dark:text-muted-foreground">{t('ui.dashboard.createOffers')}</p></div></Link>}
      </div>
    </div>
  );
}
