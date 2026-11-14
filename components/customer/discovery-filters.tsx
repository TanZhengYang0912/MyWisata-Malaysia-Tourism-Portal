"use client";

import { ArrowUpDown, ChevronDown, Clock3, Search as SearchIcon, SlidersHorizontal } from "lucide-react";
import { useState, type ComponentProps, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CATEGORIES, STATES_MY } from "@/backend/domains/catalogue";
import { CategoryIcon } from "@/components/customer/category-icon";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogTrigger } from "@/components/ui/dialog";
import { CATEGORY_DETAILS } from "@/lib/customer/category-details";
import { PRICE_MAX, type DiscoveryQuery } from "@/lib/customer/discovery-query";

const OPENING_TIME_SEGMENTS = [
  { key: "morning", from: "08:00", to: "11:00" },
  { key: "midday", from: "11:00", to: "14:00" },
  { key: "afternoon", from: "14:00", to: "17:00" },
  { key: "evening", from: "17:00", to: "20:00" },
  { key: "night", from: "20:00", to: "23:00" },
] as const;

const NO_TRANSLATION_NAMESPACES: string[] = [];

interface DiscoverySearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  autoFocus?: boolean;
}

export function DiscoverySearchField({ value, onChange, placeholder, ariaLabel, autoFocus }: DiscoverySearchFieldProps) {
  const { t } = useTranslation(ariaLabel !== undefined && placeholder !== undefined ? NO_TRANSLATION_NAMESPACES : "customer");
  const searchLabel = ariaLabel ?? t("ui.discovery.searchLabel");
  return (
    <label data-active={value.trim() ? "true" : undefined} className="flex min-h-12 min-w-0 flex-1 items-center gap-2.5 border-b-2 border-primary/15 px-1 transition-colors hover:border-primary/40 focus-within:border-primary data-[active=true]:border-primary">
      <SearchIcon size={18} className="shrink-0 text-primary" aria-hidden="true" />
      <span className="sr-only">{searchLabel}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoFocus={autoFocus}
        placeholder={placeholder ?? t("ui.discovery.searchPlaceholder")}
        aria-label={searchLabel}
        className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}

const editorialLine = (active: boolean) => (active ? "border-primary" : "border-primary/15 hover:border-primary/40");

/** Editorial Filters trigger beside DiscoverySearchField. Count = applied filters. */
function DiscoveryFilterButton({ count = 0, active = count > 0, label, className = "", ...props }: ComponentProps<"button"> & { count?: number; active?: boolean; label?: string }) {
  const { t } = useTranslation(label !== undefined ? NO_TRANSLATION_NAMESPACES : "customer");
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex min-h-12 items-center gap-2.5 border-b-2 px-1 text-[15px] font-bold text-primary transition-colors focus-visible:border-primary focus-visible:outline-none ${editorialLine(active)} ${className}`}
    >
      <SlidersHorizontal size={18} aria-hidden="true" />
      {label ?? t("ui.explore.filters")}
      {count > 0 && (
        <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border-[1.5px] border-primary/30 px-1.5 text-xs font-extrabold text-primary">
          {count}
        </span>
      )}
    </button>
  );
}

/** Editorial sort select beside DiscoverySearchField; the line turns solid when the value is not the default. */
function DiscoverySortSelect<T extends string>({
  value,
  defaultValue,
  options,
  onChange,
  label,
  className = "",
  ...props
}: Omit<ComponentProps<"label">, "onChange"> & { value: T; defaultValue: T; options: { value: T; label: string }[]; onChange: (value: T) => void; label?: string }) {
  const { t } = useTranslation(label !== undefined ? NO_TRANSLATION_NAMESPACES : "customer");
  return (
    <label {...props} className={`relative inline-flex min-h-12 min-w-0 flex-1 items-center gap-2.5 border-b-2 px-1 text-primary transition-colors focus-within:border-primary sm:w-[220px] sm:flex-none ${editorialLine(value !== defaultValue)} ${className}`}>
      <ArrowUpDown size={18} aria-hidden="true" className="shrink-0" />
      <select
        aria-label={label ?? t("ui.explore.sortBy")}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent pr-6 text-[15px] font-bold text-primary outline-none"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-1" />
    </label>
  );
}

/**
 * The discovery toolbar (Explore, Vendors): search, Filters and Sort in one editorial row. A UI shell only —
 * the page passes its own sort options and owns the filter drawer; render it inside that drawer's <Dialog>.
 */
export function DiscoveryToolbar<T extends string>({
  query, onQueryChange, placeholder, searchLabel, filterCount = 0, filtersActive, sort, defaultSort, sortOptions, onSortChange, labels, trailing, testIds = {}, className = "",
}: {
  query: string;
  onQueryChange: (query: string) => void;
  /** Defaults to the shared "Type any keyword…" hint. */
  placeholder?: string;
  searchLabel?: string;
  filterCount?: number;
  filtersActive?: boolean;
  sort?: T;
  defaultSort?: T;
  sortOptions?: { value: T; label: string }[];
  onSortChange?: (sort: T) => void;
  labels?: { filters?: string; sortBy?: string };
  trailing?: ReactNode;
  testIds?: { bar?: string; filters?: string; sort?: string };
  className?: string;
}) {
  const layout = trailing ? "md:flex-row md:items-end md:gap-8" : "sm:flex-row sm:items-end sm:gap-8";
  const controlsLayout = trailing
    ? "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-end gap-x-5 md:flex md:shrink-0 md:gap-8"
    : `flex shrink-0 items-end gap-5 sm:gap-8${sortOptions?.length ? "" : " sm:ml-auto"}`;

  return (
    <div data-testid={testIds.bar} className={`flex flex-col gap-1 ${layout} ${className}`}>
      {searchLabel === undefined
        ? <DiscoverySearchField value={query} onChange={onQueryChange} placeholder={placeholder} />
        : <DiscoverySearchField value={query} onChange={onQueryChange} placeholder={placeholder} ariaLabel={searchLabel} />}
      <div className={controlsLayout}>
        <DialogTrigger asChild>
          <DiscoveryFilterButton data-testid={testIds.filters} count={filterCount} active={filtersActive ?? filterCount > 0} label={labels?.filters} />
        </DialogTrigger>
        {sortOptions && sortOptions.length > 0 && sort !== undefined && defaultSort !== undefined && onSortChange && (
          <DiscoverySortSelect data-testid={testIds.sort} value={sort} defaultValue={defaultSort} options={sortOptions} onChange={onSortChange} label={labels?.sortBy} />
        )}
        {trailing && <div className="col-span-full">{trailing}</div>}
      </div>
    </div>
  );
}

interface DiscoveryCategoryFilterProps {
  category: string | null;
  hasActiveFilters: boolean;
  onCategoryChange: (category: string | null) => void;
  onClear: () => void;
  excludedCategories?: string[];
  variant?: "cards" | "compact" | "sidebar";
  showClear?: boolean;
  headingKey?: string;
  includeAll?: boolean;
}

export function DiscoveryCategoryFilter({
  category,
  hasActiveFilters,
  onCategoryChange,
  onClear,
  excludedCategories = [],
  variant = "cards",
  showClear = true,
  headingKey = "ui.explore.filterByCategory",
  includeAll = false,
}: DiscoveryCategoryFilterProps) {
  const { t } = useTranslation("customer");
  const compact = variant === "compact";
  const sidebar = variant === "sidebar";
  const excludedCategorySet = new Set(excludedCategories);
  const categoryOptions = (includeAll
    ? [{ id: "all", labelKey: "ui.map.allCategories" }, ...CATEGORIES]
    : CATEGORIES).filter((option) => option.id === "all" || !excludedCategorySet.has(option.id));
  return (
    <section aria-labelledby="discovery-category-filter-heading">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 id="discovery-category-filter-heading" className={`font-bold text-foreground ${compact ? "text-xs uppercase tracking-wider text-muted-foreground" : sidebar ? "text-sm" : "text-lg"}`}>{t(headingKey)}</h2>
        {showClear && hasActiveFilters && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {t("ui.actions.clearFilters")}
          </button>
        )}
      </div>
      <div className={compact ? "flex gap-2 overflow-x-auto pb-1 lg:flex-wrap" : sidebar ? "flex flex-col gap-1" : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"}>
        {/* CATEGORIES.map */}
        {categoryOptions.map((categoryOption) => {
          const selected = categoryOption.id === "all" ? category === null : category === categoryOption.id;
          return (
             <button
               key={categoryOption.id}
               type="button"
               onClick={() => onCategoryChange(selected ? null : categoryOption.id === "all" ? null : categoryOption.id)}
               aria-label={t(categoryOption.labelKey ?? "ui.map.allCategories")}
               aria-pressed={selected}
               className={compact
                ? `inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 ${selected ? "border-primary bg-primary text-white shadow-xs" : "border-border bg-background text-muted-foreground hover:bg-muted/40"}`
                : sidebar
                ? `inline-flex min-h-10 w-full items-center justify-start gap-2.5 rounded-xl border px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 ${selected ? "border-primary/20 bg-secondary text-primary" : "border-transparent text-muted-foreground hover:bg-muted/50"}`
                : `flex min-h-20 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 p-3 text-center transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 ${selected ? "border-primary bg-primary text-white shadow-sm" : "border-transparent bg-card text-foreground shadow-sm"}`}
            >
              <span className={`flex shrink-0 items-center justify-center ${compact ? "h-5 w-5 rounded-full" : sidebar ? "h-7 w-7 rounded-lg" : "h-11 w-11 rounded-2xl"} ${selected && !sidebar ? "bg-white/20 dark:bg-card/20 text-white" : "bg-secondary text-primary"}`}>
                <CategoryIcon category={categoryOption.id} size={compact ? 14 : sidebar ? 16 : 22} strokeWidth={compact ? 2 : 1.8} />
              </span>
              <span className={compact ? "whitespace-nowrap" : sidebar ? "flex-1 text-left" : `text-[10px] font-bold leading-tight ${selected ? "text-white" : "text-foreground"}`}>
                {t(categoryOption.labelKey ?? "ui.map.allCategories")}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

type DiscoveryAdvancedFiltersProps = {
  value: Pick<DiscoveryQuery, "state" | "categories" | "types" | "priceMax" | "operatingDays" | "hoursMode" | "timeAt" | "timeFrom" | "timeTo" | "overnight" | "openNow" | "freeOnly" | "bookableOnly" | "hiddenGemOnly" | "familyFriendlyOnly" | "coupleFriendlyOnly">;
  onChange: (patch: Partial<DiscoveryQuery>) => void;
  showTypeFilters?: boolean;
  showTagPreferenceFilters?: boolean;
};

export function DiscoveryAdvancedFilters({ value, onChange, showTypeFilters = true, showTagPreferenceFilters = true }: DiscoveryAdvancedFiltersProps) {
  const { t } = useTranslation("customer");
  const hasCustomTimeRange = Boolean(value.timeFrom || value.timeTo) && !OPENING_TIME_SEGMENTS.some((segment) => value.timeFrom === segment.from && value.timeTo === segment.to);
  const [customTimeOpen, setCustomTimeOpen] = useState(hasCustomTimeRange);
  const customTimeSelected = customTimeOpen || hasCustomTimeRange;
  const [priceInput, setPriceInput] = useState(() => ({
    source: value.priceMax,
    draft: value.priceMax === null ? "" : String(value.priceMax),
  }));
  const isInvalidPrice = (draft: string) => {
    if (!draft.trim()) return false;
    const price = Number(draft);
    return !Number.isFinite(price) || price < 0 || price > PRICE_MAX;
  };
  if (priceInput.source !== value.priceMax && !isInvalidPrice(priceInput.draft)) {
    setPriceInput({ source: value.priceMax, draft: value.priceMax === null ? "" : String(value.priceMax) });
  }
  const priceDraft = priceInput.draft;
  const hasPriceDraft = priceDraft.trim() !== "";
  const priceInvalid = hasPriceDraft && isInvalidPrice(priceDraft);

  const weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  const dayGroups: Array<{ key: string; label: string; days: DiscoveryQuery["operatingDays"] }> = [
    { key: "any", label: t("ui.discovery.anyDay"), days: [] },
    { key: "weekdays", label: t("ui.discovery.weekdays"), days: ["mon", "tue", "wed", "thu", "fri"] },
    { key: "weekend", label: t("ui.discovery.weekend"), days: ["sat", "sun"] },
  ];
  const toggleDay = (day: (typeof weekdays)[number]) => onChange({ operatingDays: value.operatingDays.includes(day) ? value.operatingDays.filter((selected) => selected !== day) : [...value.operatingDays, day] });
  const setDayGroup = (days: DiscoveryQuery["operatingDays"]) => onChange({ operatingDays: days });
  const setPrice = (draft: string) => {
    setPriceInput({ source: value.priceMax, draft });
    if (!draft.trim()) {
      onChange({ priceMax: null });
      return;
    }
    const price = Number(draft);
    if (Number.isFinite(price) && price >= 0 && price <= PRICE_MAX) onChange({ priceMax: price });
    else if (value.priceMax !== null) onChange({ priceMax: null });
  };
  const toggleType = (category: string, type: string, allTypes: string[]) => {
    const token = `${category}:${type}`;
    const currentTypes = value.types.filter((item) => item.startsWith(`${category}:`));
    const allTypesSelected = value.categories.includes(category) && currentTypes.length === 0;
    const types = allTypesSelected
      ? [...value.types, ...allTypes.filter((item) => item !== type).map((item) => `${category}:${item}`)]
      : value.types.includes(token) ? value.types.filter((item) => item !== token) : [...value.types, token];
    const categoryTypes = types.filter((item) => item.startsWith(`${category}:`));
    onChange({
      categories: categoryTypes.length === 0 ? value.categories.filter((item) => item !== category) : value.categories.includes(category) ? value.categories : [...value.categories, category],
      types: categoryTypes.length === allTypes.length ? types.filter((item) => !item.startsWith(`${category}:`)) : types,
    });
  };
  const toggleBoolean = (key: "freeOnly" | "bookableOnly" | "hiddenGemOnly" | "familyFriendlyOnly" | "coupleFriendlyOnly") => onChange({ [key]: !value[key] });
  type PreferenceFilterKey = "freeOnly" | "bookableOnly" | "hiddenGemOnly" | "familyFriendlyOnly" | "coupleFriendlyOnly";
  const allPreferenceFilters = [
    { key: "freeOnly", label: "ui.discovery.freeOnly" },
    { key: "bookableOnly", label: "ui.discovery.bookableOnly" },
    { key: "hiddenGemOnly", label: "ui.discovery.hiddenGemOnly" },
    { key: "familyFriendlyOnly", label: "ui.discovery.familyFriendlyOnly" },
    { key: "coupleFriendlyOnly", label: "ui.discovery.coupleFriendlyOnly" },
  ] satisfies Array<{ key: PreferenceFilterKey; label: string }>;
  const preferenceFilters = allPreferenceFilters.filter(({ key }) => showTagPreferenceFilters || key === "freeOnly" || key === "bookableOnly");

  return (
    <section aria-label={t("ui.discovery.advancedFilters")} className="space-y-3 rounded-2xl border border-border/70 bg-background/40 p-3 sm:p-4">
      <details open className="group rounded-xl border border-primary/20 bg-primary/[0.025] p-3 sm:p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden">
          {t("ui.discovery.openingHours")}
          <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-primary transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs font-bold text-muted-foreground">{t("ui.discovery.operatingDays")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {dayGroups.map(({ key, label, days }) => {
                const selected = value.operatingDays.length === 0 ? key === "any" : JSON.stringify(value.operatingDays) === JSON.stringify(days);
                return <button key={key} type="button" aria-pressed={selected} onClick={() => setDayGroup(days)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${selected ? "border-primary bg-primary text-white" : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"}`}>{label}</button>;
              })}
              {weekdays.map((day) => <button key={day} type="button" aria-label={t(`ui.labels.days.${day}`)} aria-pressed={value.operatingDays.includes(day)} onClick={() => toggleDay(day)} className={`rounded-full border px-2.5 py-1.5 text-xs font-semibold ${value.operatingDays.includes(day) ? "border-primary bg-primary text-white" : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"}`}>{t(`ui.labels.days.${day}`)}</button>)}
            </div>
          </div>
          <div className="border-t border-border/70 pt-4">
            <p className="text-xs font-bold text-muted-foreground">{t("ui.discovery.hoursMode")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["any", "during"] as const).map((mode) => <button key={mode} type="button" aria-pressed={value.hoursMode === mode} onClick={() => {
                if (mode === "any") {
                  setCustomTimeOpen(false);
                  onChange({ hoursMode: mode, timeAt: null, timeFrom: null, timeTo: null, overnight: false });
                } else {
                  onChange({ hoursMode: mode, timeAt: null });
                }
              }} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${value.hoursMode === mode ? "border-primary bg-primary text-white" : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"}`}>{t(`ui.discovery.${mode === "any" ? "anyTime" : "openDuring"}`)}</button>)}
            </div>
            {value.hoursMode === "during" && <div className="mt-3 space-y-2.5">
              <p className="text-xs font-semibold text-muted-foreground">{t("ui.discovery.chooseTimePeriod")}</p>
              <div role="group" aria-label={t("ui.discovery.chooseTimePeriod")} className="flex flex-wrap items-center gap-2">
                {OPENING_TIME_SEGMENTS.map((segment) => {
                  const selected = !customTimeSelected && value.timeFrom === segment.from && value.timeTo === segment.to;
                  return <button key={segment.key} type="button" aria-pressed={selected} onClick={() => {
                    setCustomTimeOpen(false);
                    onChange({ hoursMode: "during", timeAt: null, timeFrom: segment.from, timeTo: segment.to, overnight: false });
                  }} className={`rounded-full border px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 ${selected ? "border-primary bg-primary text-white" : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"}`}>{t(`ui.discovery.timeSegments.${segment.key}`)}</button>;
                })}
                <button type="button" aria-pressed={customTimeSelected} onClick={() => {
                  const opening = !customTimeOpen;
                  setCustomTimeOpen(opening);
                  if (opening) onChange({ hoursMode: "during", timeAt: null, overnight: false });
                }} className={`ml-auto rounded-full border px-3 py-2 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 ${customTimeSelected ? "border-primary bg-primary text-white" : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"}`}>{t("ui.discovery.customTime")}</button>
              </div>
              {customTimeOpen && <div className="grid gap-3 sm:ml-auto sm:max-w-2xl sm:grid-cols-2">
                <label className="text-xs font-semibold text-muted-foreground"><span>{t("ui.discovery.timeFrom")}</span><input type="time" aria-label={t("ui.discovery.timeFrom")} value={value.timeFrom ?? ""} onChange={(event) => {
                  const timeFrom = event.target.value || null;
                  const timeTo = timeFrom && value.timeTo && value.timeTo <= timeFrom ? null : value.timeTo;
                  onChange({ timeFrom, timeTo, overnight: false });
                }} className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-foreground" /></label>
                <label className="text-xs font-semibold text-muted-foreground"><span>{t("ui.discovery.timeTo")}</span><input type="time" aria-label={t("ui.discovery.timeTo")} value={value.timeTo ?? ""} min={value.timeFrom ?? undefined} onChange={(event) => {
                  const timeTo = event.target.value || null;
                  onChange({ timeTo: timeTo && value.timeFrom && timeTo <= value.timeFrom ? null : timeTo, overnight: false });
                }} className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-foreground" /></label>
              </div>}
              <p className="text-xs text-muted-foreground">{t("ui.discovery.timeRangeHelp")}</p>
            </div>}
          </div>
        </div>
      </details>

      <details className="group rounded-xl border border-border/70 bg-card p-3 sm:p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden">
          {t("ui.discovery.locationAndPrice")}
          <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold text-foreground">
            <span>{t("ui.discovery.state")}</span>
            <select aria-label={t("ui.discovery.state")} value={value.state ?? ""} onChange={(event) => onChange({ state: event.target.value || null })} className="mt-2 min-h-10 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal">
              <option value="">{t("ui.map.allStatesTerritories")}</option>
              {STATES_MY.filter((state) => state !== "All Malaysia").map((state) => <option key={state} value={state}>{state}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold text-foreground">
            <span>{t("ui.discovery.maximumPrice")}</span>
            <input
              aria-label={t("ui.discovery.maximumPrice")}
              aria-invalid={priceInvalid}
              aria-describedby={priceInvalid ? "discovery-maximum-price-error" : undefined}
              type="number"
              min="0"
              max={PRICE_MAX}
              step="0.01"
              value={priceDraft}
              onChange={(event) => setPrice(event.target.value)}
              className={`mt-2 min-h-10 w-full rounded-xl border bg-background px-3 py-2 text-sm font-normal ${priceInvalid ? "border-destructive focus-visible:outline-destructive" : "border-border"}`}
            />
            {priceInvalid && <span id="discovery-maximum-price-error" role="alert" className="mt-1.5 block text-xs font-normal text-destructive">{t("ui.discovery.priceInvalid")}</span>}
          </label>
        </div>
      </details>

      {showTypeFilters && <details className="group rounded-xl border border-border/70 bg-card p-3 sm:p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden">
          {t("ui.discovery.experienceTypes")}
          <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-4 space-y-3">
          {Object.entries(CATEGORY_DETAILS).map(([category, detail]) => (
            <div key={category}>
              <p className="text-xs font-bold text-muted-foreground">{t(`categories.${category}`)}</p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {detail.types.map((type) => {
                  const token = `${category}:${type.slug}`;
                  const selected = value.types.includes(token) || (value.categories.includes(category) && !value.types.some((item) => item.startsWith(`${category}:`)));
                  return <button key={token} type="button" aria-label={t(`ui.map.types.${type.slug}`)} aria-pressed={selected} onClick={() => toggleType(category, type.slug, detail.types.map((option) => option.slug))} className={`rounded-full border px-2.5 py-1.5 text-xs ${selected ? "border-primary bg-primary text-white" : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"}`}>{t(`ui.map.types.${type.slug}`)}</button>;
                })}
              </div>
            </div>
          ))}
        </div>
      </details>}

      <details className="group rounded-xl border border-border/70 bg-card p-3 sm:p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden">
          {t("ui.discovery.preferences")}
          <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-4 flex flex-wrap gap-2">
          {preferenceFilters.map(({ key, label }) => <button key={key} type="button" aria-label={t(label)} aria-pressed={value[key]} onClick={() => toggleBoolean(key)} className={`rounded-full border px-3 py-2 text-xs font-bold ${value[key] ? "border-primary bg-primary text-white" : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"}`}>{t(label)}</button>)}
        </div>
      </details>
    </section>
  );
}

export function CustomerDiscoveryFilterPanel({
  layout = "panel",
  mode = "default",
  value,
  hasActiveFilters,
  onChange,
  onClear,
  placeholder,
  category,
  onCategoryChange,
  categoryVariant = "compact",
  includeAllCategories = true,
  filterButtonAlignment = "start",
  excludedCategories = [],
  showTypeFilters = true,
  showTagPreferenceFilters = true,
  showSearchField = true,
}: {
  layout?: "panel" | "sidebar";
  mode?: "default" | "experiences";
  value: DiscoveryQuery;
  hasActiveFilters: boolean;
  onChange: (patch: Partial<DiscoveryQuery>) => void;
  onClear: () => void;
  placeholder?: string;
  category: string | null;
  onCategoryChange: (category: string | null) => void;
  categoryVariant?: "cards" | "compact" | "sidebar";
  includeAllCategories?: boolean;
  filterButtonAlignment?: "start" | "end";
  excludedCategories?: string[];
  showTypeFilters?: boolean;
  showTagPreferenceFilters?: boolean;
  showSearchField?: boolean;
}) {
  const { t } = useTranslation("customer");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedExperienceCategories, setExpandedExperienceCategories] = useState<Set<string>>(() => new Set());
  const [experienceBadgesExpanded, setExperienceBadgesExpanded] = useState(false);
  const toggleExperienceCategory = (category: string) => {
    setExpandedExperienceCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };
  const toggleExperienceCategorySelection = (category: string, checked: boolean) => {
    onChange({
      categories: checked ? [...value.categories, category] : value.categories.filter((item) => item !== category),
      types: checked ? value.types : value.types.filter((item) => !item.startsWith(`${category}:`)),
    });
  };
  const toggleExperienceType = (category: string, type: string, checked: boolean) => {
    const token = `${category}:${type}`;
    onChange({
      categories: value.categories.includes(category) ? value.categories : [...value.categories, category],
      types: checked ? [...value.types, token] : value.types.filter((item) => item !== token),
    });
  };
  const openNowFilter = (
    <button
      type="button"
      aria-label={t("ui.labels.openNow")}
      aria-pressed={value.openNow}
      onClick={() => onChange({ openNow: !value.openNow })}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 ${value.openNow ? "border-primary bg-primary text-white" : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"}`}
    >
      <Clock3 size={14} aria-hidden="true" />
      {t("ui.labels.openNow")}
    </button>
  );
  const experienceFacetFilters = (
    <section aria-label={t("ui.discovery.advancedFilters")} className="space-y-4">
      <div className="space-y-3">
        <label className="block text-sm font-semibold text-foreground">
          <span>{t("ui.discovery.state")}</span>
          <select aria-label={t("ui.discovery.state")} value={value.state ?? ""} onChange={(event) => onChange({ state: event.target.value || null })} className="mt-2 min-h-10 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal">
            <option value="">{t("ui.map.allStatesTerritories")}</option>
            {STATES_MY.filter((state) => state !== "All Malaysia").map((state) => <option key={state} value={state}>{state}</option>)}
          </select>
        </label>
        <div role="separator" aria-orientation="horizontal" className="h-px bg-border" />
        {openNowFilter}
        <div role="separator" aria-orientation="horizontal" className="h-px bg-border" />
      </div>

      <fieldset className="space-y-1">
        <legend className="sr-only">{t("ui.search.category")}</legend>
        {Object.entries(CATEGORY_DETAILS).map(([category, detail]) => {
          const categoryLabel = t(`categories.${category}`);
          const expanded = expandedExperienceCategories.has(category);
          const categoryId = `experience-category-${category}`;
          return (
            <div key={category} className="border-b border-border/70 py-2 last:border-b-0">
              <div className="flex min-h-10 items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <Checkbox
                    id={categoryId}
                    aria-label={categoryLabel}
                    checked={value.categories.includes(category)}
                    onCheckedChange={(checked) => toggleExperienceCategorySelection(category, checked === true)}
                  />
                  <label htmlFor={categoryId} className="cursor-pointer text-sm font-semibold text-foreground">
                    {categoryLabel}
                  </label>
                </div>
                <button
                  type="button"
                  data-testid={`experience-type-toggle-${category}`}
                  aria-label={`${t("ui.discovery.types")}: ${categoryLabel}`}
                  aria-expanded={expanded}
                  aria-controls={`experience-types-${category}`}
                  onClick={() => toggleExperienceCategory(category)}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <ChevronDown size={16} aria-hidden="true" className={`transition-transform ${expanded ? "rotate-180" : ""}`} />
                </button>
              </div>
              {expanded && (
                <div id={`experience-types-${category}`} role="group" aria-label={`${categoryLabel} ${t("ui.discovery.types")}`} className="ml-7 mt-2 space-y-2 border-l border-border pl-4">
                  {detail.types.map((type) => {
                    const token = `${category}:${type.slug}`;
                    const typeId = `experience-type-${category}-${type.slug}`;
                    return (
                      <label key={token} htmlFor={typeId} className="flex min-h-8 cursor-pointer items-center gap-3 text-sm text-muted-foreground hover:text-foreground">
                        <Checkbox
                          id={typeId}
                          aria-label={t(`ui.map.types.${type.slug}`)}
                          checked={value.types.includes(token)}
                          onCheckedChange={(checked) => toggleExperienceType(category, type.slug, checked === true)}
                        />
                        <span>{t(`ui.map.types.${type.slug}`)}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </fieldset>

      <section className="rounded-xl border border-border/70 bg-card p-3">
        <button
          type="button"
          data-testid="experience-badges-toggle"
          aria-expanded={experienceBadgesExpanded}
          aria-controls="experience-badges"
          onClick={() => setExperienceBadgesExpanded((expanded) => !expanded)}
          className="flex min-h-8 w-full cursor-pointer list-none items-center justify-between gap-3 text-left text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          {t("ui.discovery.badges")}
          <ChevronDown size={16} aria-hidden="true" className={`shrink-0 text-muted-foreground transition-transform ${experienceBadgesExpanded ? "rotate-180" : ""}`} />
        </button>
        {experienceBadgesExpanded && <fieldset id="experience-badges" className="mt-3 space-y-2">
          <legend className="sr-only">{t("ui.discovery.badges")}</legend>
          {([
            ["hiddenGemOnly", "ui.discovery.hiddenGemOnly"],
            ["familyFriendlyOnly", "ui.discovery.familyFriendlyOnly"],
            ["coupleFriendlyOnly", "ui.discovery.coupleFriendlyOnly"],
          ] as const).map(([key, labelKey]) => {
            const id = `experience-badge-${key}`;
            return (
              <label key={key} htmlFor={id} className="flex min-h-8 cursor-pointer items-center gap-3 text-sm text-foreground">
                <Checkbox
                  id={id}
                  aria-label={t(labelKey)}
                  checked={value[key]}
                  onCheckedChange={(checked) => onChange({ [key]: checked === true })}
                />
                <span>{t(labelKey)}</span>
              </label>
            );
          })}
        </fieldset>}
      </section>
    </section>
  );
  const activeFilterCount = [
    Boolean(value.q.trim()),
    Boolean(value.state),
    value.categories.some((item) => !excludedCategories.includes(item)) || (showTypeFilters && value.types.length > 0),
    value.priceMax !== null,
    value.operatingDays.length > 0,
    value.hoursMode !== "during" || Boolean(value.timeAt || value.timeFrom || value.timeTo || value.overnight || value.openNow),
    value.freeOnly || value.bookableOnly || (showTagPreferenceFilters && (value.hiddenGemOnly || value.familyFriendlyOnly || value.coupleFriendlyOnly)),
  ].filter(Boolean).length;
  const clearAllFilters = () => {
    onClear();
    setFiltersOpen(false);
  };
  const searchField = <DiscoverySearchField value={value.q} onChange={(q) => onChange({ q })} placeholder={placeholder} />;
  const categoryFilter = (
    <DiscoveryCategoryFilter
      variant={categoryVariant}
      headingKey="ui.search.category"
      includeAll={includeAllCategories}
      category={category}
      hasActiveFilters={false}
      onCategoryChange={onCategoryChange}
      onClear={onClear}
      excludedCategories={excludedCategories}
      showClear={false}
    />
  );
  const advancedFilters = <DiscoveryAdvancedFilters value={value} onChange={onChange} showTypeFilters={showTypeFilters} showTagPreferenceFilters={showTagPreferenceFilters} />;

  if (mode === "experiences") {
    return <section data-testid="customer-discovery-filter-panel" className="space-y-4">{experienceFacetFilters}</section>;
  }

  if (layout === "sidebar") {
    return (
      <section data-testid="customer-discovery-filter-panel" className="space-y-5">
        {showSearchField && searchField}
        <div className="border-b border-border pb-4">{categoryFilter}</div>
        <div className="border-b border-border pb-4">{openNowFilter}</div>
        {advancedFilters}
        {hasActiveFilters && <button type="button" onClick={clearAllFilters} className="text-xs font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{t("ui.actions.clearFilters")}</button>}
      </section>
    );
  }

  return (
    <section data-testid="customer-discovery-filter-panel" className="space-y-4 rounded-2xl border border-border/80 bg-card p-4 sm:p-5">
      {searchField}
      {categoryFilter}
      <div className={`flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center ${filterButtonAlignment === "end" ? "sm:justify-end sm:gap-4" : "sm:justify-between"}`}>
        <div className="flex flex-wrap items-center gap-2">
          {openNowFilter}
          <button
            type="button"
            aria-expanded={filtersOpen}
            aria-controls="customer-discovery-advanced-filters"
            aria-label={activeFilterCount > 0 ? `${t("ui.map.moreFilters")} (${t("ui.map.activeFilters", { count: activeFilterCount })})` : t("ui.map.moreFilters")}
            onClick={() => setFiltersOpen((open) => !open)}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-primary/20 bg-secondary/50 px-4 py-2 text-xs font-bold text-primary transition hover:border-primary/40 hover:bg-secondary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20"
          >
            <SlidersHorizontal size={14} aria-hidden="true" />
            {t("ui.map.moreFilters")}
            {activeFilterCount > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] text-white">{activeFilterCount}</span>}
            <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
          </button>
        </div>
        {hasActiveFilters && <button type="button" onClick={clearAllFilters} className="inline-flex items-center gap-1 self-start text-xs font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:self-auto">{t("ui.actions.clearFilters")}</button>}
      </div>
      <div id="customer-discovery-advanced-filters" hidden={!filtersOpen}>
        {filtersOpen && advancedFilters}
      </div>
    </section>
  );
}
