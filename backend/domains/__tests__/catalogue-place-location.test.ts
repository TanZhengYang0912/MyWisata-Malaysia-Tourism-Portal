import { describe, expect, it, vi } from "vitest";

// catalogue.ts builds the browser Supabase singleton at module scope, which
// needs env vars we don't have in unit tests. Every function under test takes
// an injected client, so the default export is never actually used here.
vi.mock("@/backend/supabase", () => ({ supabase: {} }));

const { getActivities, getComputedActivity } = await import("@/backend/domains/catalogue");

const BASE_PRODUCT_ROW = {
  id: "p1",
  outlet_id: "o1",
  name: "Test product",
  description: null,
  cover_url: null,
  base_price: 10,
  requires_booking: false,
  status: "active",
  review_status: "approved",
  tags: null,
  created_at: "2026-01-01T00:00:00Z",
  attributes: null,
  is_hidden_gem: false,
  type_slugs: null,
  is_family_friendly: false,
  is_couple_friendly: false,
  place_state: null,
  place_district: null,
  place_lat: null,
  place_lng: null,
  categories: null,
  outlet_offers: [],
  product_variants: [],
  price_rules: [],
};

const OUTLET_ROW = {
  id: "o1",
  vendor_id: "v1",
  name: "Provider outlet",
  address: null,
  city: "Kota Kinabalu",
  state: "Sabah",
  lat: 5.98,
  lng: 116.07,
  operating_hours: null,
  phone: null,
  status: "active",
  wheelchair_accessible: null,
  pet_friendly: null,
  vendors: { name: "Test vendor", status: "approved" },
  products: null,
};

/** Minimal PostgREST stub: replays canned rows per table, no filtering. */
function makeDb(tables: Record<string, unknown[]>) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
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

describe("Activity.place", () => {
  it("maps a complete place location, coercing NUMERIC strings to numbers", async () => {
    const db = makeDb({
      products: [{
        ...BASE_PRODUCT_ROW,
        place_state: "Sabah",
        place_district: "Kinabatangan",
        place_lat: "5.53", // PostgREST serialises NUMERIC as a string
        place_lng: "118.32",
      }],
      product_review_metrics: [],
    });

    const [activity] = await getActivities(db);

    expect(activity.place).toEqual({ state: "Sabah", district: "Kinabatangan", lat: 5.53, lng: 118.32 });
    expect(typeof activity.place?.lat).toBe("number");
    expect(typeof activity.place?.lng).toBe("number");
  });

  it("omits district when the state has no district tier, without dropping the rest", async () => {
    const db = makeDb({
      products: [{ ...BASE_PRODUCT_ROW, place_state: "Kuala Lumpur", place_district: null, place_lat: 3.1478, place_lng: 101.6935 }],
      product_review_metrics: [],
    });

    const [activity] = await getActivities(db);

    expect(activity.place).toEqual({ state: "Kuala Lumpur", district: undefined, lat: 3.1478, lng: 101.6935 });
  });

  it("leaves place undefined when no place fields are set", async () => {
    const db = makeDb({ products: [BASE_PRODUCT_ROW], product_review_metrics: [] });

    const [activity] = await getActivities(db);

    expect(activity.place).toBeUndefined();
  });

  it("leaves place undefined on a partial row instead of plotting a half-built coordinate", async () => {
    // The DB CHECK constraint should never let this happen, but mapActivity()
    // doesn't trust that alone — a row with only lat set must not produce
    // {lat, lng: undefined} and silently render at the map's origin.
    const db = makeDb({
      products: [{ ...BASE_PRODUCT_ROW, place_state: "Sabah", place_lat: 5.53, place_lng: null }],
      product_review_metrics: [],
    });

    const [activity] = await getActivities(db);

    expect(activity.place).toBeUndefined();
  });

  it("keeps the place coordinate independent of the outlet's own coordinate", async () => {
    // Penang National Park Monkey Beach Trek's real shape: the provider
    // outlet sits in Kota Kinabalu, Sabah, but the product's place is in
    // Kinabatangan — a different district entirely. If toComputed() ever
    // started overwriting `place` with the chosen outlet, this would catch it.
    const db = makeDb({
      products: [{ ...BASE_PRODUCT_ROW, place_state: "Sabah", place_district: "Kinabatangan", place_lat: 5.53, place_lng: 118.32 }],
      product_review_metrics: [],
      outlets: [OUTLET_ROW],
    });

    const computed = await getComputedActivity("p1", undefined, db);

    expect(computed?.outlet.city).toBe("Kota Kinabalu");
    expect(computed?.place).toEqual({ state: "Sabah", district: "Kinabatangan", lat: 5.53, lng: 118.32 });
    expect(computed?.place?.district).not.toBe(computed?.outlet.city);
  });

  it("does not disturb existing multi-outlet offer behaviour", async () => {
    // A shared product with no place location still picks the cheapest offer
    // exactly as before — place is additive, not a replacement code path.
    const db = makeDb({
      products: [{
        ...BASE_PRODUCT_ROW,
        outlet_id: null,
        outlet_offers: [
          { outlet_id: "o1", price: 120, status: "active" },
          { outlet_id: "o2", price: 90, status: "active" },
        ],
      }],
      product_review_metrics: [],
    });

    const [activity] = await getActivities(db);

    expect(activity.price).toBe(90);
    expect(activity.offers).toHaveLength(2);
    expect(activity.place).toBeUndefined();
  });
});
