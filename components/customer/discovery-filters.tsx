"use client";

import { Search as SearchIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CATEGORIES } from "@/backend/domains/catalogue";
import { CategoryIcon } from "@/components/customer/category-icon";

interface DiscoverySearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}

export function DiscoverySearchField({ value, onChange, placeholder }: DiscoverySearchFieldProps) {
  const { t } = useTranslation("customer");
  return (
    <label className="flex min-h-14 flex-1 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
      <SearchIcon size={17} className="shrink-0 text-primary" aria-hidden="true" />
      <span className="sr-only">{t("ui.discovery.searchLabel", { defaultValue: placeholder })}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={t("ui.discovery.searchLabel", { defaultValue: placeholder })}
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
}

export function DiscoveryCategoryFilter({
  category,
  hasActiveFilters,
  onCategoryChange,
  onClear,
}: DiscoveryCategoryFilterProps) {
  const { t } = useTranslation("customer");
  return (
    <section aria-labelledby="discovery-category-filter-heading">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h2 id="discovery-category-filter-heading" className="text-lg font-bold text-foreground">{t("ui.explore.filterByCategory")}</h2>
        {hasActiveFilters && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {t("ui.actions.clearFilters")}
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {CATEGORIES.map((categoryOption) => {
          const selected = category === categoryOption.id;
          return (
            <button
              key={categoryOption.id}
              type="button"
              onClick={() => onCategoryChange(selected ? null : categoryOption.id)}
              aria-pressed={selected}
              className={`flex min-h-20 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 p-3 text-center transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 ${
                selected ? "border-primary bg-primary/10" : "border-transparent bg-card shadow-sm"
              }`}
            >
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${selected ? "bg-primary text-white" : "bg-secondary text-primary"}`}>
                <CategoryIcon category={categoryOption.id} size={22} strokeWidth={1.8} />
              </span>
              <span className="text-[10px] font-bold leading-tight" style={{ color: selected ? "var(--primary)" : "var(--foreground)" }}>
                {t(`categories.${categoryOption.id}`, { defaultValue: categoryOption.label })}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
