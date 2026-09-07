import { describe, expect, it, vi } from "vitest";

// catalogue.ts builds the browser Supabase singleton at module scope, which
// needs env vars we don't have in unit tests. Every function under test takes
// an injected client, so the default export is never actually used here.
vi.mock("@/backend/supabase", () => ({ supabase: {} }));

const { searchActivities } = await import("@/backend/domains/catalogue");

const OUTLET_FIELDS = {
  address: null,
  operating_hours: null,
  phone: null,
  wheelchair_accessible: null,
  pet_friendly: null,
  vendors: { name: "Test vendor", status: "approved", products: null },
};

const PRODUCTS = [
  {
    id: "free-bookable",
    outlet_id: "outlet-penang",
    name: "Free bookable experience",
    description: null,
    cover_url: null,
    base_price: 0,
    requires_booking: true,
    status: "active",
    review_status: "approved",
    tags: null,
    created_at: "2026-01-01T00:00:00Z",
    attributes: null,
    is_hidden_gem: true,
    type_slugs: ["nature"],
    is_family_friendly: true,
    is_couple_friendly: false,
    place_state: null,
    place_district: null,
    place_lat: null,
    place_lng: null,
    categories: { name: "Activity", slug: "activity" },
    outlet_offers: [],
    product_variants: [],
    price_rules: [],
  },
  {
    id: "paid-bookable",
    outlet_id: "outlet-johor",
    name: "Paid bookable experience",
    description: null,
    cover_url: null,
    base_price: 80,
    requires_booking: true,
    status: "active",
    review_status: "approved",
    tags: null,
    created_at: "2026-01-02T00:00:00Z",
    attributes: null,
    is_hidden_gem: false,
    type_slugs: ["seafood"],
    is_family_friendly: false,
    is_couple_friendly: true,
    place_state: null,
    place_district: null,
    place_lat: null,
    place_lng: null,
    categories: { name: "Food", slug: "food" },
    outlet_offers: [],
    product_variants: [],
    price_rules: [],
  },
  {
    id: "sabah-place",
    outlet_id: "outlet-kuala-lumpur",
    name: "Sabah place experience",
    description: null,
    cover_url: null,
    base_price: 120,
    requires_booking: false,
    status: "active",
    review_status: "approved",
    tags: null,
    created_at: "2026-01-03T00:00:00Z",
    attributes: null,
    is_hidden_gem: false,
    type_slugs: ["adventure"],
    is_family_friendly: true,
    is_couple_friendly: false,
    place_state: "Sabah",
    place_district: "Kinabatangan",
    place_lat: 5.53,
    place_lng: 118.32,
    categories: { name: "Activity", slug: "activity" },
    outlet_offers: [],
    product_variants: [],
    price_rules: [],
  },
  {
    id: "sabah-outlet",
    outlet_id: "outlet-sabah",
    name: "Sabah outlet experience",
    description: null,
    cover_url: null,
    base_price: 40,
    requires_booking: false,
    status: "active",
    review_status: "approved",
    tags: null,
    created_at: "2026-01-04T00:00:00Z",
    attributes: null,
    is_hidden_gem: false,
    type_slugs: null,
    is_family_friendly: false,
    is_couple_friendly: false,
    place_state: null,
    place_district: null,
    place_lat: null,
    place_lng: null,
    categories: { name: "Activity", slug: "activity" },
    outlet_offers: [],
    product_variants: [],
    price_rules: [],
  },
];

const OUTLETS = [
  { ...OUTLET_FIELDS, id: "outlet-penang", vendor_id: "vendor-1", name: "Penang outlet", city: "George Town", state: "Penang", lat: 5.41, lng: 100.33, status: "active" },
  { ...OUTLET_FIELDS, id: "outlet-johor", vendor_id: "vendor-1", name: "Johor outlet", city: "Johor Bahru", state: "Johor", lat: 1.49, lng: 103.74, status: "active" },
  { ...OUTLET_FIELDS, id: "outlet-kuala-lumpur", vendor_id: "vendor-1", name: "Kuala Lumpur outlet", city: "Kuala Lumpur", state: "Kuala Lumpur", lat: 3.14, lng: 101.69, status: "active" },
  { ...OUTLET_FIELDS, id: "outlet-sabah", vendor_id: "vendor-1", name: "Sabah outlet", city: "Kota Kinabalu", state: "Sabah", lat: 5.98, lng: 116.07, status: "active" },
];

/** Minimal PostgREST stub: replays canned rows per table, no filtering. */
function makeDb() {
  return {
    from(table: string) {
      const rows = table === "products" ? PRODUCTS : table === "outlets" ? OUTLETS : [];
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        in: () => builder,
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: rows, error: null }),
      };
      return builder;
    },
  } as never;
}

describe("searchActivities discovery filters", () => {
  it("keeps only free activities", async () => {
    expect((await searchActivities({ freeOnly: true }, makeDb())).map((item) => item.id)).toEqual(["free-bookable"]);
  });

  it("keeps only activities that require booking", async () => {
    expect((await searchActivities({ bookableOnly: true }, makeDb())).map((item) => item.id)).toEqual(["free-bookable", "paid-bookable"]);
  });

  it("matches a place-bound activity by its place state before its provider outlet", async () => {
    expect((await searchActivities({ state: "Sabah" }, makeDb())).map((item) => item.id)).toEqual(["sabah-place", "sabah-outlet"]);
  });

  it("keeps category branches and their type selections with OR semantics", async () => {
    expect((await searchActivities({ categories: ["activity", "food"], types: ["activity:nature", "food:seafood"] }, makeDb())).map((item) => item.id))
      .toEqual(["free-bookable", "paid-bookable"]);
  });

  it("combines the category branch with the StoryMap badge OR group", async () => {
    expect((await searchActivities({ categories: ["activity"], types: ["activity:nature", "activity:adventure"], familyFriendlyOnly: true, coupleFriendlyOnly: true }, makeDb())).map((item) => item.id))
      .toEqual(["free-bookable", "sabah-place"]);
  });
});
