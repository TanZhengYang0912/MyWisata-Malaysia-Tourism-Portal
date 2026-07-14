// Vendor dashboard — all figures are derived from the remote Supabase database.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  AlertTriangle, ArrowRight, ArrowUpRight, Banknote, CalendarDays, Compass, Landmark, MapPinned, ShoppingBag, TicketPercent,
} from 'lucide-react';
import { getVendorDashboardData, formatGrowth, formatRM, type DashboardFilter } from '@/lib/vendor-dashboard';
import SalesChart from '@/components/vendor/sales-chart';
import OutletPieChart from '@/components/vendor/outlet-pie-chart';
import DashboardFilterControl from '@/components/vendor/dashboard-filter';
import DashboardRealtime from '@/components/vendor/dashboard-realtime';
import RecentTransactions from '@/components/vendor/recent-transactions';
import PerformanceRankingCard from '@/components/vendor/performance-ranking-card';
import CompactThumbnail from '@/components/vendor/compact-thumbnail';
import { dashboardFilterLabel } from '@/lib/vendor/performance-ranking';

interface Props { searchParams?: Promise<{ filter?: string; from?: string; to?: string }> }

const FILTERS: DashboardFilter[] = ['today', '7d', '30d', '12m', 'custom'];

function normalizeFilter(value: string | undefined): DashboardFilter {
  return FILTERS.includes(value as DashboardFilter) ? value as DashboardFilter : '7d';
}

function statTone(tone: string) {
  return {
    teal: 'bg-secondary text-primary',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-secondary text-primary',
    rose: 'bg-rose-50 text-rose-700',
  }[tone] || 'bg-gray-100 text-gray-700';
}

export default async function VendorDashboard({ searchParams }: Props) {
  const params = await searchParams;
  const filter = normalizeFilter(params?.filter);
  const data = await getVendorDashboardData(filter, { from: params?.from, to: params?.to });
  if (!data) redirect('/login');
  const isOutletManager = data.role === 'outlet_manager';

  const stats = isOutletManager ? [
    { label: 'Total revenue', value: formatRM(data.stats.totalRevenue), note: formatGrowth(data.stats.revenueGrowth), icon: Banknote, tone: 'teal' },
    { label: 'Total orders', value: data.stats.totalOrders.toLocaleString(), note: formatGrowth(data.stats.ordersGrowth), icon: ShoppingBag, tone: 'blue' },
    { label: 'Booking activity', value: data.stats.bookingItems.toLocaleString(), note: 'Bookings in this period', icon: CalendarDays, tone: 'teal' },
    { label: 'Orders to fulfil', value: data.stats.pendingOrders.toLocaleString(), note: 'Assigned outlet operations', icon: ShoppingBag, tone: 'amber' },
  ] : [
    { label: 'Total revenue', value: formatRM(data.stats.totalRevenue), note: formatGrowth(data.stats.revenueGrowth), icon: Banknote, tone: 'teal' },
    { label: 'Total orders', value: data.stats.totalOrders.toLocaleString(), note: formatGrowth(data.stats.ordersGrowth), icon: ShoppingBag, tone: 'blue' },
    { label: 'Active listings', value: data.stats.activeProducts.toLocaleString(), note: 'Published products and experiences', icon: Compass, tone: 'amber' },
    { label: 'Outlets managed', value: data.stats.activeOutlets.toLocaleString(), note: 'Across Malaysia', icon: MapPinned, tone: 'rose' },
  ];

  return (
    <div className="space-y-8">
      <DashboardRealtime vendorId={data.vendor.id} />
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary"><Landmark size={15} /> Malaysia tourism partner portal</div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-950">{isOutletManager ? 'Outlet operations' : 'Overview'}</h1>
          <p className="mt-1 text-sm text-gray-500">{isOutletManager ? 'Keep your assigned outlet moving today.' : <>Here&apos;s what&apos;s happening with <span className="font-semibold text-gray-800">{data.vendor.name}</span> today.</>}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DashboardFilterControl />
          <div className="inline-flex items-center gap-2 rounded-xl border border-primary/10 bg-secondary px-4 py-2 text-sm font-semibold text-primary"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-nature-green/60 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" /></span>Live</div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, note, icon: Icon, tone }) => (
          <article key={label} className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="absolute -right-3 -top-3 opacity-[0.045] transition group-hover:scale-110"><Icon size={104} /></div>
            <div className="mb-5 flex items-center gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-full ${statTone(tone)}`}><Icon size={20} /></div><p className="font-medium text-gray-600">{label}</p></div>
            <p className="text-3xl font-bold tracking-tight text-gray-950">{value}</p>
            <div className={`mt-3 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${note.includes('vs previous') && !note.startsWith('-') ? 'bg-secondary text-primary' : 'bg-gray-50 text-gray-500'}`}><ArrowUpRight size={13} />{note}</div>
          </article>
        ))}
      </section>

      {data.stats.totalOrders === 0 && <section className="flex flex-col gap-3 rounded-2xl border border-primary/10 bg-secondary/70 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold text-primary">No orders in this period</p><p className="mt-1 text-sm text-primary">Check another date range, or publish a listing so travellers can start booking.</p></div><div className="flex gap-2"><Link href="/vendor/products" className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-primary ring-1 ring-primary/20">Manage listings</Link><Link href="/vendor/orders" className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white">View orders</Link></div></section>}

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2"><SalesChart data={data.chart} /></div>
        <OutletPieChart data={data.salesByOutlet} total={data.totalOutletSales} />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <PerformanceRankingCard kind="selling" periodLabel={dashboardFilterLabel(data.filter)} items={data.topSelling} href="/vendor/products" />
        <PerformanceRankingCard kind="rated" periodLabel={dashboardFilterLabel(data.filter)} items={data.topRated} href="/vendor/analytics" />
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50/60 p-6 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-lg text-gray-900">Recent transactions</h2><p className="mt-1 text-sm text-gray-500">{isOutletManager ? 'Latest orders for your assigned outlet' : 'Latest orders across your Malaysian outlets'}</p></div><Link href="/vendor/orders" className="inline-flex items-center gap-1 self-start rounded-lg bg-secondary px-3 py-2 text-sm font-semibold text-primary transition hover:bg-secondary/80">View all <ArrowRight size={15} /></Link></div>
        <RecentTransactions items={data.recentTransactions} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-amber-100 bg-white shadow-sm">
        <div className="flex flex-col gap-2 border-b border-amber-100 bg-amber-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-2"><AlertTriangle size={18} className="text-amber-700" /><h2 className="font-semibold text-lg text-gray-900">Stock alerts</h2></div><p className="mt-1 text-sm text-gray-600">Supabase inventory updates appear here automatically when stock reaches its threshold.</p></div>
          <Link href="/vendor/products" className="inline-flex items-center gap-1 self-start rounded-lg bg-white px-3 py-2 text-sm font-semibold text-amber-800 ring-1 ring-amber-200 transition hover:bg-amber-50">Review catalogue <ArrowRight size={15} /></Link>
        </div>
        {data.stockAlerts.length ? <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">{data.stockAlerts.map((alert) => <div key={alert.variantId} className={`flex items-center gap-3 rounded-xl border p-3 ${alert.available === 0 ? 'border-red-200 bg-red-50/60' : 'border-amber-200 bg-amber-50/40'}`}><CompactThumbnail src={alert.coverUrl} alt={alert.productName} kind="product" size="sm" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-900">{alert.productName}</p><p className="mt-1 truncate text-xs text-gray-600">{alert.variantName} · {alert.available === 0 ? 'Out of stock' : `${alert.available} available`} · alert at {alert.threshold}</p></div></div>)}</div> : <div className="px-5 py-8 text-sm text-gray-500">No low-stock items in your assigned outlets.</div>}
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/vendor/bookings" className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-primary/20 hover:shadow-md"><CalendarDays className="text-primary" /><div><p className="text-sm font-semibold text-gray-900">Booking activity</p><p className="text-xs text-gray-500">{data.stats.bookingItems} items in this period</p></div></Link>
        <Link href="/vendor/products" className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-primary/20 hover:shadow-md"><Compass className="text-primary" /><div><p className="text-sm font-semibold text-gray-900">Manage listings</p><p className="text-xs text-gray-500">Keep your experiences current</p></div></Link>
        {!isOutletManager && <Link href="/vendor/vouchers" className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-primary/20 hover:shadow-md"><TicketPercent className="text-amber-700" /><div><p className="text-sm font-semibold text-gray-900">Voucher campaigns</p><p className="text-xs text-gray-500">Create offers for travellers</p></div></Link>}
      </div>
    </div>
  );
}
