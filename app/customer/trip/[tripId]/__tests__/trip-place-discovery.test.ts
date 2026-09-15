import { describe, expect, it } from "vitest";
import type { ComputedActivity, SponsoredPlacement } from "@/backend/core/types";
import {
  DEFAULT_TRIP_PLACE_FILTERS,
  collapseSuggestedAtByVendor,
  countActiveTripPlaceFilters,
  filterAndRankTripPlaces,
  type TripPlaceSort,
} from "../trip-place-discovery";

function activity(id: string, overrides: Partial<ComputedActivity> = {}): ComputedActivity {
  return {
    id,
    outletId: `${id}-outlet`,
    name: id,
    category: "Activities",
    description: `${id} description`,
    image: null,
    price: 50,
    rating: 4,
    reviews: 10,
    duration: "1 hour",
    requiresBooking: false,
    variants: [],
    categorySlug: "activity",
    createdAt: "2026-01-01T00:00:00.000Z",
    outlet: {
      id: `${id}-outlet`,
      vendorId: `${id}-vendor`,
      vendorName: `${id} vendor`,
      name: `${id} outlet`,
      category: "Activities",
      state: "Penang",
      city: "George Town",
      address: "",
      lat: 5.4141,
      lng: 100.3288,
      hours: "",
      currentlyOpen: true,
      verified: true,
      open: true,
      rating: 4,
      reviews: 10,
    },
    distanceKm: 1,
    ...overrides,
  };
}

function placement(productId: string): SponsoredPlacement {
  return {
    id: `${productId}-placement`,
    productId,
    state: "Penang",
    categorySlug: "activity",
    startsAt: "2026-09-01T00:00:00.000Z",
    endsAt: "2026-10-01T00:00:00.000Z",
    priority: 1,
    status: "approved",
  };
}

describe("trip place discovery", () => {
  it("collapses converted suggestions to the earliest valid timestamp per vendor", () => {
    expect(collapseSuggestedAtByVendor([
      { converted_vendor_id: "vendor-a", created_at: "2026-09-10T00:00:00.000Z" },
      { converted_vendor_id: "vendor-a", created_at: "2026-09-01T00:00:00.000Z" },
      { converted_vendor_id: "vendor-b", created_at: "invalid" },
      { converted_vendor_id: null, created_at: "2026-09-02T00:00:00.000Z" },
    ])).toEqual({ "vendor-a": "2026-09-01T00:00:00.000Z" });
  });

  it("filters search, category, price, rating, open-now, and distance before sorting", () => {
    const matching = activity("matching", { name: "Penang Hill", price: 35, rating: 4.6, distanceKm: 1.8 });
    const results = filterAndRankTripPlaces({
      activities: [
        matching,
        activity("too-far", { name: "Penang Beach", price: 35, rating: 4.6, distanceKm: 3 }),
        activity("too-cheap", { name: "Penang Free", price: 0, rating: 4.6, distanceKm: 1 }),
        activity("closed", { name: "Penang Closed", price: 35, rating: 4.6, distanceKm: 1, outlet: { ...matching.outlet, id: "closed-outlet", currentlyOpen: false } }),
      ],
      filters: {
        ...DEFAULT_TRIP_PLACE_FILTERS,
        query: "penang",
        category: "activity",
        priceBand: "25_50",
        minimumRating: 4.5,
        openNow: true,
        distanceKm: 2,
        sort: "rating",
      },
      hasOrigin: true,
      placements: [],
      suggestedAtByVendor: {},
      now: "2026-09-15T12:00:00.000Z",
    });

    expect(results.map((item) => item.id)).toEqual(["matching"]);
  });

  it("supports organic popularity and suggestion ordering with unsuggested vendors last", () => {
    const popular = activity("popular", { rating: 4.4, reviews: 100, outlet: { ...activity("x").outlet, vendorId: "organic-vendor" } });
    const oldSuggestion = activity("old-suggestion", { rating: 4.8, reviews: 5, outlet: { ...activity("y").outlet, vendorId: "old-vendor" } });
    const newSuggestion = activity("new-suggestion", { rating: 4.1, reviews: 5, outlet: { ...activity("z").outlet, vendorId: "new-vendor" } });
    const base = {
      activities: [oldSuggestion, popular, newSuggestion],
      hasOrigin: true,
      placements: [] as SponsoredPlacement[],
      suggestedAtByVendor: {
        "old-vendor": "2026-01-01T00:00:00.000Z",
        "new-vendor": "2026-09-01T00:00:00.000Z",
      },
      now: "2026-09-15T12:00:00.000Z",
    };

    expect(filterAndRankTripPlaces({ ...base, filters: { ...DEFAULT_TRIP_PLACE_FILTERS, distanceKm: null, sort: "popular" } }).map((item) => item.id))
      .toEqual(["popular", "old-suggestion", "new-suggestion"]);
    expect(filterAndRankTripPlaces({ ...base, filters: { ...DEFAULT_TRIP_PLACE_FILTERS, distanceKm: null, sort: "suggested_newest" } }).map((item) => item.id))
      .toEqual(["new-suggestion", "old-suggestion", "popular"]);
    expect(filterAndRankTripPlaces({ ...base, filters: { ...DEFAULT_TRIP_PLACE_FILTERS, distanceKm: null, sort: "suggested_oldest" } }).map((item) => item.id))
      .toEqual(["old-suggestion", "new-suggestion", "popular"]);
  });

  it.each([
    ["free", ["free"]],
    ["under_25", ["low"]],
    ["25_50", ["medium"]],
    ["50_100", ["high"]],
    ["100_plus", ["premium"]],
  ] as const)("applies the %s price band without overlapping its boundaries", (priceBand, expected) => {
    const activities = [
      activity("free", { price: 0 }),
      activity("low", { price: 24.99 }),
      activity("medium", { price: 25 }),
      activity("high", { price: 50 }),
      activity("premium", { price: 100 }),
    ];
    expect(filterAndRankTripPlaces({
      activities,
      filters: { ...DEFAULT_TRIP_PLACE_FILTERS, distanceKm: null, priceBand },
      hasOrigin: true,
      placements: [],
      suggestedAtByVendor: {},
      now: "2026-09-15T12:00:00.000Z",
    }).map((item) => item.id)).toEqual(expected);
  });

  it("supports distance, price, rating, and both alphabetical organic sorts", () => {
    const activities = [
      activity("charlie", { name: "Charlie", price: 80, rating: 4.2, reviews: 100, distanceKm: 3 }),
      activity("alpha", { name: "Alpha", price: 20, rating: 4.9, reviews: 3, distanceKm: 2 }),
      activity("bravo", { name: "Bravo", price: 40, rating: 4.5, reviews: 20, distanceKm: 1 }),
    ];
    const rank = (sort: TripPlaceSort, hasOrigin = true) => filterAndRankTripPlaces({
      activities,
      filters: { ...DEFAULT_TRIP_PLACE_FILTERS, distanceKm: null, sort },
      hasOrigin,
      placements: [],
      suggestedAtByVendor: {},
      now: "2026-09-15T12:00:00.000Z",
    }).map((item) => item.id);

    expect(rank("distance")).toEqual(["bravo", "alpha", "charlie"]);
    expect(rank("price")).toEqual(["alpha", "bravo", "charlie"]);
    expect(rank("rating")).toEqual(["alpha", "bravo", "charlie"]);
    expect(rank("name_asc")).toEqual(["alpha", "bravo", "charlie"]);
    expect(rank("name_desc")).toEqual(["charlie", "bravo", "alpha"]);
    expect(rank("distance", false)).toEqual(["charlie", "bravo", "alpha"]);
  });

  it("ignores a selected distance when the trip has no valid origin", () => {
    expect(filterAndRankTripPlaces({
      activities: [activity("near", { distanceKm: 1 }), activity("far", { distanceKm: 20 })],
      filters: { ...DEFAULT_TRIP_PLACE_FILTERS, distanceKm: 1 },
      hasOrigin: false,
      placements: [],
      suggestedAtByVendor: {},
      now: "2026-09-15T12:00:00.000Z",
    }).map((item) => item.id).sort()).toEqual(["far", "near"]);
  });

  it("injects transparent paid placement only for Recommended", () => {
    const paid = activity("paid", { rating: 1, reviews: 1 });
    const popular = activity("popular", { rating: 5, reviews: 100 });
    const base = {
      activities: [popular, paid],
      hasOrigin: true,
      placements: [placement("paid")],
      suggestedAtByVendor: {},
      now: "2026-09-15T12:00:00.000Z",
    };

    const recommended = filterAndRankTripPlaces({ ...base, filters: DEFAULT_TRIP_PLACE_FILTERS });
    expect(recommended.map((item) => item.id)).toEqual(["paid", "popular"]);
    expect(recommended[0].sponsorship).toEqual({ placementId: "paid-placement", label: "Sponsored" });

    const organic = filterAndRankTripPlaces({ ...base, filters: { ...DEFAULT_TRIP_PLACE_FILTERS, sort: "popular" } });
    expect(organic.map((item) => item.id)).toEqual(["popular", "paid"]);
    expect(organic.every((item) => item.sponsorship === null)).toBe(true);
  });

  it("counts visible and advanced deviations from the default filter state", () => {
    expect(countActiveTripPlaceFilters(DEFAULT_TRIP_PLACE_FILTERS)).toBe(0);
    expect(countActiveTripPlaceFilters({
      ...DEFAULT_TRIP_PLACE_FILTERS,
      query: "food",
      category: "food",
      openNow: true,
      distanceKm: 1,
      sort: "distance",
    })).toBe(5);
  });
});
