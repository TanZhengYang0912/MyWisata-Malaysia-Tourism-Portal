'use client';

import { useState } from 'react';
import {
  Activity, ArrowUpRight, BarChart3, CalendarClock, ChartNoAxesCombined,
  CircleAlert, Clock3, MousePointerClick, PackageSearch, Sparkles, Star, Store, Target,
} from 'lucide-react';
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { formatMYR, formatNumber } from '@/lib/i18n/format';
import { DEFAULT_LOCALE, isAppLocale } from '@/lib/i18n/locale';
import type { VendorAnalyticsSnapshot } from '@/lib/vendor/analytics';
import { VendorShareAnalytics } from '@/components/vendor/vendor-share-analytics';

const NAVY = '#10164a';
const ORANGE = '#e89224';
const TEAL = '#3f7f72';
const MUTED = '#94a3b8';

type TrendMetric = 'revenue' | 'averageOrderValue' | 'orders';

export function VendorAnalyticsWorkspace({ data }: { data: VendorAnalyticsSnapshot }) {
  const { t, i18n } = useTranslation('vendor');
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [trendMetric, setTrendMetric] = useState<TrendMetric>('revenue');
  const [productMode, setProductMode] = useState<'revenue' | 'units'>('revenue');
  const maxDemand = Math.max(1, ...data.demand.map((cell) => cell.orders));
  const heatmapHours = Array.from({ length: 15 }, (_, index) => index + 8);
  const demandAt = (weekday: number, hour: number) => data.demand.find((cell) => cell.weekday === weekday && cell.hour === hour)?.orders || 0;
  const productScatter = data.products.map((product) => ({ ...product, x: product.units, y: product.revenue, z: Math.max(40, product.reviews * 30) }));
  const weekdayLabels = [
    t('ui.analytics.weekdays.mon'), t('ui.analytics.weekdays.tue'), t('ui.analytics.weekdays.wed'),
    t('ui.analytics.weekdays.thu'), t('ui.analytics.weekdays.fri'), t('ui.analytics.weekdays.sat'), t('ui.analytics.weekdays.sun'),
  ];

  function money(value: number) {
    return formatMYR(value, locale);
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary"><ChartNoAxesCombined size={15} /> {t('ui.analytics.eyebrow')}</div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-950 sm:text-4xl">{t('ui.analytics.title')}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">{t('ui.analytics.description')}</p>
        </div>
        <form action="/vendor/analytics" method="get" className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
          <label className="sr-only" htmlFor="analytics-filter">{t('ui.analytics.controls.period')}</label>
          <select id="analytics-filter" name="filter" defaultValue={data.filter} className="h-10 rounded-xl border-0 bg-gray-50 px-3 text-sm font-semibold text-gray-700 outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-primary">
            <option value="7d">{t('ui.analytics.controls.last7Days')}</option>
            <option value="30d">{t('ui.analytics.controls.last30Days')}</option>
            <option value="12m">{t('ui.analytics.controls.last12Months')}</option>
          </select>
          <label className="sr-only" htmlFor="analytics-outlet">{t('ui.analytics.controls.outlet')}</label>
          <select id="analytics-outlet" name="outlet" defaultValue={data.selectedOutletId || ''} className="h-10 max-w-52 rounded-xl border-0 bg-gray-50 px-3 text-sm text-gray-700 outline-none ring-1 ring-gray-200 focus:ring-2 focus:ring-primary">
            <option value="">{t('ui.analytics.controls.allOutlets')}</option>
            {data.outletsAvailable.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}
          </select>
          <button type="submit" className="h-10 rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary/90">{t('ui.analytics.controls.apply')}</button>
        </form>
      </header>

      <section className="overflow-hidden rounded-[1.75rem] bg-[#10164a] text-white shadow-xl shadow-primary/10">
        <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-orange-200"><Sparkles size={14} /> {t('ui.analytics.insightLabel')}</div>
            <h2 className="max-w-xl text-2xl font-semibold leading-tight sm:text-3xl">{t('ui.analytics.insightTitle')}</h2>
            <p className="mt-3 max-w-xl text-sm leading-6 text-indigo-100">{t('ui.analytics.insightDescription')}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 self-end sm:grid-cols-4 lg:grid-cols-2">
            <InsightStat label={t('ui.analytics.metrics.averageOrderValue')} value={money(data.metrics.averageOrderValue)} />
            <InsightStat label={t('ui.analytics.metrics.bookingShare')} value={`${data.bookingMix.bookingShare}%`} />
            <InsightStat label={t('ui.analytics.metrics.averageRating')} value={data.metrics.averageRating === null ? '—' : `${data.metrics.averageRating}/5`} />
            <InsightStat label={t('ui.analytics.metrics.reviewCount')} value={formatNumber(data.metrics.reviewCount, locale)} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/10 px-6 py-4 text-xs text-indigo-100 lg:px-8">
          <span>{t('ui.analytics.periodLabel')}: <strong className="text-white">{new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(data.range.start))} — {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(data.range.end))}</strong></span>
          <span className="inline-flex items-center gap-1.5"><Activity size={13} className="text-orange-300" /> {t('ui.analytics.revenueTracked')}</span>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={Activity} label={t('ui.analytics.metrics.revenuePerOutlet')} value={money(data.metrics.revenuePerOutlet)} note={t('ui.analytics.metricNotes.revenuePerOutlet')} tone="navy" />
        <MetricCard icon={Target} label={t('ui.analytics.metrics.topProductShare')} value={`${data.metrics.topProductShare}%`} note={t('ui.analytics.metricNotes.topProductShare')} tone="teal" />
        <MetricCard icon={PackageSearch} label={t('ui.analytics.metrics.productsWithSales')} value={formatNumber(data.metrics.productsWithSales, locale)} note={t('ui.analytics.metricNotes.productsWithSales')} tone="orange" />
        <MetricCard icon={Store} label={t('ui.analytics.metrics.peakWindowOrders')} value={formatNumber(data.metrics.peakWindowOrders, locale)} note={t('ui.analytics.metricNotes.peakWindowOrders')} tone="slate" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.45fr_0.55fr]">
        <Panel eyebrow={t('ui.analytics.revenueQuality.eyebrow')} title={t('ui.analytics.revenueQuality.title')} description={t('ui.analytics.revenueQuality.description')} icon={BarChart3}>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex rounded-xl bg-gray-100 p-1">
              {(['revenue', 'averageOrderValue', 'orders'] as TrendMetric[]).map((metric) => <button key={metric} type="button" onClick={() => setTrendMetric(metric)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${trendMetric === metric ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>{t(`ui.analytics.revenueQuality.metrics.${metric}`)}</button>)}
            </div>
            <span className="text-xs text-gray-400">{t('ui.analytics.revenueQuality.trendHint')}</span>
          </div>
          <div className="h-[280px] w-full">
            {data.trend.length ? <ResponsiveContainer width="100%" height="100%"><LineChart data={data.trend} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: MUTED, fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: MUTED, fontSize: 12 }} tickFormatter={(value) => trendMetric === 'orders' ? formatNumber(Number(value), locale) : money(Number(value))} />
              <Tooltip formatter={(value) => [trendMetric === 'orders' ? formatNumber(Number(value), locale) : money(Number(value)), t(`ui.analytics.revenueQuality.metrics.${trendMetric}`)]} contentStyle={{ borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 10px 30px rgba(15,23,42,.08)' }} />
              <Line type="monotone" dataKey={trendMetric} stroke={trendMetric === 'revenue' ? ORANGE : TEAL} strokeWidth={3} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 6 }} />
            </LineChart></ResponsiveContainer> : <EmptyState text={t('ui.analytics.empty.trend')} />}
          </div>
        </Panel>

        <Panel eyebrow={t('ui.analytics.bookingMix.eyebrow')} title={t('ui.analytics.bookingMix.title')} description={t('ui.analytics.bookingMix.description')} icon={CalendarClock}>
          <div className="flex h-[280px] flex-col justify-center">
            <div className="relative mx-auto flex h-44 w-44 items-center justify-center rounded-full" style={{ background: `conic-gradient(${ORANGE} ${data.bookingMix.bookingShare}%, #e2e8f0 0)` }}>
              <div className="flex h-32 w-32 flex-col items-center justify-center rounded-full bg-white text-center"><span className="text-3xl font-bold text-gray-950">{data.bookingMix.bookingShare}%</span><span className="text-xs text-gray-500">{t('ui.analytics.bookingMix.booked')}</span></div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-center text-xs">
              <div className="rounded-xl bg-orange-50 px-3 py-2"><p className="font-bold text-orange-800">{data.bookingMix.bookedOrders}</p><p className="mt-1 text-orange-700">{t('ui.analytics.bookingMix.booked')}</p></div>
              <div className="rounded-xl bg-gray-50 px-3 py-2"><p className="font-bold text-gray-800">{data.bookingMix.nonBookedOrders}</p><p className="mt-1 text-gray-500">{t('ui.analytics.bookingMix.nonBooked')}</p></div>
            </div>
          </div>
        </Panel>
      </section>

      <Panel eyebrow={t('ui.analytics.demandHeatmap.eyebrow')} title={t('ui.analytics.demandHeatmap.title')} description={t('ui.analytics.demandHeatmap.description')} icon={Clock3}>
        <div className="overflow-x-auto pb-1">
          <div className="min-w-[680px]">
            <div className="mb-2 grid grid-cols-[72px_repeat(15,minmax(28px,1fr))] gap-1 text-center text-[10px] font-semibold text-gray-400"><span />{heatmapHours.map((hour) => <span key={hour}>{hour}</span>)}</div>
            {weekdayLabels.map((day, weekday) => <div key={day} className="mb-1 grid grid-cols-[72px_repeat(15,minmax(28px,1fr))] items-center gap-1"><span className="text-xs font-semibold text-gray-600">{day}</span>{heatmapHours.map((hour) => { const value = demandAt(weekday, hour); return <div key={hour} title={`${day} ${hour}:00 · ${value} ${t('ui.analytics.demandHeatmap.orders')}`} className="h-7 rounded-md border border-white transition-transform hover:scale-110" style={{ backgroundColor: value ? `color-mix(in srgb, ${TEAL} ${30 + Math.round((value / maxDemand) * 70)}%, white)` : '#f1f5f9' }} />; })}</div>)}
            <div className="mt-4 flex items-center justify-end gap-2 text-[10px] text-gray-400"><span>{t('ui.analytics.demandHeatmap.less')}</span><span className="h-3 w-3 rounded bg-slate-100" /><span className="h-3 w-3 rounded bg-[#9bc5bb]" /><span className="h-3 w-3 rounded bg-[#3f7f72]" /><span>{t('ui.analytics.demandHeatmap.more')}</span></div>
          </div>
        </div>
      </Panel>

      <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel eyebrow={t('ui.analytics.productPortfolio.eyebrow')} title={t('ui.analytics.productPortfolio.title')} description={t('ui.analytics.productPortfolio.description')} icon={PackageSearch}>
          <div className="mb-4 flex items-center justify-between gap-3"><span className="text-xs text-gray-400">{t('ui.analytics.productPortfolio.axisHint')}</span><div className="flex rounded-lg bg-gray-100 p-1">{(['revenue', 'units'] as const).map((mode) => <button key={mode} type="button" onClick={() => setProductMode(mode)} className={`rounded-md px-2.5 py-1 text-xs font-semibold ${productMode === mode ? 'bg-white text-primary shadow-sm' : 'text-gray-500'}`}>{t(`ui.analytics.productPortfolio.${mode}`)}</button>)}</div></div>
          <div className="h-[270px]">
            {productScatter.length ? <ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 10, right: 16, bottom: 10, left: 0 }}>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" />
              <XAxis type="number" dataKey="units" name={t('ui.analytics.productPortfolio.units')} tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="number" dataKey={productMode === 'revenue' ? 'revenue' : 'rating'} name={t(`ui.analytics.productPortfolio.${productMode}`)} tick={{ fill: MUTED, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(value) => productMode === 'revenue' ? money(Number(value)) : `${value}/5`} />
              <ZAxis type="number" dataKey="z" range={[70, 420]} />
              <Tooltip cursor={{ strokeDasharray: '4 4' }} formatter={(value, name) => [name === t('ui.analytics.productPortfolio.revenue') ? money(Number(value)) : value, name]} labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''} contentStyle={{ borderRadius: 14, border: '1px solid #e2e8f0' }} />
              <Scatter data={productScatter} fill={ORANGE} />
            </ScatterChart></ResponsiveContainer> : <EmptyState text={t('ui.analytics.empty.products')} />}
          </div>
          <div className="mt-4 divide-y divide-gray-100 rounded-xl border border-gray-100">{data.products.slice(0, 5).map((product, index) => <div key={product.id} className="flex items-center gap-3 px-3 py-3 text-sm"><span className="w-5 text-xs font-bold text-gray-400">0{index + 1}</span><div className="min-w-0 flex-1"><p className="truncate font-semibold text-gray-900">{product.name}</p><p className="mt-0.5 truncate text-xs text-gray-500">{product.outletName} · {product.units} {t('ui.analytics.productPortfolio.units')}</p></div><span className="font-semibold text-gray-900">{money(product.revenue)}</span></div>)}{!data.products.length && <EmptyState text={t('ui.analytics.empty.products')} />}</div>
        </Panel>

        <Panel eyebrow={t('ui.analytics.outletPerformance.eyebrow')} title={t('ui.analytics.outletPerformance.title')} description={t('ui.analytics.outletPerformance.description')} icon={Store}>
          <div className="h-[270px]">{data.outlets.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={data.outlets.slice(0, 6)} layout="vertical" margin={{ top: 6, right: 12, left: 8, bottom: 0 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" horizontal={false} />
            <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: MUTED, fontSize: 11 }} tickFormatter={(value) => money(Number(value))} />
            <YAxis type="category" dataKey="name" width={94} axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 11 }} />
            <Tooltip formatter={(value) => [money(Number(value)), t('ui.analytics.metrics.revenue')]} contentStyle={{ borderRadius: 14, border: '1px solid #e2e8f0' }} />
            <Bar dataKey="revenue" fill={NAVY} radius={[0, 6, 6, 0]} barSize={18} />
          </BarChart></ResponsiveContainer> : <EmptyState text={t('ui.analytics.empty.outlets')} />}</div>
          <div className="mt-4 space-y-2">{data.outlets.slice(0, 4).map((outlet) => <div key={outlet.id} className="flex items-center gap-3 text-xs"><span className="min-w-0 flex-1 truncate font-semibold text-gray-700">{outlet.name}</span><span className="text-gray-400">{outlet.orders} {t('ui.analytics.outletPerformance.orders')}</span><span className="w-12 text-right font-bold text-primary">{outlet.revenueShare}%</span></div>)}</div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.72fr_1.28fr]">
        <Panel eyebrow={t('ui.analytics.customerSignal.eyebrow')} title={t('ui.analytics.customerSignal.title')} description={t('ui.analytics.customerSignal.description')} icon={Star}>
          <div className="h-[250px]">{data.metrics.reviewCount ? <ResponsiveContainer width="100%" height="100%"><BarChart data={data.ratingDistribution} margin={{ top: 12, right: 8, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="rating" tickFormatter={(value) => `${value}★`} axisLine={false} tickLine={false} tick={{ fill: MUTED, fontSize: 11 }} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: MUTED, fontSize: 11 }} />
            <Tooltip formatter={(value) => [value, t('ui.analytics.customerSignal.reviews')]} contentStyle={{ borderRadius: 14, border: '1px solid #e2e8f0' }} />
            <Bar dataKey="count" radius={[6, 6, 0, 0]}>{data.ratingDistribution.map((entry) => <Cell key={entry.rating} fill={entry.rating >= 4 ? TEAL : entry.rating === 3 ? ORANGE : '#be5b5b'} />)}</Bar>
          </BarChart></ResponsiveContainer> : <EmptyState text={t('ui.analytics.empty.reviews')} />}</div>
          <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 px-3 py-3 text-xs"><span className="text-gray-500">{t('ui.analytics.metrics.averageRating')}</span><span className="inline-flex items-center gap-1 font-bold text-gray-900"><Star size={14} className="fill-orange-400 text-orange-400" /> {data.metrics.averageRating === null ? '—' : `${data.metrics.averageRating}/5`}</span></div>
        </Panel>

        <Panel eyebrow={t('ui.analytics.actionQueue.eyebrow')} title={t('ui.analytics.actionQueue.title')} description={t('ui.analytics.actionQueue.description')} icon={CircleAlert}>
          <div className="grid gap-3 sm:grid-cols-3">{data.insights.map((insight, index) => <div key={insight.kind} className="rounded-2xl border border-gray-100 bg-gradient-to-br from-white to-gray-50 p-4"><div className="flex items-center justify-between"><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${index === 0 ? 'bg-orange-50 text-orange-700' : index === 1 ? 'bg-secondary text-primary' : 'bg-indigo-50 text-indigo-700'}`}>{index === 0 ? <ArrowUpRight size={17} /> : index === 1 ? <Clock3 size={17} /> : <Store size={17} />}</span><span className="text-xs font-bold text-gray-400">{insight.value}</span></div><p className="mt-4 text-sm font-bold text-gray-900">{t(insight.titleKey)}</p><p className="mt-1 text-xs leading-5 text-gray-500">{t(insight.descriptionKey)}</p></div>)}{!data.insights.length && <EmptyState text={t('ui.analytics.empty.insights')} />}</div>
        </Panel>
      </section>

      <section className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60 p-5">
        <div className="flex items-start gap-3"><MousePointerClick className="mt-0.5 shrink-0 text-amber-700" size={18} /><div><h2 className="font-semibold text-gray-900">{t('ui.analytics.marketingAttribution.title')}</h2><p className="mt-1 text-sm leading-6 text-gray-600">{t('ui.analytics.marketingAttribution.description')}</p></div></div>
        <div className="mt-5"><VendorShareAnalytics /></div>
      </section>

      <div className="flex items-start gap-3 rounded-2xl border border-primary/10 bg-secondary/70 p-5 text-sm text-primary"><Sparkles className="mt-0.5 shrink-0" size={17} /><p><strong>{t('ui.analytics.dataNote.title')}</strong> {t('ui.analytics.dataNote.description')}</p></div>
    </div>
  );
}

function Panel({ eyebrow, title, description, icon: Icon, children }: { eyebrow: string; title: string; description: string; icon: typeof BarChart3; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex items-start justify-between gap-4"><div><div className="mb-1 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-primary"><Icon size={14} /> {eyebrow}</div><h2 className="text-lg font-bold text-gray-950">{title}</h2><p className="mt-1 max-w-2xl text-sm leading-5 text-gray-500">{description}</p></div></div>{children}</section>;
}

function MetricCard({ icon: Icon, label, value, note, tone }: { icon: typeof Activity; label: string; value: string; note: string; tone: 'navy' | 'teal' | 'orange' | 'slate' }) {
  const tones = { navy: 'bg-indigo-50 text-primary', teal: 'bg-emerald-50 text-emerald-700', orange: 'bg-orange-50 text-orange-700', slate: 'bg-slate-100 text-slate-600' };
  return <article className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center gap-3"><span className={`flex h-10 w-10 items-center justify-center rounded-xl ${tones[tone]}`}><Icon size={18} /></span><span className="text-sm font-semibold text-gray-600">{label}</span></div><p className="mt-5 text-2xl font-bold tracking-tight text-gray-950">{value}</p><p className="mt-1 text-xs text-gray-400">{note}</p></article>;
}

function InsightStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/10 p-4"><p className="text-xs text-indigo-200">{label}</p><p className="mt-2 text-xl font-bold text-white">{value}</p></div>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="flex h-full min-h-24 items-center justify-center text-center text-sm text-gray-400">{text}</div>;
}
