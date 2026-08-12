"use client";

import { useMemo, useState } from "react";
import { PlaceCard } from "@/components/customer/place-card";
import type { Place } from "@/backend/core/types";

/**
 * Flat POI listing for a state page. Region used to be the grouping axis;
 * now it's a filter alongside "Bookable" — see
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
  const [bookableOnly, setBookableOnly] = useState(true);
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());

  const bookableCount = pois.filter((poi) => (productCounts[poi.id] ?? 0) > 0).length;

  const filtered = useMemo(() => {
    return pois.filter((poi) => {
      if (bookableOnly && (productCounts[poi.id] ?? 0) === 0) return false;
      if (selectedRegions.size > 0 && !selectedRegions.has(regionByPoi[poi.id])) return false;
      return true;
    });
  }, [pois, productCounts, bookableOnly, selectedRegions, regionByPoi]);

  function toggleRegion(regionId: string) {
    setSelectedRegions((prev) => {
      const next = new Set(prev);
      if (next.has(regionId)) next.delete(regionId);
      else next.add(regionId);
      return next;
    });
  }

  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "place" : "places"} to visit
      </h2>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setBookableOnly((v) => !v)}
          className={`rounded-full px-3 py-1 text-xs font-bold transition ${
            bookableOnly ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
          }`}
        >
          Bookable {bookableOnly && `(${bookableCount})`}
        </button>
        {regions.length > 1 && (
          <div className="flex flex-wrap gap-1.5 border-l border-border pl-3">
            {regions.map((region) => (
              <button
                key={region.id}
                type="button"
                onClick={() => toggleRegion(region.id)}
                className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                  selectedRegions.has(region.id)
                    ? "bg-primary text-white"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {region.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No places match these filters.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((poi) => (
            <PlaceCard key={poi.id} place={poi} productCount={productCounts[poi.id] ?? 0} />
          ))}
        </div>
      )}
    </section>
  );
}
