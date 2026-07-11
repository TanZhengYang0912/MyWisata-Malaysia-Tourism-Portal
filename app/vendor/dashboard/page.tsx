// Vendor dashboard — all figures are derived from the remote Supabase database.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ArrowRight, ArrowUpRight, Banknote, CalendarDays, Compass, Landmark, MapPinned, ShoppingBag, TicketPercent, Utensils,
} from 'lucide-react';
import { getVendorDashboardData, formatGrowth, formatRM, type DashboardFilter } from '@/lib/vendor-dashboard';
import SalesChart from '@/components/vendor/sales-chart';
import OutletPieChart from '@/components/vendor/outlet-pie-chart';
import DashboardFilterControl from '@/components/vendor/dashboard-filter';
import DashboardRealtime from '@/components/vendor/dashboard-realtime';
import RecentTransactions from '@/components/vendor/recent-transactions';
import CompactThumbnail from '@/components/vendor/compact-thumbnail';

interface Props { searchParams?: Promise<{ filter?: string }> }

const FILTERS: DashboardFilter[] = ['today', '7d', '30d', '12m'];

function normalizeFilter(value: string | undefined): DashboardFilter {
  return FILTERS.includes(value as DashboardFilter) ? value as DashboardFilter : '7d';
}

function statTone(tone: string) {
  return {
    teal: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-sky-50 text-sky-700',
    rose: 'bg-rose-50 text-rose-700',
  }[tone] || 'bg-gray-100 text-gray-700';
}

export default async function VendorDashboard({ searchParams }: Props) {
  const params = await searchParams;
  const filter = normalizeFilter(params?.filter);
  const data = await getVendorDashboardData(filter);
  if (!data) redirect('/login');

  const stats = [
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
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700"><Landmark size={15} /> Malaysia tourism partner portal</div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-950">Overview</h1>
          <p className="mt-1 text-sm text-gray-500">Here&apos;s what&apos;s happening with <span className="font-semibold text-gray-800">{data.vendor.name}</span> today.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <DashboardFilterControl />
          <div className="inline-flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-800"><span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>Live</div>
        </div>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ label, value, note, icon: Icon, tone }) => (
          <article key={label} className="group relative overflow-hidden rounded-2xl border border-gray-100 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="absolute -right-3 -top-3 opacity-[0.045] transition group-hover:scale-110"><Icon size={104} /></div>
            <div className="mb-5 flex items-center gap-3"><div className={`flex h-10 w-10 items-center justify-center rounded-full ${statTone(tone)}`}><Icon size={20} /></div><p className="font-medium text-gray-600">{label}</p></div>
            <p className="text-3xl font-bold tracking-tight text-gray-950">{value}</p>
            <div className={`mt-3 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${note.includes('vs previous') && !note.startsWith('-') ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500'}`}><ArrowUpRight size={13} />{note}</div>
          </article>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm lg:col-span-2"><SalesChart data={data.chart} /></div>
        <OutletPieChart data={data.salesByOutlet} total={data.totalOutletSales} />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 p-6"><div><h2 className="font-semibold text-lg text-gray-900">Top selling products</h2><p className="mt-1 text-sm text-gray-500">Based on paid order quantity</p></div><Utensils className="text-emerald-700" size={20} /></div>
          <div className="divide-y divide-gray-100">{data.topSelling.map((item) => <div key={item.name} className="flex items-center gap-3 px-5 py-3 transition hover:bg-emerald-50/30"><CompactThumbnail src={item.coverUrl} alt={item.name} kind={item.name.toLowerCase().includes('food') ? 'food' : 'product'} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-900">{item.name}</p><p className="mt-1 text-xs text-gray-500">{item.quantity} units sold</p></div><div className="text-right"><p className="text-sm font-bold text-gray-900">{formatRM(item.revenue)}</p><p className="mt-1 text-[11px] text-gray-400">Revenue</p></div></div>)}{!data.topSelling.length && <div className="px-4 py-10 text-center text-gray-400">No paid products in this period.</div>}</div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-100 p-6"><div><h2 className="font-semibold text-lg text-gray-900">Top rated experiences</h2><p className="mt-1 text-sm text-gray-500">Visible activity and experience reviews</p></div><Landmark className="text-amber-600" size={20} /></div>
          <div className="divide-y divide-gray-100">{data.topRated.map((item) => <div key={item.name} className="flex items-center gap-3 px-5 py-3 transition hover:bg-amber-50/30"><CompactThumbnail src={item.coverUrl} alt={item.name} kind="experience" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-900">{item.name}</p><p className="mt-1 text-xs text-gray-500">{item.reviews} traveller reviews</p></div><div className="text-right"><p className="text-sm font-bold text-amber-600">★ {item.rating.toFixed(1)}</p><p className="mt-1 text-[11px] text-gray-400">Rating</p></div></div>)}{!data.topRated.length && <div className="px-4 py-10 text-center text-gray-400">No experience reviews yet.</div>}</div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50/60 p-6 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-lg text-gray-900">Recent transactions</h2><p className="mt-1 text-sm text-gray-500">Latest orders across your Malaysian outlets</p></div><Link href="/vendor/orders" className="inline-flex items-center gap-1 self-start rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 transition hover:bg-emerald-100">View all <ArrowRight size={15} /></Link></div>
        <RecentTransactions items={data.recentTransactions} />
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/vendor/bookings" className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-emerald-200 hover:shadow-md"><CalendarDays className="text-emerald-700" /><div><p className="text-sm font-semibold text-gray-900">Booking activity</p><p className="text-xs text-gray-500">{data.stats.bookingItems} items in this period</p></div></Link>
        <Link href="/vendor/products" className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-emerald-200 hover:shadow-md"><Compass className="text-sky-700" /><div><p className="text-sm font-semibold text-gray-900">Manage listings</p><p className="text-xs text-gray-500">Keep your experiences current</p></div></Link>
        <Link href="/vendor/vouchers" className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-emerald-200 hover:shadow-md"><TicketPercent className="text-amber-700" /><div><p className="text-sm font-semibold text-gray-900">Voucher campaigns</p><p className="text-xs text-gray-500">Create offers for travellers</p></div></Link>
      </div>
    </div>
  );
}
