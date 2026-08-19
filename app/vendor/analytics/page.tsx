import { Activity, ArrowUpRight, BarChart3, CalendarDays, MapPinned, ShoppingBag } from 'lucide-react';
import { getServerTranslation } from '@/lib/i18n/server';
import { getVendorDashboardData, formatRM } from '@/lib/vendor-dashboard';
import SalesChart from '@/components/vendor/sales-chart';
import OutletPieChart from '@/components/vendor/outlet-pie-chart';
import { VendorShareAnalytics } from '@/components/vendor/vendor-share-analytics';

export default async function VendorAnalyticsPage() {
  const { t } = await getServerTranslation('vendor');
  const data = await getVendorDashboardData('12m');
  if (!data) return <div className="rounded-2xl bg-white p-10 text-center text-gray-500">{t('ui.analytics.noVendor')}</div>;

  return (
    <div className="space-y-8">
      <div><div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary"><BarChart3 size={15} /> {t('ui.analytics.malaysiaPerformance')}</div><h1 className="text-3xl font-bold tracking-tight text-gray-950">{t('ui.analytics.title')}</h1><p className="mt-1 text-sm text-gray-500">{t('ui.analytics.description')}</p></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><Activity className="mb-4 text-primary" size={20} /><p className="text-2xl font-bold text-gray-950">{formatRM(data.stats.totalRevenue)}</p><p className="mt-1 text-sm text-gray-500">{t('ui.analytics.revenueSelectedPeriod')}</p></div><div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><ShoppingBag className="mb-4 text-primary" size={20} /><p className="text-2xl font-bold text-gray-950">{data.stats.totalOrders.toLocaleString()}</p><p className="mt-1 text-sm text-gray-500">{t('ui.analytics.paidOrders')}</p></div><div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><MapPinned className="mb-4 text-amber-700" size={20} /><p className="text-2xl font-bold text-gray-950">{data.stats.activeOutlets}</p><p className="mt-1 text-sm text-gray-500">{t('ui.analytics.activeOutletsMalaysia')}</p></div></div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3"><div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2"><SalesChart data={data.chart} /></div><OutletPieChart data={data.salesByOutlet} total={data.totalOutletSales} /></div>
      <div className="rounded-2xl border border-primary/10 bg-secondary p-5 text-sm text-primary"><div className="flex items-start gap-3"><CalendarDays className="mt-0.5 shrink-0" size={18} /><p><strong>{t('ui.analytics.readingThisView')}</strong> {t('ui.analytics.readingDescription')}</p><ArrowUpRight className="ml-auto shrink-0" size={18} /></div></div>
      <VendorShareAnalytics />
    </div>
  );
}
