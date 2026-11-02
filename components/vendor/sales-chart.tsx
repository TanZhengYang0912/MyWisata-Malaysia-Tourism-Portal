'use client';

import { useState } from 'react';
import { CalendarDays, List, LineChart as LineChartIcon } from 'lucide-react';
import {
  CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { formatMYR, formatNumber } from '@/lib/i18n/format';
import { DEFAULT_LOCALE, isAppLocale } from '@/lib/i18n/locale';
import type { DashboardSalesMode } from '@/lib/vendor/dashboard-metrics';

interface SalesPoint {
  label: string;
  revenue: number;
  orders: number;
}

export default function SalesChart({ data, salesMode = 'live' }: { data: SalesPoint[]; salesMode?: DashboardSalesMode }) {
  const { t, i18n } = useTranslation('vendor');
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [view, setView] = useState<'timeline' | 'list'>('timeline');
  const [metric, setMetric] = useState<'revenue' | 'orders'>('revenue');

  return (
    <div className="flex min-h-[380px] flex-col">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            <LineChartIcon size={15} /> {t(salesMode === 'demo' ? 'ui.dashboard.salesMode.demo' : 'charts.sales.livePerformance')}
          </div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-foreground">{t('charts.sales.performance')}</h2>
          <p className="text-sm text-gray-500 dark:text-muted-foreground">{t(salesMode === 'demo' ? 'charts.sales.demoDescription' : 'charts.sales.description')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg bg-gray-100 dark:bg-muted p-1">
            <button type="button" onClick={() => setView('timeline')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === 'timeline' ? 'bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-sm' : 'text-gray-500 dark:text-muted-foreground'}`}>
              {t('charts.sales.timeline')}
            </button>
            <button type="button" onClick={() => setView('list')} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${view === 'list' ? 'bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-sm' : 'text-gray-500 dark:text-muted-foreground'}`}>
              <List size={14} className="mr-1 inline" /> {t('charts.sales.list')}
            </button>
          </div>
          <div className="rounded-lg border border-gray-200 dark:border-border p-2 text-gray-500 dark:text-muted-foreground" title={t('charts.sales.malaysiaTimezone')}>
            <CalendarDays size={16} />
          </div>
        </div>
      </div>

      {view === 'list' ? (
        <div className="divide-y divide-gray-100 dark:divide-border overflow-auto rounded-xl border border-gray-100 dark:border-border">
          {data.map((point) => (
            <div key={point.label} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="text-gray-500 dark:text-muted-foreground">{point.label}</span>
              <span className="font-semibold text-gray-900 dark:text-foreground">{formatMYR(point.revenue, locale, { minimumFractionDigits: 2 })}</span>
              <span className="text-gray-500 dark:text-muted-foreground">{t('charts.sales.orders', { count: formatNumber(point.orders, locale) })}</span>
            </div>
          ))}
          {!data.length && <div className="px-4 py-12 text-center text-sm text-gray-400 dark:text-muted-foreground">{t(salesMode === 'demo' ? 'charts.sales.noDemoActivity' : 'charts.sales.noPaidActivity')}</div>}
        </div>
      ) : (
        <div className="min-h-[280px] flex-1">
          {data.length ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#9ca3af', fontSize: 12 }} tickFormatter={(value) => metric === 'revenue' ? formatMYR(Number(value), locale) : formatNumber(Number(value), locale)} />
                <Tooltip formatter={(value) => [metric === 'revenue' ? formatMYR(Number(value), locale, { minimumFractionDigits: 2 }) : formatNumber(Number(value), locale), metric === 'revenue' ? t('charts.sales.revenue') : t('charts.sales.ordersLabel')]} />
                <Legend verticalAlign="bottom" height={32} iconType="circle" />
                <Line type="monotone" dataKey={metric} name={metric === 'revenue' ? t('charts.sales.revenueRM') : t('charts.sales.ordersQty')} stroke={metric === 'revenue' ? '#f59e0b' : '#010066'} strokeWidth={3} dot={{ r: 3, fill: '#fff', strokeWidth: 2 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-400 dark:text-muted-foreground">{t(salesMode === 'demo' ? 'charts.sales.noDemoActivity' : 'charts.sales.noPaidActivity')}</div>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center justify-center gap-2 text-xs text-gray-500 dark:text-muted-foreground">
        <button type="button" onClick={() => setMetric('revenue')} className={`rounded-full px-3 py-1 ${metric === 'revenue' ? 'bg-amber-50 dark:bg-amber-500/10 font-semibold text-amber-700 dark:text-amber-200' : ''}`}>{t('charts.sales.revenue')}</button>
        <button type="button" onClick={() => setMetric('orders')} className={`rounded-full px-3 py-1 ${metric === 'orders' ? 'bg-secondary font-semibold text-primary' : ''}`}>{t('charts.sales.ordersLabel')}</button>
      </div>
    </div>
  );
}
