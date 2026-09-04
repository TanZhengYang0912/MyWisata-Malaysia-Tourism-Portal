import type { Place, PlaceProduct, PlaceRelation } from "@/backend/core/types";

export type PlaceAvailabilityFilter = "all" | "bookable" | "freeEntry";

export interface PlaceListingCounts {
  all: number;
  bookable: number;
  freeEntry: number;
}

export type PlaceActivityFilter = "all" | PlaceRelation;

const PLACE_ACTIVITY_LABELS: Record<PlaceRelation, string> = {
  admission: "Entry ticket",
  guide_service: "Guided experience",
  addon: "Add-on",
};

export function getPlaceActivityLabel(relation: PlaceRelation): string {
  return PLACE_ACTIVITY_LABELS[relation];
}

export interface PlaceActivityFilterCounts {
  all: number;
  admission: number;
  guide_service: number;
  addon: number;
}

export function getPlaceActivityFilterCounts(products: readonly PlaceProduct[]): PlaceActivityFilterCounts {
  return {
    all: products.length,
    admission: products.filter(({ relation }) => relation === "admission").length,
    guide_service: products.filter(({ relation }) => relation === "guide_service").length,
    addon: products.filter(({ relation }) => relation === "addon").length,
  };
}

export function filterPlaceActivities(
  products: readonly PlaceProduct[],
  filter: PlaceActivityFilter,
): PlaceProduct[] {
  return filter === "all" ? [...products] : products.filter(({ relation }) => relation === filter);
}

export function getPlaceListingCounts(
  places: readonly Place[],
  productCounts: Record<string, number>,
): PlaceListingCounts {
  return {
    all: places.length,
    bookable: places.filter((place) => (productCounts[place.id] ?? 0) > 0).length,
    freeEntry: places.filter((place) => place.entryFee === null || place.entryFee === 0).length,
  };
}

export function filterPlaceListings(
  places: readonly Place[],
  productCounts: Record<string, number>,
  regionByPoi: Record<string, string>,
  availability: PlaceAvailabilityFilter,
  selectedRegions: ReadonlySet<string>,
): Place[] {
  return places.filter((place) => {
    const isBookable = (productCounts[place.id] ?? 0) > 0;
    const isFreeEntry = place.entryFee === null || place.entryFee === 0;
    const matchesAvailability = availability === "all"
      || (availability === "bookable" && isBookable)
      || (availability === "freeEntry" && isFreeEntry);
    const matchesRegion = selectedRegions.size === 0 || selectedRegions.has(regionByPoi[place.id]);
    return matchesAvailability && matchesRegion;
  });
}

/** Keeps URL-driven area selection stable as a state grows beyond a few chips. */
export function parsePlaceAreaIds(values: readonly string[], supportedAreaIds: ReadonlySet<string>): Set<string> {
  return new Set(values.filter((value) => supportedAreaIds.has(value)));
}

export function serializePlaceAreaIds(areaIds: ReadonlySet<string>): string[] {
  return [...areaIds].sort();
}
