'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMalaysiaDateRangeDefaults } from '@/lib/datetime/date-input';
import { Button } from '@/components/ui/button';
import { normalizeDashboardSalesMode } from '@/lib/vendor/dashboard-metrics';

export default function DashboardFilter() {
  const { t } = useTranslation('vendor');
  const searchParams = useSearchParams();
  const router = useRouter();
  const filter = searchParams.get('filter') || '30d';
  const modeParams = searchParams.getAll('sales');
  const salesMode = normalizeDashboardSalesMode(modeParams.length === 1 ? modeParams[0] : undefined);
  const [from, setFrom] = useState(searchParams.get('from') || '');
  const [to, setTo] = useState(searchParams.get('to') || '');

  function filterHref(changes: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    return `?${params.toString()}`;
  }

  function primeDateRange() {
    const defaults = getMalaysiaDateRangeDefaults();
    setFrom((value) => value || defaults.from);
    setTo((value) => value || defaults.to);
  }

  const options = [
    { value: 'today', label: t('filters.today') },
    { value: '7d', label: t('filters.sevenDays') },
    { value: '30d', label: t('filters.thirtyDays') },
    { value: '12m', label: t('filters.twelveMonths') },
  ];

  return (
    <div className="flex max-w-full flex-col gap-2">
      <nav aria-label={t('ui.dashboard.salesScope')} className="flex flex-wrap gap-1 self-start rounded-xl border border-border bg-card p-1">
        {(['live', 'demo'] as const).map((mode) => (
          <Button key={mode} asChild size="sm" variant={salesMode === mode ? 'default' : 'ghost'}>
            <Link href={filterHref({ sales: mode })} aria-current={salesMode === mode ? 'page' : undefined}>{t(`ui.dashboard.salesMode.${mode}`)}</Link>
          </Button>
        ))}
      </nav>
      <div className="relative flex flex-wrap bg-white dark:bg-card rounded-xl border border-gray-200 dark:border-border p-1 shadow-sm">
        {options.map(opt => (
          <Link
            key={opt.value}
            href={filterHref({ filter: opt.value })}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              filter === opt.value
                ? 'bg-gray-100 dark:bg-muted font-semibold text-gray-900 dark:text-foreground'
                : 'font-medium text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground'
            }`}
          >
            {opt.label}
          </Link>
        ))}
        <div className="w-[1px] bg-gray-200 dark:bg-secondary my-1 mx-1"></div>
        <details>
          <summary className={`flex cursor-pointer list-none items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors ${filter === 'custom' ? 'bg-gray-100 dark:bg-muted font-semibold text-gray-900 dark:text-foreground' : 'text-gray-500 dark:text-muted-foreground hover:text-gray-700 dark:hover:text-foreground'}`}><Calendar size={16} /> {t('filters.custom')}</summary>
          <form className="absolute left-0 top-full sm:left-auto sm:right-0 z-20 mt-2 w-64 rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-3 shadow-xl" onSubmit={(event) => { event.preventDefault(); if (!from) return; router.push(filterHref({ filter: 'custom', from, to: to || null })); }}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-muted-foreground">{t('filters.dateRange')}</p>
            <label className="mb-2 block text-xs text-gray-600 dark:text-muted-foreground">{t('filters.from')}<input type="date" value={from} onFocus={primeDateRange} onChange={(event) => setFrom(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-gray-200 dark:border-border px-2 text-sm" required /></label>
            <label className="block text-xs text-gray-600 dark:text-muted-foreground">{t('filters.to')}<input type="date" value={to} min={from || undefined} onFocus={primeDateRange} onChange={(event) => setTo(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-gray-200 dark:border-border px-2 text-sm" /></label>
            <button type="submit" className="mt-3 w-full rounded-lg bg-gray-900 px-3 py-2 text-xs font-semibold text-white">{t('filters.applyRange')}</button>
          </form>
        </details>
      </div>
    </div>
  );
}
