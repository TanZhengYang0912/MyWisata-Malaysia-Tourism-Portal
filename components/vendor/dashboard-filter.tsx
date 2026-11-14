'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Calendar } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getMalaysiaDateRangeDefaults } from '@/lib/datetime/date-input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { normalizeDashboardSalesMode } from '@/lib/vendor/dashboard-metrics';

export default function DashboardFilter() {
  const { t } = useTranslation('vendor');
  const searchParams = useSearchParams();
  const router = useRouter();
  const modeParams = searchParams.getAll('sales');
  const salesMode = normalizeDashboardSalesMode(modeParams.length === 1 ? modeParams[0] : undefined);
  const [from, setFrom] = useState(searchParams.get('from') || '');
  const [to, setTo] = useState(searchParams.get('to') || '');
  const [isCustomOpen, setIsCustomOpen] = useState(false);

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
  const requestedFilter = searchParams.get('filter') || '30d';
  const filter = options.some((option) => option.value === requestedFilter) || requestedFilter === 'custom'
    ? requestedFilter
    : '30d';
  const selectedFilter = isCustomOpen || filter === 'custom' ? 'custom' : filter;

  return (
    <div className="flex w-full min-w-0 max-w-full items-center gap-2 md:w-auto">
      <Select value={salesMode} onValueChange={(value) => {
        if (value !== salesMode) router.push(filterHref({ sales: value }));
      }}>
        <SelectTrigger aria-label={t('ui.dashboard.salesScope')} className="h-10 w-auto min-w-0 flex-1 rounded-xl border-border bg-card px-3 text-sm font-medium sm:w-[10.5rem] sm:flex-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(['all', 'live', 'demo'] as const).map((mode) => (
            <SelectItem key={mode} value={mode}>{t(`ui.dashboard.salesMode.${mode}`)}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={selectedFilter}
        onValueChange={(value) => {
          if (value === 'custom') {
            setIsCustomOpen(true);
            return;
          }
          setIsCustomOpen(false);
          if (value !== filter) router.push(filterHref({ filter: value }));
        }}
      >
        <SelectTrigger aria-label={t('filters.dateRange')} className="h-10 w-auto min-w-0 flex-1 rounded-xl border-border bg-card px-3 text-sm font-medium sm:w-[10.5rem] sm:flex-none">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          <SelectItem value="custom">{t('filters.custom')}</SelectItem>
        </SelectContent>
      </Select>

      <details open={isCustomOpen} className="relative shrink-0">
        <summary
          aria-label={t('filters.custom')}
          aria-controls="dashboard-custom-date-filter"
          aria-expanded={isCustomOpen}
          onClick={(event) => {
            event.preventDefault();
            setIsCustomOpen((open) => !open);
          }}
          className={`[&::-webkit-details-marker]:hidden flex size-10 cursor-pointer list-none items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground ${filter === 'custom' || isCustomOpen ? 'bg-secondary text-primary' : ''}`}
        >
          <Calendar size={16} aria-hidden="true" />
          <span className="sr-only">{t('filters.custom')}</span>
        </summary>
        <form id="dashboard-custom-date-filter" className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-gray-200 dark:border-border bg-card p-3 shadow-xl" onSubmit={(event) => { event.preventDefault(); if (!from) return; router.push(filterHref({ filter: 'custom', from, to: to || null })); }}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-muted-foreground">{t('filters.dateRange')}</p>
          <label className="mb-2 block text-xs text-gray-600 dark:text-muted-foreground">{t('filters.from')}<input type="date" value={from} onFocus={primeDateRange} onChange={(event) => setFrom(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-gray-200 dark:border-border px-2 text-sm" required /></label>
          <label className="block text-xs text-gray-600 dark:text-muted-foreground">{t('filters.to')}<input type="date" value={to} min={from || undefined} onFocus={primeDateRange} onChange={(event) => setTo(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-gray-200 dark:border-border px-2 text-sm" /></label>
          <Button type="submit" className="mt-3 min-h-11 w-full rounded-lg bg-gray-900 text-xs font-semibold text-white hover:bg-gray-800">{t('filters.applyRange')}</Button>
        </form>
      </details>
    </div>
  );
}
