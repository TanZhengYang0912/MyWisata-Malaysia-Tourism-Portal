import type { Place, PlaceProduct, PlaceRelation } from "@/backend/core/types";

export type PlaceAvailabilityFilter = "all" | "bookable" | "freeEntry";

export interface PlaceListingCounts {
  all: number;
  bookable: number;
  freeEntry: number;
}

/**
 * Admission is deliberately absent: a ticket is a precondition, not one of
 * several things to choose between, so it gets its own section.
 */
export type PlaceActivityFilter = "all" | "guide_service" | "addon";

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
  guide_service: number;
  addon: number;
}

export function isPlaceActivity({ relation }: PlaceProduct): boolean {
  return relation !== "admission";
}

export function getPlaceActivityFilterCounts(products: readonly PlaceProduct[]): PlaceActivityFilterCounts {
  const activities = products.filter(isPlaceActivity);
  return {
    all: activities.length,
    guide_service: activities.filter(({ relation }) => relation === "guide_service").length,
    addon: activities.filter(({ relation }) => relation === "addon").length,
  };
}

export function filterPlaceActivities(
  products: readonly PlaceProduct[],
  filter: PlaceActivityFilter,
): PlaceProduct[] {
  const activities = products.filter(isPlaceActivity);
  return filter === "all" ? activities : activities.filter(({ relation }) => relation === filter);
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

export interface ResolvedEntryPrice {
  price: number | null;
  /** True when a ticket sold here set the price — the badge then reads “From RMx”. */
  fromTicket: boolean;
}

/**
 * The price a visitor actually pays to get in.
 *
 * Money flows through the product, so the vendor's own price is the truth and a
 * vendor edit shows up here immediately. places.entry_fee is a copied public
 * notice — the fallback only, for places nobody sells entry to on this platform.
 *
 * Returns the lowest price among the ticket tiers. A hero reading “RM80” above
 * a child tier at RM33 would otherwise look like a mistake.
 */
export function getEntryPrice(
  entryFee: number | null,
  tickets: readonly PlaceProduct[],
): ResolvedEntryPrice {
  if (tickets.length === 0) return { price: entryFee, fromTicket: false };

  const lowest = Math.min(
    ...tickets.map(({ product }) => {
      const deltas = (product.variants ?? []).map(({ priceDelta }) => priceDelta);
      return product.price + (deltas.length > 0 ? Math.min(...deltas) : 0);
    }),
  );

  return { price: lowest, fromTicket: true };
}
