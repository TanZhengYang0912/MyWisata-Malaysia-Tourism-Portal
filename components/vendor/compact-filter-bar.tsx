'use client';

import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { useState, type FocusEventHandler, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { addMalaysiaCalendarDays, getMalaysiaDateInputValue } from '@/lib/datetime/date-input';

interface Option { value: string; label: string }
interface FilterSelect { value: string; placeholder: string; options: Option[]; onChange: (value: string) => void; /** A value that is not an active filter, e.g. the default sort. */ neutralValue?: string }
export interface FilterSegmentOption<T extends string = string> { value: T; label: ReactNode; icon?: ReactNode }
interface FilterTabs<T extends string = string> { options: ReadonlyArray<FilterSegmentOption<T>>; value: T; onChange: (value: T) => void; ariaLabel?: string }
interface Props {
  search: string;
  onSearchChange: (value: string) => void;
  placeholder?: string;
  selects?: FilterSelect[];
  onClear?: () => void;
  collapsibleOnMobile?: boolean;
  /** Quick status/kind tabs shown in the toolbar's first row. */
  tabs?: FilterTabs;
  /** Right side of the tabs row, e.g. a record count or a secondary segmented control. */
  tabsEnd?: ReactNode;
  /** Custom filter controls rendered after `selects`; build them with `getFilterControlClassName`. */
  filters?: ReactNode;
  /** Active count for custom `filters`; added to the count of selected `selects`. */
  filterCount?: number;
  /** Overrides when Clear is shown, for pages whose tabs are part of the clearable state. */
  hasActiveFilters?: boolean;
  /** `inline`: filters sit beside search on desktop and collapse below `lg`. `panel`: filters open below on demand at every width. */
  filterMode?: 'inline' | 'panel';
  filtersOpen?: boolean;
  onFiltersOpenChange?: (open: boolean) => void;
  filtersId?: string;
  /** Content below the controls, e.g. removable active-filter chips. */
  footer?: ReactNode;
}
interface MobileFilterToggleProps { controlId: string; isOpen: boolean; selectedFilterCount?: number; onToggle: () => void; mobileOnly?: boolean }

const filterControlBaseClassName = 'h-11 min-w-0 rounded-xl border bg-white dark:bg-card px-3 text-sm outline-none transition-colors focus:border-primary focus-visible:ring-2 focus-visible:ring-primary/20';
const filterControlIdleClassName = 'border-gray-200 dark:border-border text-gray-600 dark:text-muted-foreground hover:border-gray-300 dark:hover:border-muted-foreground/40';
const filterControlActiveClassName = 'border-primary/50 dark:border-primary/60 font-medium text-gray-900 dark:text-foreground';

/** Shared 44px field chrome for vendor toolbar controls; `isActive` marks a control that currently narrows the list. */
export function getFilterControlClassName(isActive = false) {
  return `${filterControlBaseClassName} ${isActive ? filterControlActiveClassName : filterControlIdleClassName}`;
}
/** Full width in the mobile panel, content width inline on desktop. */
export const filterInlineControlClassName = 'w-full lg:w-auto lg:min-w-40 lg:max-w-60';

export function MobileFilterToggle({ controlId, isOpen, selectedFilterCount = 0, onToggle, mobileOnly = true }: MobileFilterToggleProps) {
  const { t } = useTranslation('vendor');

  return (
    <button
      type="button"
      aria-controls={controlId}
      aria-expanded={isOpen}
      onClick={onToggle}
      className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${isOpen || selectedFilterCount > 0 ? 'border-primary bg-secondary text-primary' : 'border-gray-200 dark:border-border bg-white dark:bg-card text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-muted/50'} ${mobileOnly ? 'lg:hidden' : ''}`}
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

/** Segmented quick filter shared by vendor list toolbars; scrolls horizontally instead of wrapping. */
export function FilterSegmented<T extends string>({ options, value, onChange, ariaLabel, layout = 'inline' }: FilterTabs<T> & { layout?: 'inline' | 'grid' }) {
  const { t } = useTranslation('vendor');

  return (
    // `grid` is for narrow filter panels: options wrap into two columns instead of scrolling out of view.
    <div role="group" aria-label={ariaLabel ?? t('filters.label')} className={layout === 'grid' ? 'grid w-full grid-cols-2 gap-1 rounded-xl bg-gray-100 dark:bg-muted p-1' : 'inline-flex max-w-full shrink-0 flex-nowrap gap-1 overflow-x-auto rounded-xl bg-gray-100 dark:bg-muted p-1 [scrollbar-width:none]'}>
      {options.map((option) => {
        const isActive = option.value === value;
        return (
          <button
            key={option.value || 'all'}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(option.value)}
            className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${isActive ? 'bg-white dark:bg-card text-gray-900 dark:text-foreground shadow-sm' : 'text-gray-500 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-foreground'}`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

interface FilterDateFieldProps { label: string; value: string; onChange: (value: string) => void; onFocus?: FocusEventHandler<HTMLInputElement>; min?: string; className?: string }

/** Date input with its label inside the field, so a range reads "From ▢ To ▢" at toolbar height. */
export function FilterDateField({ label, value, onChange, onFocus, min, className = '' }: FilterDateFieldProps) {
  return (
    <label className={`${getFilterControlClassName(Boolean(value))} flex items-center gap-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 ${className}`}>
      <span className="shrink-0 text-xs font-medium text-gray-500 dark:text-muted-foreground">{label}</span>
      <input type="date" value={value} min={min} onFocus={onFocus} onChange={(event) => onChange(event.target.value)} aria-label={label} className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none" />
    </label>
  );
}

export type DateRangeValue = { from: string; to: string };
type DateRangePreset = 'today' | 'last7Days' | 'last30Days' | 'thisMonth';
const DATE_RANGE_PRESETS: DateRangePreset[] = ['today', 'last7Days', 'last30Days', 'thisMonth'];

/** Inclusive Malaysia calendar ranges ending today; record filters look back, not forward. */
export function getDateRangePreset(preset: DateRangePreset, now = new Date()): DateRangeValue {
  const today = getMalaysiaDateInputValue(now);
  if (preset === 'today') return { from: today, to: today };
  if (preset === 'last7Days') return { from: addMalaysiaCalendarDays(today, -6), to: today };
  if (preset === 'last30Days') return { from: addMalaysiaCalendarDays(today, -29), to: today };
  return { from: `${today.slice(0, 8)}01`, to: today };
}

export function isInvalidDateRange(range: DateRangeValue) {
  return Boolean(range.from && range.to && range.to < range.from);
}

/**
 * Quick presets plus a custom From/To pair for record lists (Orders today).
 * Values stay Malaysia calendar dates; the API turns them into whole-day bounds.
 */
export function FilterDateRange({ value, onChange, legend }: { value: DateRangeValue; onChange: (value: DateRangeValue) => void; legend: string }) {
  const { t } = useTranslation('vendor');
  const activePreset = DATE_RANGE_PRESETS.find((preset) => {
    const range = getDateRangePreset(preset);
    return range.from === value.from && range.to === value.to;
  });
  const isInvalid = isInvalidDateRange(value);
  const errorId = 'filter-date-range-error';

  return (
    <fieldset className="space-y-2.5">
      <legend className="text-sm font-semibold text-foreground">{legend}</legend>
      <div role="group" aria-label={t('ui.listFilters.datePresets')} className="flex flex-wrap gap-1.5">
        {DATE_RANGE_PRESETS.map((preset) => {
          const isActive = preset === activePreset;
          return (
            <button
              key={preset}
              type="button"
              aria-pressed={isActive}
              onClick={() => onChange(getDateRangePreset(preset))}
              className={`inline-flex h-8 items-center rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${isActive ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-secondary'}`}
            >
              {t(`ui.listFilters.presets.${preset}`)}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">{t('ui.listFilters.fromDate')}</span>
          <input
            type="date"
            value={value.from}
            max={value.to || undefined}
            onChange={(event) => onChange({ ...value, from: event.target.value })}
            aria-invalid={isInvalid}
            aria-describedby={isInvalid ? errorId : undefined}
            className="h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-sm tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 aria-[invalid=true]:border-destructive"
          />
        </label>
        <label className="space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">{t('ui.listFilters.toDate')}</span>
          <input
            type="date"
            value={value.to}
            min={value.from || undefined}
            onChange={(event) => onChange({ ...value, to: event.target.value })}
            aria-invalid={isInvalid}
            aria-describedby={isInvalid ? errorId : undefined}
            className="h-11 w-full min-w-0 rounded-xl border border-border bg-background px-3 text-sm tabular-nums outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 aria-[invalid=true]:border-destructive"
          />
        </label>
      </div>
      <div className="flex min-h-5 items-center justify-between gap-3">
        {isInvalid
          ? <p id={errorId} role="alert" className="text-xs font-medium text-destructive">{t('ui.listFilters.invalidRange')}</p>
          : <span />}
        {(value.from || value.to) && (
          <button type="button" onClick={() => onChange({ from: '', to: '' })} className="text-xs font-semibold text-primary underline underline-offset-4 hover:text-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
            {t('ui.listFilters.clearDates')}
          </button>
        )}
      </div>
    </fieldset>
  );
}

export default function CompactFilterBar({
  search,
  onSearchChange,
  placeholder = 'Search by name…',
  selects = [],
  onClear,
  collapsibleOnMobile = false,
  tabs,
  tabsEnd,
  filters,
  filterCount = 0,
  hasActiveFilters,
  filterMode = 'inline',
  filtersOpen: controlledOpen,
  onFiltersOpenChange,
  filtersId = 'vendor-mobile-filters',
  footer,
}: Props) {
  const { t } = useTranslation('vendor');
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const filtersOpen = controlledOpen ?? uncontrolledOpen;
  const setFiltersOpen = (open: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(open);
    onFiltersOpenChange?.(open);
  };
  const isSelectActive = (select: FilterSelect) => Boolean(select.value) && select.value !== select.neutralValue;
  const selectedFilterCount = selects.filter(isSelectActive).length + filterCount;
  const hasFilters = hasActiveFilters ?? (Boolean(search) || selectedFilterCount > 0);
  const hasFilterControls = selects.length > 0 || Boolean(filters);
  const isPanel = filterMode === 'panel';
  const showToggle = hasFilterControls && (isPanel || collapsibleOnMobile);
  const searchLabel = t(placeholder);

  const clearButton = hasFilters && onClear ? (
    <button type="button" aria-label={t('filters.clear')} onClick={onClear} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-1 self-start rounded-xl px-3 text-sm font-semibold text-gray-500 dark:text-muted-foreground transition-colors hover:bg-gray-100 dark:hover:bg-muted hover:text-gray-900 dark:hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 lg:self-auto"><X size={14} aria-hidden="true" /> {t('filters.clear')}</button>
  ) : null;

  const selectControls = selects.map((select) => (
    <select key={select.placeholder} value={select.value} onChange={(event) => select.onChange(event.target.value)} aria-label={t(select.placeholder)} className={`${getFilterControlClassName(isSelectActive(select))} ${filterInlineControlClassName}`}>
      <option value="">{t(select.placeholder)}</option>
      {select.options.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
    </select>
  ));

  // Collapsed state must not carry `sm:grid`, or tablets would show the hidden filters.
  const inlineFiltersLayout = !collapsibleOnMobile || filtersOpen
    ? 'flex flex-col sm:grid sm:grid-cols-2 lg:flex lg:flex-row lg:flex-wrap lg:items-center'
    : 'hidden lg:flex lg:flex-row lg:flex-wrap lg:items-center';

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-2xl border border-gray-100 dark:border-border bg-white dark:bg-card p-3 shadow-sm">
      {(tabs || tabsEnd) && (
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          {tabs ? <FilterSegmented {...tabs} /> : <span />}
          {tabsEnd && <div className="flex min-w-0 items-center gap-3 sm:justify-end">{tabsEnd}</div>}
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center">
        <div className="flex min-w-0 items-center gap-2 lg:min-w-72 lg:flex-1">
          <label className="relative min-w-0 flex-1">
            <Search size={16} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-muted-foreground" />
            <input type="search" enterKeyHint="search" name="search" value={search} onChange={(event) => onSearchChange(event.target.value)} aria-label={searchLabel} placeholder={searchLabel} className="h-11 w-full rounded-xl border border-gray-200 dark:border-border bg-gray-50 dark:bg-muted/50 pl-9 pr-3 text-sm text-gray-900 dark:text-foreground outline-none transition-colors placeholder:text-gray-400 dark:placeholder:text-muted-foreground hover:border-gray-300 dark:hover:border-muted-foreground/40 focus:border-primary focus:bg-white dark:focus:bg-card focus-visible:ring-2 focus-visible:ring-primary/20" />
          </label>
          {showToggle && (
            <MobileFilterToggle
              controlId={filtersId}
              isOpen={filtersOpen}
              selectedFilterCount={selectedFilterCount}
              mobileOnly={!isPanel}
              onToggle={() => setFiltersOpen(!filtersOpen)}
            />
          )}
          {isPanel && clearButton}
        </div>
        {!isPanel && (hasFilterControls || clearButton) && (
          <div id={filtersId} className={`${inlineFiltersLayout} min-w-0 gap-2`}>
            {selectControls}
            {filters}
            {clearButton}
          </div>
        )}
      </div>

      {isPanel && filtersOpen && (
        <div id={filtersId} className="rounded-xl border border-gray-100 dark:border-border bg-gray-50/70 dark:bg-muted/40 p-4">
          {selectControls.length > 0 && <div className="mb-3 grid gap-2 sm:grid-cols-2">{selectControls}</div>}
          {filters}
        </div>
      )}

      {footer}
    </div>
  );
}
