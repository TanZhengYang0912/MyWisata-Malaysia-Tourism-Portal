"use client";

import { ArrowLeft, ArrowUpDown, Clock3, MapPin, RotateCcw, Star, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TripPlaceFilters, TripPlacePriceBand, TripPlaceSort } from "./trip-place-discovery";

const PRICE_BANDS: Array<{ value: TripPlacePriceBand; key: string }> = [
  { value: "all", key: "all" },
  { value: "free", key: "free" },
  { value: "under_25", key: "under25" },
  { value: "25_50", key: "from25To50" },
  { value: "50_100", key: "from50To100" },
  { value: "100_plus", key: "from100" },
];

const SORTS: Array<{ value: TripPlaceSort; key: string; needsOrigin?: boolean }> = [
  { value: "recommended", key: "recommended" },
  { value: "popular", key: "popular" },
  { value: "distance", key: "distance", needsOrigin: true },
  { value: "price", key: "price" },
  { value: "rating", key: "rating" },
  { value: "suggested_newest", key: "suggestedNewest" },
  { value: "suggested_oldest", key: "suggestedOldest" },
  { value: "name_asc", key: "nameAsc" },
  { value: "name_desc", key: "nameDesc" },
];

const DISTANCES = [1, 2, 5, null] as const;
const RATINGS = [null, 3, 4, 4.5] as const;

export function TripPlaceFilterPanel({
  filters,
  hasOrigin,
  resultCount,
  onChange,
  onClear,
  onDone,
}: {
  filters: TripPlaceFilters;
  hasOrigin: boolean;
  resultCount: number;
  onChange: (patch: Partial<TripPlaceFilters>) => void;
  onClear: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation("customer");
  const key = "strictMigration.tripPlanner.filters";

  return (
    <section aria-label={t(`${key}.title`)} className="flex min-h-0 flex-1 flex-col bg-card">
      <header className="shrink-0 border-b border-border px-4 py-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onDone} aria-label={t(`${key}.done`)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border text-primary transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
            <ArrowLeft size={16} aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-foreground">{t(`${key}.title`)}</h2>
            <p aria-live="polite" className="mt-0.5 text-xs text-muted-foreground">{t(`${key}.results`, { count: resultCount })}</p>
          </div>
          <button type="button" onClick={onClear} className="inline-flex items-center gap-1 text-xs font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
            <RotateCcw size={13} aria-hidden="true" /> {t(`${key}.clearAll`)}
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
        <label className="block text-xs font-bold text-foreground">
          <span className="flex items-center gap-2"><Tag size={15} className="text-muted-foreground" aria-hidden="true" />{t(`${key}.priceRange`)}</span>
          <select aria-label={t(`${key}.priceRange`)} value={filters.priceBand} onChange={(event) => onChange({ priceBand: event.target.value as TripPlacePriceBand })} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary">
            {PRICE_BANDS.map((option) => <option key={option.value} value={option.value}>{t(`${key}.priceBands.${option.key}`)}</option>)}
          </select>
        </label>

        <label className="block text-xs font-bold text-foreground">
          <span className="flex items-center gap-2"><Star size={15} className="text-muted-foreground" aria-hidden="true" />{t(`${key}.minimumRating`)}</span>
          <select aria-label={t(`${key}.minimumRating`)} value={filters.minimumRating ?? ""} onChange={(event) => onChange({ minimumRating: event.target.value ? Number(event.target.value) : null })} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary">
            {RATINGS.map((rating) => <option key={rating ?? "all"} value={rating ?? ""}>{t(`${key}.ratings.${rating === null ? "all" : rating === 3 ? "three" : rating === 4 ? "four" : "fourPointFive"}`)}</option>)}
          </select>
        </label>

        <label className="block text-xs font-bold text-foreground">
          <span className="flex items-center gap-2"><ArrowUpDown size={15} className="text-muted-foreground" aria-hidden="true" />{t(`${key}.sortBy`)}</span>
          <select aria-label={t(`${key}.sortBy`)} value={filters.sort} onChange={(event) => onChange({ sort: event.target.value as TripPlaceSort })} className="mt-2 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold outline-none focus:border-primary">
            {SORTS.map((option) => <option key={option.value} value={option.value} disabled={option.needsOrigin && !hasOrigin}>{t(`${key}.sorts.${option.key}`)}</option>)}
          </select>
        </label>

        <div>
          <p className="flex items-center gap-2 text-xs font-bold text-foreground"><Clock3 size={15} className="text-muted-foreground" aria-hidden="true" />{t(`${key}.availability`)}</p>
          <button type="button" role="switch" aria-checked={filters.openNow} onClick={() => onChange({ openNow: !filters.openNow })} className="mt-2 flex w-full items-center justify-between rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">
            {t(`${key}.openNow`)}
            <span aria-hidden="true" className={`relative h-6 w-11 rounded-full transition ${filters.openNow ? "bg-primary" : "bg-muted"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${filters.openNow ? "left-6" : "left-1"}`} /></span>
          </button>
        </div>

        <div>
          <p className="flex items-center gap-2 text-xs font-bold text-foreground"><MapPin size={15} className="text-muted-foreground" aria-hidden="true" />{t(`${key}.nearbyToAdd`)}</p>
          <div className="mt-2 grid grid-cols-4 gap-2">
            {DISTANCES.map((distance) => {
              const selected = filters.distanceKm === distance;
              return <button key={distance ?? "all"} type="button" disabled={!hasOrigin && distance !== null} aria-pressed={selected} onClick={() => onChange({ distanceKm: distance })} className={`rounded-full border px-2 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:cursor-not-allowed disabled:opacity-35 ${selected ? "border-primary bg-primary text-white" : "border-border bg-background text-muted-foreground hover:border-primary hover:text-primary"}`}>{distance === null ? t(`${key}.distanceAll`) : `${distance} km`}</button>;
            })}
          </div>
          {!hasOrigin && <p className="mt-2 text-[11px] leading-4 text-muted-foreground">{t(`${key}.locationRequired`)}</p>}
        </div>
      </div>

      <footer className="shrink-0 border-t border-border bg-card px-4 py-3">
        <button type="button" onClick={onDone} className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">{t(`${key}.done`)}</button>
      </footer>
    </section>
  );
}
