"use client";

import { Search as SearchIcon } from "lucide-react";
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
               aria-label={t(categoryOption.labelKey ?? "ui.explore.allCategories")}
               aria-pressed={selected}
              className={compact
                ? `inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 ${selected ? "border-primary bg-primary text-white shadow-xs" : "border-border bg-background text-muted-foreground hover:bg-muted/40"}`
                : `flex min-h-20 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 p-3 text-center transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 ${selected ? "border-primary bg-primary text-white shadow-sm" : "border-transparent bg-card text-foreground shadow-sm"}`}
            >
              <span className={`flex shrink-0 items-center justify-center ${compact ? "h-5 w-5 rounded-full" : "h-11 w-11 rounded-2xl"} ${selected ? "bg-white/20 text-white" : "bg-secondary text-primary"}`}>
                <CategoryIcon category={categoryOption.id} size={compact ? 14 : 22} strokeWidth={compact ? 2 : 1.8} />
              </span>
              <span className={compact ? "whitespace-nowrap" : `text-[10px] font-bold leading-tight ${selected ? "text-white" : "text-foreground"}`}>
                {t(categoryOption.labelKey ?? "ui.explore.allCategories")}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

type DiscoveryAdvancedFiltersProps = {
  value: Pick<DiscoveryQuery, "state" | "categories" | "types" | "priceMax" | "freeOnly" | "bookableOnly" | "hiddenGemOnly" | "familyFriendlyOnly" | "coupleFriendlyOnly">;
  onChange: (patch: Partial<DiscoveryQuery>) => void;
};

export function DiscoveryAdvancedFilters({ value, onChange }: DiscoveryAdvancedFiltersProps) {
  const { t } = useTranslation("customer");
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
