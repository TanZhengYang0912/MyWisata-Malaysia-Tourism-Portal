'use client';

import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Option { value: string; label: string }
interface Props { search: string; onSearchChange: (value: string) => void; placeholder?: string; selects?: Array<{ value: string; placeholder: string; options: Option[]; onChange: (value: string) => void }>; onClear?: () => void; collapsibleOnMobile?: boolean }
interface MobileFilterToggleProps { controlId: string; isOpen: boolean; selectedFilterCount?: number; onToggle: () => void; mobileOnly?: boolean }

export function MobileFilterToggle({ controlId, isOpen, selectedFilterCount = 0, onToggle, mobileOnly = true }: MobileFilterToggleProps) {
  const { t } = useTranslation('vendor');

  return (
    <button
      type="button"
      aria-controls={controlId}
      aria-expanded={isOpen}
      onClick={onToggle}
      className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${isOpen || selectedFilterCount > 0 ? 'border-primary bg-secondary text-primary' : 'border-gray-200 dark:border-border text-gray-700 dark:text-foreground'} ${mobileOnly ? 'lg:hidden' : ''}`}
    >
      <SlidersHorizontal size={16} aria-hidden="true" />
      {t('filters.label')}
      {selectedFilterCount > 0 && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-xs font-bold text-white">
          {selectedFilterCount}
        </span>
      )}
      <ChevronDown size={15} aria-hidden="true" className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      <span className="sr-only">{isOpen ? t('filters.hide') : t('filters.show')}</span>
    </button>
  );
}

export default function CompactFilterBar({ search, onSearchChange, placeholder = 'Search by name…', selects = [], onClear, collapsibleOnMobile = false }: Props) {
  const { t } = useTranslation('vendor');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const hasFilters = Boolean(search) || selects.some((select) => Boolean(select.value));
  const selectedFilterCount = selects.filter((select) => Boolean(select.value)).length;
  if (!collapsibleOnMobile) {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 dark:border-border bg-card p-3 shadow-sm lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1"><Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-muted-foreground" /><input name="search" value={search} onChange={(event) => onSearchChange(event.target.value)} aria-label={t('filters.searchByName')} placeholder={t(placeholder)} className="w-full rounded-xl border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:bg-card dark:focus:bg-card focus:ring-2 focus:ring-primary/10" /></div>
        <div className="flex flex-wrap items-center gap-2"><SlidersHorizontal size={16} aria-hidden="true" className="ml-1 text-gray-400 dark:text-muted-foreground" />{selects.map((select) => <select key={select.placeholder} value={select.value} onChange={(event) => select.onChange(event.target.value)} aria-label={t(select.placeholder)} className="rounded-xl border border-gray-200 dark:border-border bg-card px-3 py-2.5 text-sm text-gray-600 dark:text-muted-foreground outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30"><option value="">{t(select.placeholder)}</option>{select.options.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}</select>)}{hasFilters && onClear ? <button type="button" aria-label={t('filters.clear')} onClick={onClear} className="inline-flex items-center gap-1 rounded-xl px-2.5 py-2 text-xs font-semibold text-gray-500 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"><X size={14} aria-hidden="true" /> {t('filters.clear')}</button> : null}</div>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-gray-100 dark:border-border bg-card p-3 shadow-sm lg:flex-row lg:items-center">
      <div className="flex min-w-0 items-center gap-2 lg:flex-1">
        <div className="relative min-w-0 flex-1"><Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-muted-foreground" /><input name="search" value={search} onChange={(event) => onSearchChange(event.target.value)} aria-label={t('filters.searchByName')} placeholder={t(placeholder)} className="w-full rounded-xl border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:bg-card dark:focus:bg-card focus:ring-2 focus:ring-primary/10" /></div>
        <MobileFilterToggle
          controlId="vendor-mobile-filters"
          isOpen={filtersOpen}
          selectedFilterCount={selectedFilterCount}
          onToggle={() => setFiltersOpen((open) => !open)}
        />
      </div>
      <div id="vendor-mobile-filters" className={`${filtersOpen ? 'flex' : 'hidden'} min-w-0 flex-wrap items-center gap-2 lg:flex`}>
        <SlidersHorizontal size={16} aria-hidden="true" className="ml-1 hidden text-gray-400 dark:text-muted-foreground lg:block" />{selects.map((select) => <select key={select.placeholder} value={select.value} onChange={(event) => select.onChange(event.target.value)} aria-label={t(select.placeholder)} className="min-h-11 w-full min-w-0 rounded-xl border border-gray-200 dark:border-border bg-card px-3 py-2.5 text-sm text-gray-600 dark:text-muted-foreground outline-none focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/30 sm:w-auto"><option value="">{t(select.placeholder)}</option>{select.options.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}</select>)}{hasFilters && onClear ? <button type="button" aria-label={t('filters.clear')} onClick={onClear} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold text-gray-500 dark:text-muted-foreground hover:bg-gray-100 dark:hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"><X size={14} aria-hidden="true" /> {t('filters.clear')}</button> : null}</div>
    </div>
  );
}
