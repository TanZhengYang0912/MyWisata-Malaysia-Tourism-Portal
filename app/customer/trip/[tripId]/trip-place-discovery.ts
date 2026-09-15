import type { ComputedActivity, DiscoveryResult, SponsoredPlacement } from "@/backend/core/types";
import { canonicalCategorySlug } from "@/lib/customer/discovery-categories";
import { rankDiscoveryResults } from "@/lib/customer/discovery-ranking";
import { isOperatingHoursOpenNow } from "@/lib/customer/operating-hours";

export type TripPlacePriceBand = "all" | "free" | "under_25" | "25_50" | "50_100" | "100_plus";
export type TripPlaceSort = "recommended" | "popular" | "distance" | "price" | "rating" | "suggested_newest" | "suggested_oldest" | "name_asc" | "name_desc";

export type TripPlaceFilters = {
  query: string;
  category: string | null;
  priceBand: TripPlacePriceBand;
  minimumRating: number | null;
  openNow: boolean;
  distanceKm: 1 | 2 | 5 | null;
  sort: TripPlaceSort;
};

export const DEFAULT_TRIP_PLACE_FILTERS: TripPlaceFilters = {
  query: "",
  category: null,
  priceBand: "all",
  minimumRating: null,
  openNow: false,
  distanceKm: 5,
  sort: "recommended",
};

type SuggestionRow = {
  converted_vendor_id: string | null;
  created_at: string;
};

export function collapseSuggestedAtByVendor(rows: SuggestionRow[]): Record<string, string> {
  const earliest = new Map<string, { iso: string; timestamp: number }>();
  for (const row of rows) {
    const vendorId = row.converted_vendor_id?.trim();
    const timestamp = Date.parse(row.created_at);
    if (!vendorId || !Number.isFinite(timestamp)) continue;
    const current = earliest.get(vendorId);
    if (!current || timestamp < current.timestamp) earliest.set(vendorId, { iso: row.created_at, timestamp });
  }
  return Object.fromEntries([...earliest.entries()].map(([vendorId, value]) => [vendorId, value.iso]));
}

export function countActiveTripPlaceFilters(filters: TripPlaceFilters): number {
  return [
    Boolean(filters.query.trim()),
    Boolean(filters.category),
    filters.priceBand !== DEFAULT_TRIP_PLACE_FILTERS.priceBand,
    filters.minimumRating !== DEFAULT_TRIP_PLACE_FILTERS.minimumRating,
    filters.openNow !== DEFAULT_TRIP_PLACE_FILTERS.openNow,
    filters.distanceKm !== DEFAULT_TRIP_PLACE_FILTERS.distanceKm,
    filters.sort !== DEFAULT_TRIP_PLACE_FILTERS.sort,
  ].filter(Boolean).length;
}

function matchesQuery(activity: ComputedActivity, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [
    activity.name,
    activity.description,
    activity.outlet.vendorName,
    activity.outlet.name,
    activity.outlet.city,
    activity.outlet.state,
  ].some((value) => value?.toLocaleLowerCase().includes(normalized));
}

function matchesPrice(price: number, band: TripPlacePriceBand): boolean {
  switch (band) {
    case "free": return price === 0;
    case "under_25": return price > 0 && price < 25;
    case "25_50": return price >= 25 && price < 50;
    case "50_100": return price >= 50 && price < 100;
    case "100_plus": return price >= 100;
    default: return true;
  }
}

function popularity(activity: ComputedActivity): number {
  return Math.max(0, activity.rating) * Math.max(0, activity.reviews);
}

function nameOrder(left: ComputedActivity, right: ComputedActivity): number {
  return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
}

function popularOrder(left: ComputedActivity, right: ComputedActivity): number {
  return popularity(right) - popularity(left) || right.rating - left.rating || nameOrder(left, right);
}

function stableSort(
  activities: ComputedActivity[],
  compare: (left: ComputedActivity, right: ComputedActivity) => number,
): ComputedActivity[] {
  return activities
    .map((activity, index) => ({ activity, index }))
    .sort((left, right) => compare(left.activity, right.activity) || left.index - right.index)
    .map(({ activity }) => activity);
}

function suggestionOrder(
  direction: "newest" | "oldest",
  suggestedAtByVendor: Record<string, string>,
): (left: ComputedActivity, right: ComputedActivity) => number {
  return (left, right) => {
    const leftAt = Date.parse(suggestedAtByVendor[left.outlet.vendorId] ?? "");
    const rightAt = Date.parse(suggestedAtByVendor[right.outlet.vendorId] ?? "");
    const leftSuggested = Number.isFinite(leftAt);
    const rightSuggested = Number.isFinite(rightAt);
    if (leftSuggested !== rightSuggested) return leftSuggested ? -1 : 1;
    if (leftSuggested && rightSuggested && leftAt !== rightAt) return direction === "newest" ? rightAt - leftAt : leftAt - rightAt;
    return popularOrder(left, right);
  };
}

function sortOrganic(
  activities: ComputedActivity[],
  sort: TripPlaceSort,
  suggestedAtByVendor: Record<string, string>,
  hasOrigin: boolean,
): ComputedActivity[] {
  switch (sort) {
    case "distance":
      return stableSort(activities, hasOrigin
        ? (left, right) => (left.distanceKm ?? Number.POSITIVE_INFINITY) - (right.distanceKm ?? Number.POSITIVE_INFINITY) || popularOrder(left, right)
        : popularOrder);
    case "price": return stableSort(activities, (left, right) => left.price - right.price || nameOrder(left, right));
    case "rating": return stableSort(activities, (left, right) => right.rating - left.rating || right.reviews - left.reviews || nameOrder(left, right));
    case "suggested_newest": return stableSort(activities, suggestionOrder("newest", suggestedAtByVendor));
    case "suggested_oldest": return stableSort(activities, suggestionOrder("oldest", suggestedAtByVendor));
    case "name_asc": return stableSort(activities, nameOrder);
    case "name_desc": return stableSort(activities, (left, right) => nameOrder(right, left));
    default: return stableSort(activities, popularOrder);
  }
}

export function filterAndRankTripPlaces({
  activities,
  filters,
  hasOrigin,
  placements,
  suggestedAtByVendor,
  now,
}: {
  activities: ComputedActivity[];
  filters: TripPlaceFilters;
  hasOrigin: boolean;
  placements: SponsoredPlacement[];
  suggestedAtByVendor: Record<string, string>;
  now: string;
}): DiscoveryResult[] {
  const category = canonicalCategorySlug(filters.category);
  const currentTime = new Date(now);
  const matching = activities.filter((activity) => (
    matchesQuery(activity, filters.query)
    && (!category || canonicalCategorySlug(activity.categorySlug) === category)
    && matchesPrice(activity.price, filters.priceBand)
    && (filters.minimumRating === null || activity.rating >= filters.minimumRating)
    && (!filters.openNow || (activity.outlet.currentlyOpen ?? isOperatingHoursOpenNow(activity.outlet.operatingHours ?? null, currentTime)))
    && (!hasOrigin || filters.distanceKm === null || (activity.distanceKm ?? Number.POSITIVE_INFINITY) <= filters.distanceKm)
  ));

  if (filters.sort !== "recommended") {
    return sortOrganic(matching, filters.sort, suggestedAtByVendor, hasOrigin)
      .map((activity) => ({ ...activity, sponsorship: null }));
  }

  const states = [...new Set(matching.map((activity) => activity.outlet.state).filter(Boolean))];
  const categories = category
    ? [category]
    : [...new Set(matching.map((activity) => canonicalCategorySlug(activity.categorySlug)).filter((value): value is NonNullable<typeof value> => value !== null))];
  return rankDiscoveryResults({
    activities: matching,
    placements,
    filters: {
      q: filters.query,
      state: states.length === 1 ? states[0] : null,
      categories: categories.length === 1 ? categories : [],
      types: [],
      priceMax: null,
      operatingDays: [],
      hoursMode: "during",
      timeAt: null,
      timeFrom: null,
      timeTo: null,
      overnight: false,
      openNow: filters.openNow,
      freeOnly: filters.priceBand === "free",
      bookableOnly: false,
      hiddenGemOnly: false,
      familyFriendlyOnly: false,
      coupleFriendlyOnly: false,
    },
    now,
  });
}
