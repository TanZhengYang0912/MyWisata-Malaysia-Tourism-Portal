"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PlaceCard } from "@/components/customer/place-card";
import type { Place } from "@/backend/core/types";
import { filterPlaceListings, getPlaceListingCounts, type PlaceAvailabilityFilter } from "@/lib/customer/place-list";

/**
 * Flat POI listing for a state page. Region used to be the grouping axis;
 * now it's a filter alongside "Bookable" and "Free entry" — see
 * docs/plans/2026-08-13-0006-place-page-listing-filters-and-imagery.md D1/D2.
 */
export function PlaceList({
  pois,
  productCounts,
  regions,
  regionByPoi,
}: {
  pois: Place[];
  productCounts: Record<string, number>;
  regions: { id: string; name: string }[];
  regionByPoi: Record<string, string>;
}) {
  const { t } = useTranslation("customer");
  const [availability, setAvailability] = useState<PlaceAvailabilityFilter>("all");
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());

  const counts = getPlaceListingCounts(pois, productCounts);

  const filtered = useMemo(() => {
    return filterPlaceListings(pois, productCounts, regionByPoi, availability, selectedRegions);
  }, [availability, pois, productCounts, regionByPoi, selectedRegions]);

  function toggleRegion(regionId: string) {
    setSelectedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(regionId)) next.delete(regionId);
      else next.add(regionId);
      return next;
    });
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
            {t("ui.place.listingSummary", { shown: filtered.length, total: pois.length, defaultValue: "Showing {{shown}} of {{total}} places to explore" })}
          </p>
        </div>
        <span className="inline-flex w-fit rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-primary">
          {t("ui.place.bookableCount", { count: counts.bookable, defaultValue: `${counts.bookable} bookable ${counts.bookable === 1 ? "place" : "places"}` })}
        </span>
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-1.5" aria-label={t("ui.place.filterAvailabilityLabel", { defaultValue: "Filter places by availability" })}>
            <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{t("ui.place.filterShow", { defaultValue: "Show" })}</span>
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
            <div className="flex flex-wrap items-center gap-1.5 lg:border-l lg:border-border lg:pl-4" aria-label={t("ui.place.filterAreaLabel", { defaultValue: "Filter places by area" })}>
              <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{t("ui.labels.location")}</span>
              <button
                type="button"
                aria-pressed={selectedRegions.size === 0}
                onClick={() => setSelectedRegions(new Set())}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  selectedRegions.size === 0 ? "bg-primary text-white shadow-sm" : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {t("ui.place.allAreas", { defaultValue: "All areas" })}
              </button>
              {regions.map((region) => (
                <button
                  key={region.id}
                  type="button"
                  aria-pressed={selectedRegions.has(region.id)}
                  onClick={() => toggleRegion(region.id)}
                  className={`rounded-full px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    selectedRegions.has(region.id) ? "bg-primary text-white shadow-sm" : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {region.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-secondary/30 px-6 py-10 text-center">
          <p className="font-semibold text-foreground">{t("ui.place.noPlacesMatch", { defaultValue: "No places match these filters." })}</p>
          <button
            type="button"
            onClick={() => {
              setAvailability("all");
              setSelectedRegions(new Set());
            }}
            className="mt-2 text-sm font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {t("ui.actions.clearFilters", { defaultValue: "Clear filters" })}
          </button>
        </div>
      ) : (
        <div className="mt-6 grid items-stretch gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((poi) => (
            <PlaceCard key={poi.id} place={poi} productCount={productCounts[poi.id] ?? 0} />
          ))}
        </div>
      )}
    </section>
  );
}
