"use client";

import { ChevronDown, Search as SearchIcon, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CATEGORIES, STATES_MY } from "@/backend/domains/catalogue";
import { CategoryIcon } from "@/components/customer/category-icon";
import { CATEGORY_DETAILS } from "@/lib/customer/category-details";
import type { DiscoveryQuery } from "@/lib/customer/discovery-query";

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
  const weekdays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  const dayGroups: Array<{ key: string; label: string; days: DiscoveryQuery["operatingDays"] }> = [
    { key: "any", label: t("ui.discovery.anyDay"), days: [] },
    { key: "weekdays", label: t("ui.discovery.weekdays"), days: ["mon", "tue", "wed", "thu", "fri"] },
    { key: "weekend", label: t("ui.discovery.weekend"), days: ["sat", "sun"] },
  ];
  const toggleDay = (day: (typeof weekdays)[number]) => onChange({ operatingDays: value.operatingDays.includes(day) ? value.operatingDays.filter((selected) => selected !== day) : [...value.operatingDays, day] });
  const setDayGroup = (days: DiscoveryQuery["operatingDays"]) => onChange({ operatingDays: days });
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
    <section aria-label={t("ui.discovery.advancedFilters")} className="grid gap-4 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
      <label className="text-sm font-bold text-foreground">
        <span>{t("ui.discovery.state")}</span>
        <select aria-label={t("ui.discovery.state")} value={value.state ?? ""} onChange={(event) => onChange({ state: event.target.value || null })} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm">
          <option value="">{t("ui.map.allStatesTerritories")}</option>
          {STATES_MY.filter((state) => state !== "All Malaysia").map((state) => <option key={state} value={state}>{state}</option>)}
        </select>
      </label>
      <label className="text-sm font-bold text-foreground">
        <span>{t("ui.discovery.maximumPrice")}</span>
        <input aria-label={t("ui.discovery.maximumPrice")} type="number" min="0" value={value.priceMax ?? ""} onChange={(event) => onChange({ priceMax: event.target.value === "" ? null : Number(event.target.value) })} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm" />
      </label>
      <div className="sm:col-span-2 rounded-xl border border-border/70 bg-background/60 p-3">
        <p className="text-sm font-bold text-foreground">{t("ui.discovery.operatingDays")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {dayGroups.map(({ key, label, days }) => {
            const selected = value.operatingDays.length === 0 ? key === "any" : JSON.stringify(value.operatingDays) === JSON.stringify(days);
            return <button key={key} type="button" aria-pressed={selected} onClick={() => setDayGroup(days)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${selected ? "border-primary bg-primary text-white" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>{label}</button>;
          })}
          {weekdays.map((day) => <button key={day} type="button" aria-label={t(`ui.labels.days.${day}`)} aria-pressed={value.operatingDays.includes(day)} onClick={() => toggleDay(day)} className={`rounded-full border px-2.5 py-1.5 text-xs font-semibold ${value.operatingDays.includes(day) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{t(`ui.labels.days.${day}`)}</button>)}
        </div>
      </div>
      <div className="sm:col-span-2 rounded-xl border border-border/70 bg-background/60 p-3">
        <p className="text-sm font-bold text-foreground">{t("ui.discovery.hoursMode")}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {(["any", "at", "during"] as const).map((mode) => <button key={mode} type="button" aria-pressed={value.hoursMode === mode} onClick={() => onChange(mode === "any" ? { hoursMode: mode, timeAt: null, timeFrom: null, timeTo: null, overnight: false } : mode === "at" ? { hoursMode: mode, timeFrom: null, timeTo: null, overnight: false } : { hoursMode: mode, timeAt: null })} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${value.hoursMode === mode ? "border-primary bg-primary text-white" : "border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>{t(`ui.discovery.${mode === "any" ? "anyTime" : mode === "at" ? "openAt" : "openDuring"}`)}</button>)}
        </div>
        {value.hoursMode === "at" && <label className="mt-3 block text-xs font-semibold text-muted-foreground"><span>{t("ui.discovery.timeAt")}</span><input type="time" aria-label={t("ui.discovery.timeAt")} value={value.timeAt ?? ""} onChange={(event) => onChange({ timeAt: event.target.value || null })} className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-foreground" /></label>}
        {value.hoursMode === "during" && <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-muted-foreground"><span>{t("ui.discovery.timeFrom")}</span><input type="time" aria-label={t("ui.discovery.timeFrom")} value={value.timeFrom ?? ""} onChange={(event) => onChange({ timeFrom: event.target.value || null })} className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-foreground" /></label><label className="text-xs font-semibold text-muted-foreground"><span>{t("ui.discovery.timeTo")}</span><input type="time" aria-label={t("ui.discovery.timeTo")} value={value.timeTo ?? ""} min={value.overnight ? undefined : value.timeFrom ?? undefined} onChange={(event) => onChange({ timeTo: event.target.value || null })} className="mt-1.5 w-full rounded-xl border border-border bg-background px-3 py-2 text-base text-foreground" /></label></div>}
        {value.hoursMode === "during" && <label className="mt-3 flex items-start gap-2 text-xs font-semibold text-muted-foreground"><input type="checkbox" checked={value.overnight} onChange={(event) => onChange({ overnight: event.target.checked })} className="mt-0.5 accent-primary" /> <span>{t("ui.discovery.overnight")}<span className="mt-0.5 block font-normal">{t("ui.discovery.overnightHelp")}</span></span></label>}
        <label className="mt-3 flex items-start gap-2 text-xs font-semibold text-muted-foreground"><input type="checkbox" checked={value.openNow} onChange={(event) => onChange({ openNow: event.target.checked })} className="mt-0.5 accent-primary" /> <span>{t("ui.labels.openNow")}<span className="mt-0.5 block font-normal">{t("ui.discovery.openNowHelp")}</span></span></label>
        <p className="mt-2 text-xs font-normal text-muted-foreground">{t("ui.discovery.timeRangeHelp")}</p>
      </div>
      <div className="sm:col-span-2 space-y-3">
        {Object.entries(CATEGORY_DETAILS).map(([category, detail]) => (
          <div key={category}>
            <p className="text-xs font-bold text-muted-foreground">{t(`categories.${category}`)}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {detail.types.map((type) => {
                const token = `${category}:${type.slug}`;
                const selected = value.types.includes(token) || (value.categories.includes(category) && !value.types.some((item) => item.startsWith(`${category}:`)));
                return <button key={token} type="button" aria-label={t(`ui.map.types.${type.slug}`)} aria-pressed={selected} onClick={() => toggleType(category, type.slug, detail.types.map((option) => option.slug))} className={`rounded-full border px-2 py-1 text-xs ${selected ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>{t(`ui.map.types.${type.slug}`)}</button>;
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="sm:col-span-2 flex flex-wrap gap-2">
        {([
          ["freeOnly", "ui.discovery.freeOnly"], ["bookableOnly", "ui.discovery.bookableOnly"], ["hiddenGemOnly", "ui.discovery.hiddenGemOnly"], ["familyFriendlyOnly", "ui.discovery.familyFriendlyOnly"], ["coupleFriendlyOnly", "ui.discovery.coupleFriendlyOnly"],
        ] as const).map(([key, label]) => <button key={key} type="button" aria-label={t(label)} aria-pressed={value[key]} onClick={() => toggleBoolean(key)} className={`rounded-full border px-3 py-2 text-xs font-bold ${value[key] ? "border-primary bg-primary text-white" : "border-border text-muted-foreground"}`}>{t(label)}</button>)}
      </div>
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
      <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          aria-expanded={filtersOpen}
          aria-label={activeFilterCount > 0 ? `${t("ui.map.moreFilters")} (${t("ui.map.activeFilters", { count: activeFilterCount })})` : t("ui.map.moreFilters")}
          onClick={() => setFiltersOpen((open) => !open)}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-primary/20 bg-secondary/50 px-4 py-2 text-xs font-bold text-primary transition hover:border-primary/40 hover:bg-secondary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 sm:self-start"
        >
          <SlidersHorizontal size={14} aria-hidden="true" />
          {t("ui.map.moreFilters")}
          {activeFilterCount > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] text-white">{activeFilterCount}</span>}
          <ChevronDown size={14} aria-hidden="true" className={`transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
        </button>
        {hasActiveFilters && <button type="button" onClick={clearAllFilters} className="inline-flex items-center gap-1 self-start text-xs font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:self-auto">{t("ui.actions.clearFilters")}</button>}
      </div>
      {filtersOpen && <DiscoveryAdvancedFilters value={value} onChange={onChange} />}
    </section>
  );
}
