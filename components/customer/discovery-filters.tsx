"use client";

import { ChevronDown, Clock3, Search as SearchIcon, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CATEGORIES, STATES_MY } from "@/backend/domains/catalogue";
import { CategoryIcon } from "@/components/customer/category-icon";
import { CATEGORY_DETAILS } from "@/lib/customer/category-details";
import { PRICE_MAX, type DiscoveryQuery } from "@/lib/customer/discovery-query";

const OPENING_TIME_SEGMENTS = [
  { key: "morning", from: "08:00", to: "11:00" },
  { key: "midday", from: "11:00", to: "14:00" },
  { key: "afternoon", from: "14:00", to: "17:00" },
  { key: "evening", from: "17:00", to: "20:00" },
  { key: "night", from: "20:00", to: "23:00" },
] as const;

interface DiscoverySearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export function DiscoverySearchField({ value, onChange, placeholder }: DiscoverySearchFieldProps) {
  const { t } = useTranslation("customer");
  return (
    <label className="flex min-h-11 flex-1 items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 py-2.5 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
      <SearchIcon size={16} className="shrink-0 text-primary" aria-hidden="true" />
      <span className="sr-only">{t("ui.discovery.searchLabel")}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={t("ui.discovery.searchLabel")}
        className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
    </label>
  );
}

interface DiscoveryCategoryFilterProps {
  category: string | null;
  hasActiveFilters: boolean;
  onCategoryChange: (category: string | null) => void;
  onClear: () => void;
  variant?: "cards" | "compact";
  showClear?: boolean;
  headingKey?: string;
  includeAll?: boolean;
}

export function DiscoveryCategoryFilter({
  category,
  hasActiveFilters,
  onCategoryChange,
  onClear,
  variant = "cards",
  showClear = true,
  headingKey = "ui.explore.filterByCategory",
  includeAll = false,
}: DiscoveryCategoryFilterProps) {
  const { t } = useTranslation("customer");
  const compact = variant === "compact";
  const categoryOptions = includeAll
    ? [{ id: "all", labelKey: "ui.map.allCategories" }, ...CATEGORIES]
    : CATEGORIES;
  return (
    <section aria-labelledby="discovery-category-filter-heading">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 id="discovery-category-filter-heading" className={`font-bold text-foreground ${compact ? "text-xs uppercase tracking-wider text-muted-foreground" : "text-lg"}`}>{t(headingKey)}</h2>
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
      <div className={compact ? "flex gap-2 overflow-x-auto pb-1 lg:flex-wrap" : "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5"}>
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
                : `flex min-h-20 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 p-3 text-center transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 ${selected ? "border-primary bg-primary text-white shadow-sm" : "border-transparent bg-card text-foreground shadow-sm"}`}
            >
              <span className={`flex shrink-0 items-center justify-center ${compact ? "h-5 w-5 rounded-full" : "h-11 w-11 rounded-2xl"} ${selected ? "bg-white/20 text-white" : "bg-secondary text-primary"}`}>
                <CategoryIcon category={categoryOption.id} size={compact ? 14 : 22} strokeWidth={compact ? 2 : 1.8} />
              </span>
              <span className={compact ? "whitespace-nowrap" : `text-[10px] font-bold leading-tight ${selected ? "text-white" : "text-foreground"}`}>
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
};

export function DiscoveryAdvancedFilters({ value, onChange }: DiscoveryAdvancedFiltersProps) {
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

      <details className="group rounded-xl border border-border/70 bg-card p-3 sm:p-4">
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
      </details>

      <details className="group rounded-xl border border-border/70 bg-card p-3 sm:p-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden">
          {t("ui.discovery.preferences")}
          <ChevronDown size={16} aria-hidden="true" className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-4 flex flex-wrap gap-2">
          {([
            ["freeOnly", "ui.discovery.freeOnly"], ["bookableOnly", "ui.discovery.bookableOnly"], ["hiddenGemOnly", "ui.discovery.hiddenGemOnly"], ["familyFriendlyOnly", "ui.discovery.familyFriendlyOnly"], ["coupleFriendlyOnly", "ui.discovery.coupleFriendlyOnly"],
          ] as const).map(([key, label]) => <button key={key} type="button" aria-label={t(label)} aria-pressed={value[key]} onClick={() => toggleBoolean(key)} className={`rounded-full border px-3 py-2 text-xs font-bold ${value[key] ? "border-primary bg-primary text-white" : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"}`}>{t(label)}</button>)}
        </div>
      </details>
    </section>
  );
}

export function CustomerDiscoveryFilterPanel({
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
}: {
  value: DiscoveryQuery;
  hasActiveFilters: boolean;
  onChange: (patch: Partial<DiscoveryQuery>) => void;
  onClear: () => void;
  placeholder: string;
  category: string | null;
  onCategoryChange: (category: string | null) => void;
  categoryVariant?: "cards" | "compact";
  includeAllCategories?: boolean;
  filterButtonAlignment?: "start" | "end";
}) {
  const { t } = useTranslation("customer");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount = [
    Boolean(value.q.trim()),
    Boolean(value.state),
    value.categories.length > 0 || value.types.length > 0,
    value.priceMax !== null,
    value.operatingDays.length > 0,
    value.hoursMode !== "during" || Boolean(value.timeAt || value.timeFrom || value.timeTo || value.overnight || value.openNow),
    value.freeOnly || value.bookableOnly || value.hiddenGemOnly || value.familyFriendlyOnly || value.coupleFriendlyOnly,
  ].filter(Boolean).length;
  const clearAllFilters = () => {
    onClear();
    setFiltersOpen(false);
  };
  return (
    <section data-testid="customer-discovery-filter-panel" className="space-y-4 rounded-2xl border border-border/80 bg-card p-4 sm:p-5">
      <DiscoverySearchField value={value.q} onChange={(q) => onChange({ q })} placeholder={placeholder} />
      <DiscoveryCategoryFilter
        variant={categoryVariant}
        headingKey="ui.search.category"
        includeAll={includeAllCategories}
        category={category}
        hasActiveFilters={false}
        onCategoryChange={onCategoryChange}
        onClear={onClear}
        showClear={false}
      />
      <div className={`flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center ${filterButtonAlignment === "end" ? "sm:justify-end sm:gap-4" : "sm:justify-between"}`}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={value.openNow}
            onClick={() => onChange({ openNow: !value.openNow })}
            className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 ${value.openNow ? "border-primary bg-primary text-white" : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"}`}
          >
            <Clock3 size={14} aria-hidden="true" />
            {t("ui.labels.openNow")}
          </button>
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
        {filtersOpen && <DiscoveryAdvancedFilters value={value} onChange={onChange} />}
      </div>
    </section>
  );
}
