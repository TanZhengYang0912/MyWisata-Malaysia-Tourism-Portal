import { describe, expect, it, vi } from "vitest";

// places.ts (and the catalogue.ts functions it reuses) build the browser
// Supabase singleton at module scope, which needs env vars we don't have in
// unit tests. Every function under test takes an injected client, so the
// default export is never actually used here.
vi.mock("@/backend/supabase", () => ({ supabase: {} }));

const { getPlaceAccesses, getPlaceBySlug, getPlaceAncestors, getPlaceInformationalActivities, getPlaceProducts, getNearbyOutlets } = await import(
  "@/backend/domains/places"
);

/**
 * PostgREST stub that actually filters by eq()/in(), unlike a pure passthrough
 * — getPlaceAncestors walks the same "places" table by different ids on each
 * hop, so a stub that ignores the filter can't distinguish those calls.
 */
function makeDb(tables: Record<string, Record<string, unknown>[]>) {
  return {
    from(table: string) {
      let rows = tables[table] ?? [];
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          rows = rows.filter((row) => row[col] === val);
          return builder;
        },
        in: (col: string, vals: unknown[]) => {
          rows = rows.filter((row) => vals.includes(row[col]));
          return builder;
        },
        order: () => builder,
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
      };
      return builder;
    },
  } as never;
}

const STATE_ROW = {
  id: "state-1", parent_id: null, level: "state", name: "Penang", slug: "penang",
  tagline: null, intro: null, image_url: null, state: "Penang", district: null,
  lat: 5.4141, lng: 100.3288, entry_fee: null, managed_by_vendor_id: null, detail: null, status: "active",
};
const REGION_ROW = {
  id: "region-1", parent_id: "state-1", level: "region", name: "George Town", slug: "george-town",
  tagline: null, intro: null, image_url: null, state: "Penang", district: "George Town",
  lat: 5.4141, lng: 100.3288, entry_fee: null, managed_by_vendor_id: null, detail: null, status: "active",
};
const POI_ROW = {
  id: "poi-1", parent_id: "region-1", level: "poi", name: "Armenian Street Murals", slug: "armenian-street-murals",
  tagline: null, intro: null, image_url: "penang/chew-jetty.webp", state: "Penang", district: "George Town",
  lat: "5.4173", lng: "100.3390", entry_fee: "0.00", managed_by_vendor_id: null, detail: null, status: "active",
};

describe("getPlaceAncestors", () => {
  it("returns a root-first breadcrumb: state, region, poi", async () => {
    const db = makeDb({ places: [STATE_ROW, REGION_ROW, POI_ROW] });

    const chain = await getPlaceAncestors("armenian-street-murals", db);

    expect(chain.map((p) => p.slug)).toEqual(["penang", "george-town", "armenian-street-murals"]);
  });

  it("terminates on a parent_id cycle instead of looping forever", async () => {
    const CYCLE_A = { ...POI_ROW, id: "a", slug: "a", parent_id: "b", level: "poi" };
    const CYCLE_B = { ...POI_ROW, id: "b", slug: "b", parent_id: "a", level: "poi" };
    const db = makeDb({ places: [CYCLE_A, CYCLE_B] });

    const chain = await getPlaceAncestors("a", db);

    // 1 starting node + at most 10 hops, never unbounded.
    expect(chain.length).toBeLessThanOrEqual(11);
    expect(chain.length).toBeGreaterThan(1);
  });
});

describe("getPlaceBySlug", () => {
  it("coerces NUMERIC lat/lng/entry_fee strings to numbers", async () => {
    const db = makeDb({ places: [POI_ROW] });

    const place = await getPlaceBySlug("armenian-street-murals", db);

    expect(place?.lat).toBe(5.4173);
    expect(place?.lng).toBe(100.339);
    expect(place?.entryFee).toBe(0);
    expect(typeof place?.lat).toBe("number");
    expect(typeof place?.entryFee).toBe("number");
  });

  it("resolves a bucket-relative image_url to a Storage public URL", async () => {
    const db = makeDb({ places: [POI_ROW] });

    const place = await getPlaceBySlug("armenian-street-murals", db);

    expect(place?.imageUrl).toContain("/place-images/penang/chew-jetty.webp");
  });

  it("returns null for an unknown slug", async () => {
    const db = makeDb({ places: [] });

    expect(await getPlaceBySlug("nowhere", db)).toBeNull();
  });
});

const BASE_PRODUCT_ROW = {
  id: "p1", outlet_id: null, name: "Monkey Beach Guided Trek", description: null, cover_url: null,
  base_price: 45, requires_booking: true, status: "active", review_status: "approved", tags: null,
  created_at: "2026-01-01T00:00:00Z", attributes: null, is_hidden_gem: false, type_slugs: null,
  is_family_friendly: false, is_couple_friendly: false, place_state: null, place_district: null,
  place_lat: null, place_lng: null, categories: null, outlet_offers: [], product_variants: [], price_rules: [],
};
const VENDOR_ROW = { id: "v1", name: "Monkey Beach Adventures", status: "approved", logo_url: null, cover_url: null, outlets: [] };

describe("getPlaceProducts", () => {
  it("returns [] when the place has no linked products", async () => {
    const db = makeDb({ product_places: [] });

    expect(await getPlaceProducts("poi-1", db)).toEqual([]);
  });

  it("joins the product, its vendor, and the relation type", async () => {
    const db = makeDb({
      product_places: [{ product_id: "p1", place_id: "poi-1", relation_type: "guide_service", products: { vendor_id: "v1" } }],
      products: [BASE_PRODUCT_ROW],
      product_review_metrics: [],
      vendors: [VENDOR_ROW],
    });

    const result = await getPlaceProducts("poi-1", db);

    expect(result).toHaveLength(1);
    expect(result[0].product.id).toBe("p1");
    expect(result[0].vendor.id).toBe("v1");
    expect(result[0].relation).toBe("guide_service");
  });
});

describe("getPlaceAccesses", () => {
  it("returns only active source-backed public access without a vendor or checkout relation", async () => {
    const db = makeDb({
      place_accesses: [
        {
          id: "access-1", place_id: "poi-1", slug: "dataran-merdeka-public-access",
          title: "Explore Dataran Merdeka", description: "Explore the historic square at your own pace.",
          access_type: "free_public_access", source_title: "Tourism Malaysia",
          source_url: "https://www.malaysia.travel/explore/top-places-to-visit-in-kuala-lumpur",
          image_source_url: null, image_path: "activity-media/dataran-merdeka-public-access.webp", status: "active",
        },
        { id: "access-2", place_id: "poi-1", slug: "hidden", title: "Hidden", description: "", access_type: "free_activity", source_title: "Source", source_url: "https://example.com", image_source_url: null, image_path: null, status: "hidden" },
      ],
    });

    await expect(getPlaceAccesses("poi-1", db)).resolves.toEqual([
      expect.objectContaining({
        id: "access-1",
        placeId: "poi-1",
        accessType: "free_public_access",
        sourceUrl: "https://www.malaysia.travel/explore/top-places-to-visit-in-kuala-lumpur",
        imageUrl: expect.stringContaining("/place-images/activity-media/dataran-merdeka-public-access.webp"),
      }),
    ]);
  });
});

describe("getPlaceInformationalActivities", () => {
  it("returns active official attraction information without a vendor checkout relation", async () => {
    const db = makeDb({
      place_informational_activities: [
        {
          id: "info-1", place_id: "poi-1", slug: "petronas-skybridge",
          title: "Visit the PETRONAS Skybridge", description: "See the city.",
          activity_type: "informational_paid_activity", price_label: "Ticket required",
          source_title: "Tourism Malaysia", source_url: "https://www.malaysia.travel/explore/petronas-twin-tower",
          image_source_url: null, image_path: "activity-media/petronas-skybridge.webp", status: "active",
        },
        { id: "info-2", place_id: "poi-1", slug: "hidden", title: "Hidden", description: "", activity_type: "informational_paid_activity", price_label: "Ticket required", source_title: "Source", source_url: "https://example.com", image_source_url: null, image_path: null, status: "hidden" },
      ],
    });

    await expect(getPlaceInformationalActivities("poi-1", db)).resolves.toEqual([
      expect.objectContaining({
        id: "info-1",
        placeId: "poi-1",
        activityType: "informational_paid_activity",
        priceLabel: "Ticket required",
        imageUrl: expect.stringContaining("/place-images/activity-media/petronas-skybridge.webp"),
      }),
    ]);
  });
});

const OUTLET_ROW_BASE = {
  vendor_id: "v1", address: null, city: "George Town", state: "Penang", operating_hours: null, phone: null,
  status: "active", review_status: "approved", wheelchair_accessible: null, pet_friendly: null, vendors: { name: "Test vendor", status: "approved" }, products: null,
};

describe("getNearbyOutlets", () => {
  it("returns outlets within the radius, nearest first, excluding anything further", async () => {
    const origin = { lat: 5.4173, lng: 100.339 };
    const closeOutlet = { ...OUTLET_ROW_BASE, id: "o-close", name: "Close outlet", lat: 5.4174, lng: 100.339 };
    const nearbyOutlet = { ...OUTLET_ROW_BASE, id: "o-nearby", name: "Nearby outlet", lat: 5.46, lng: 100.34 };
    const farOutlet = { ...OUTLET_ROW_BASE, id: "o-far", name: "Far outlet", lat: 6.5, lng: 101.5 };
    const db = makeDb({ outlets: [farOutlet, nearbyOutlet, closeOutlet] });

    const results = await getNearbyOutlets(origin, 10, db);

    expect(results.map((r) => r.outlet.id)).toEqual(["o-close", "o-nearby"]);
    expect(results[0].km).toBeLessThan(results[1].km);
    expect(results[1].km).toBeLessThanOrEqual(10);
  });
});
