"use client";

import { useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { PlaceCard } from "@/components/customer/place-card";
import type { Place } from "@/backend/core/types";
import { filterPlaceListings, getPlaceListingCounts, parsePlaceAreaIds, serializePlaceAreaIds, type PlaceAvailabilityFilter, type ResolvedEntryPrice } from "@/lib/customer/place-list";

type Area = { id: string; name: string };

function AreaPicker({ areas, selected, onChange }: { areas: Area[]; selected: ReadonlySet<string>; onChange: (next: Set<string>) => void }) {
  const { t } = useTranslation("customer");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const visibleAreas = areas.filter((area) => area.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));

  function toggle(areaId: string) {
    const next = new Set(selected);
    if (next.has(areaId)) next.delete(areaId);
    else next.add(areaId);
    onChange(next);
  }

  return (
    <div className="relative" aria-label={t("ui.place.filterAreaLabel")}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)} className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-muted-foreground transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
        {selected.size === 0 ? t("ui.place.allAreas") : t("ui.place.selectedAreas", { count: selected.size })}
        <span aria-hidden="true">⌄</span>
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-[min(20rem,calc(100vw-3rem))] rounded-2xl border border-border bg-card p-3 shadow-xl" role="dialog" aria-label={t("ui.place.filterAreaLabel")}>
          <div className="flex items-center gap-2">
            <input aria-label={t("ui.place.searchAreas")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("ui.place.searchAreas")} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary/40" />
            <button type="button" onClick={() => onChange(new Set())} className="text-xs font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{t("ui.actions.clearFilters")}</button>
          </div>
          <div className="mt-3 max-h-60 space-y-1 overflow-y-auto pr-1">
            {visibleAreas.length === 0 ? <p className="px-2 py-3 text-sm text-muted-foreground">{t("ui.place.noAreasMatch")}</p> : visibleAreas.map((area) => (
              <label key={area.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-foreground hover:bg-secondary">
                <input type="checkbox" checked={selected.has(area.id)} onChange={() => toggle(area.id)} className="h-4 w-4 accent-primary" />
                <span>{area.name}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Flat POI listing for a state page. Region used to be the grouping axis;
 * now it's a filter alongside "Bookable" and "Free entry" — see
 * docs/plans/2026-08-13-0006-place-page-listing-filters-and-imagery.md D1/D2.
 */
export function PlaceList({
  pois,
  productCounts,
  resolvedEntries,
  regions,
  regionByPoi,
}: {
  pois: Place[];
  productCounts: Record<string, number>;
  resolvedEntries: Record<string, ResolvedEntryPrice>;
  regions: { id: string; name: string }[];
  regionByPoi: Record<string, string>;
}) {
  const { t } = useTranslation("customer");
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [availability, setAvailability] = useState<PlaceAvailabilityFilter>("all");
  const supportedAreaIds = useMemo(() => new Set(regions.map((region) => region.id)), [regions]);
  const selectedRegions = useMemo(() => parsePlaceAreaIds(searchParams.getAll("area"), supportedAreaIds), [searchParams, supportedAreaIds]);

  const counts = getPlaceListingCounts(pois, productCounts);

  const filtered = useMemo(() => {
    return filterPlaceListings(pois, productCounts, regionByPoi, availability, selectedRegions);
  }, [availability, pois, productCounts, regionByPoi, selectedRegions]);

  function setSelectedRegions(next: Set<string>) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("area");
    for (const areaId of serializePlaceAreaIds(next)) params.append("area", areaId);
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  return (
    <section className="mt-14" aria-labelledby="places-to-visit-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{t("ui.explore.eyebrow")}</p>
          <h2 id="places-to-visit-heading" className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("ui.place.placesToVisit", { count: filtered.length })}
          </h2>
          <p aria-live="polite" className="mt-2 text-sm text-muted-foreground">
            {t("ui.place.listingSummary", { shown: filtered.length, total: pois.length })}
          </p>
        </div>
        <span className="inline-flex w-fit rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-primary">
          {t("ui.place.bookableCount", { count: counts.bookable })}
        </span>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5" aria-label={t("ui.place.filterAvailabilityLabel")}>
            <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{t("ui.place.filterShow")}</span>
            {([
              ["all", `${t("ui.place.all")} (${counts.all})`],
              ["bookable", `${t("ui.place.bookable")} (${counts.bookable})`],
              ["freeEntry", `${t("ui.place.freeEntry")} (${counts.freeEntry})`],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={availability === value}
                onClick={() => {
                  setAvailability(value);
                  setSelectedRegions(new Set());
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  availability === value ? "bg-primary text-white shadow-sm" : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {regions.length > 1 && (
            <div className="flex flex-wrap items-center gap-1.5 lg:border-l lg:border-border lg:pl-4">
              <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{t("ui.labels.location")}</span>
              <AreaPicker areas={regions} selected={selectedRegions} onChange={setSelectedRegions} />
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-secondary/30 px-6 py-10 text-center">
          <p className="font-semibold text-foreground">{t("ui.place.noPlacesMatch")}</p>
          <button
            type="button"
            onClick={() => {
              setAvailability("all");
              setSelectedRegions(new Set());
            }}
            className="mt-2 text-sm font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {t("ui.actions.clearFilters")}
          </button>
        </div>
      ) : (
        <div className="mt-6 grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((poi) => (
            <PlaceCard key={poi.id} place={poi} productCount={productCounts[poi.id] ?? 0} resolvedEntry={resolvedEntries[poi.id]} />
          ))}
        </div>
      )}
    </section>
  );
}
