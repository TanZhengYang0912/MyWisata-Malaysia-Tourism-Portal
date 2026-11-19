import { beforeEach, describe, expect, it, vi } from "vitest";

const cacheState = vi.hoisted(() => ({
  db: null as unknown,
  entries: [] as { keyParts: string[]; args: unknown[]; value: unknown; serializedLength: number }[],
}));

vi.mock("next/cache", () => ({
  unstable_cache: (
    fetchData: (...args: unknown[]) => Promise<unknown>,
    keyParts: string[] = [],
    options: { revalidate?: number } = {},
  ) =>
    async (...args: unknown[]) => {
      const value = await fetchData(...args);
      const serializedLength = JSON.stringify({
        kind: "FETCH",
        data: { headers: {}, body: JSON.stringify(value), status: 200, url: "" },
        revalidate: options.revalidate ?? 60,
      }).length;
      cacheState.entries.push({ keyParts, args, value, serializedLength });
      if (serializedLength > 2 * 1024 * 1024) {
        throw new Error(`cache item exceeds Next.js 2 MiB limit: ${serializedLength} characters`);
      }
      return value;
    },
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => cacheState.db,
}));

vi.mock("@/backend/supabase", () => ({ supabase: {} }));

const { getCachedComputedActivities } = await import("@/lib/cache/catalogue-cache");

function makeDb(products: unknown[], metrics: unknown[], outlets: unknown[]) {
  const tables: Record<string, unknown[]> = {
    products,
    product_review_metrics: metrics,
    outlets,
  };

  return {
    from(table: string) {
      let rows = tables[table] ?? [];
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        range: (from: number, to: number) => {
          if (table === "products") rows = rows.slice(from, to + 1);
          return builder;
        },
        in: (column: string, values: string[]) => {
          rows = (tables[table] ?? []).filter((row) => values.includes((row as Record<string, string>)[column]));
          return builder;
        },
        then: (resolve: (result: { data: unknown[]; error: null }) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(resolve),
      };
      return builder;
    },
  };
}

describe("getCachedComputedActivities cache boundaries", () => {
  beforeEach(() => {
    cacheState.entries = [];
  });

  it("keeps product and shared outlet cache entries below Next.js's exact size limit", async () => {
    const products = Array.from({ length: 1000 }, (_, index) => ({
      id: `product-${index}`,
      vendor_id: "vendor-1",
      outlet_id: index === 0 ? null : `outlet-${index % 250}`,
      outlet_offers: index === 0 ? [
        { outlet_id: "outlet-0", price: 15, status: "active" },
        { outlet_id: "outlet-1", price: 10, status: "active" },
      ] : [],
      name: `Product ${index}`,
      description: "A locally guided discovery listing with clear meeting details, accessible travel advice and flexible visit planning. ".repeat(10),
      cover_url: null,
      base_price: 12,
      requires_booking: false,
      status: "active",
      review_status: "approved",
      tags: [],
      created_at: "2026-10-01T00:00:00.000Z",
      attributes: null,
      is_hidden_gem: false,
      type_slugs: ["nature"],
      is_family_friendly: false,
      is_couple_friendly: false,
      place_state: null,
      place_district: null,
      place_lat: null,
      place_lng: null,
      categories: { name: "Activity", slug: "activity" },
    }));
    const periods = [
      { open: "06:00", close: "09:00" },
      { open: "10:00", close: "13:00" },
      { open: "14:00", close: "18:00" },
    ];
    const operatingHours = Object.fromEntries(
      ["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day) => [day, { periods }]),
    );
    const outlets = Array.from({ length: 250 }, (_, index) => ({
      id: `outlet-${index}`,
      vendor_id: "vendor-1",
      name: `Discovery outlet ${index}`,
      city: "Kuala Lumpur",
      state: "Kuala Lumpur",
      lat: 3.139,
      lng: 101.6869,
      operating_hours: operatingHours,
      status: "active",
      wheelchair_accessible: null,
      pet_friendly: null,
      food_service_modes: ["dine_in"],
      badge_slugs: [],
      accommodation_type_slugs: [],
      vendors: { name: "Demo Vendor", slug: "demo-vendor", status: "approved" },
    }));
    cacheState.db = makeDb(
      products,
      [
        { product_id: "product-0", rating: "4.5", reviews: "2" },
        { product_id: "product-1", rating: "5", reviews: "4" },
      ],
      outlets,
    );

    const result = await getCachedComputedActivities();
    const oldComputedShapeLength = JSON.stringify({
      kind: "FETCH",
      data: { headers: {}, body: JSON.stringify(result), status: 200, url: "" },
      revalidate: 60,
    }).length;

    expect(oldComputedShapeLength).toBeGreaterThan(2 * 1024 * 1024);
    expect(result).toHaveLength(1000);
    expect(result[0]).toMatchObject({ id: "product-1", rating: 5, reviews: 4, outlet: { id: "outlet-1" } });
    expect(result[1]).toMatchObject({
      id: "product-0",
      outletId: "outlet-1",
      price: 10,
      rating: 4.5,
      reviews: 2,
      outlet: { id: "outlet-1" },
    });
    expect(result[2]).toMatchObject({ id: "product-2", rating: 0, reviews: 0, outlet: { id: "outlet-2" } });
    expect(cacheState.entries).toHaveLength(2);
    expect(cacheState.entries.every((entry) => entry.serializedLength <= 2 * 1024 * 1024)).toBe(true);
    const cachedActivities = cacheState.entries.find((entry) => Array.isArray(entry.value))?.value as unknown[];
    const cachedRelatedData = cacheState.entries.find((entry) => !Array.isArray(entry.value))?.value as {
      metrics: unknown[];
      outlets: unknown[];
    };
    expect(cachedActivities).toHaveLength(1000);
    expect(cachedRelatedData.metrics).toEqual([
      { productId: "product-0", rating: 4.5, reviews: 2 },
      { productId: "product-1", rating: 5, reviews: 4 },
    ]);
    expect(cachedRelatedData.outlets).toHaveLength(250);
    expect(cachedRelatedData.outlets).toContainEqual(expect.objectContaining({ id: "outlet-0" }));
  });
});

describe("public Home reads", () => {
  it("throws a failed read so the cache does not keep it, and returns the rows otherwise", async () => {
    const { getCachedPublicPromotionCampaigns } = await import("@/lib/cache/catalogue-cache");
    cacheState.db = { rpc: async () => ({ data: null, error: { message: "boom" } }) };
    await expect(getCachedPublicPromotionCampaigns()).rejects.toMatchObject({ message: "boom" });

    cacheState.db = { rpc: async (name: string, args: unknown) => ({ data: [{ name, args }], error: null }) };
    await expect(getCachedPublicPromotionCampaigns()).resolves.toEqual([{ name: "get_public_promotion_campaigns", args: { p_slug: null } }]);
  });

  it("stores outlet ratings as plain entries that survive cache serialisation", async () => {
    const { getCachedOutletRatings } = await import("@/lib/cache/catalogue-cache");
    const rows = [{ scope_id: "o1", rating: 5, review_count: 3 }];
    const builder: Record<string, unknown> = {
      select: () => builder, eq: () => builder, in: () => builder,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    cacheState.db = { from: () => builder };

    const entries = await getCachedOutletRatings(["o1"]);

    expect(JSON.parse(JSON.stringify(entries))).toEqual(entries);
    expect(new Map(entries).get("o1")).toEqual({ value: 5, count: 3 });
  });

  it("stores vendor ratings as plain entries that survive cache serialisation", async () => {
    const { getCachedVendorRatings } = await import("@/lib/cache/catalogue-cache");
    const rows = [{ scope_id: "v1", rating: 4, review_count: 2 }];
    const builder: Record<string, unknown> = {
      select: () => builder, eq: () => builder, in: () => builder,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
    };
    cacheState.db = { from: () => builder };

    const entries = await getCachedVendorRatings(["v1"]);

    expect(JSON.parse(JSON.stringify(entries))).toEqual(entries);
    expect(new Map(entries).get("v1")).toMatchObject({ count: expect.any(Number) });
  });
});

const VENDOR_ID = "11111111-1111-4111-8111-111111111111";
const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";

type Call = { table: string; method: string; args: unknown[] };

/** A recording Supabase fake: lists for awaited queries, single rows for maybeSingle(), and an optional failing table. */
function recordingDb(options: { rows?: Record<string, unknown[]>; single?: Record<string, unknown>; failTable?: string }) {
  const calls: Call[] = [];
  const db = {
    from(table: string) {
      const result = () => table === options.failTable
        ? { data: null, error: { message: `${table} failed` }, count: null }
        : { data: options.rows?.[table] ?? [], error: null, count: (options.rows?.[table] ?? []).length };
      const builder: Record<string, unknown> = {};
      for (const method of ["select", "eq", "is", "in", "order", "range", "limit"]) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ table, method, args });
          return builder;
        };
      }
      builder.maybeSingle = async () => table === options.failTable
        ? { data: null, error: { message: `${table} failed` } }
        : { data: options.single?.[table] ?? null, error: null };
      builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve);
      return builder;
    },
  };
  return { db, calls };
}

function filtersOn(calls: Call[], table: string) {
  return calls.filter((call) => call.table === table && call.method !== "select").map((call) => [call.method, ...call.args]);
}

describe("public vendor page cache", () => {
  beforeEach(() => {
    cacheState.entries = [];
  });

  it("reads only guest-visible rows and stores them as one entry per vendor", async () => {
    const { getCachedPublicVendorPage } = await import("@/lib/cache/catalogue-cache");
    const { db, calls } = recordingDb({
      single: { vendors: { id: VENDOR_ID, name: "Vendor", slug: "vendor", description: null, logo_url: null, cover_url: null, business_type: null, featured_product_ids: null, kind: "shop" } },
      rows: {
        outlets: [{ id: "o1", name: "Outlet", city: null, state: null, address: null, lat: null, lng: null, operating_hours: null, outlet_pages: null }],
        products: [{ id: "p1", name: "Product", product_type: null, requires_booking: false, base_price: 10, cover_url: null, outlet_id: "o1", tags: [], outlet_offers: [] }],
        product_review_metrics: [{ product_id: "p1", rating: 4, reviews: 1 }],
      },
    });
    cacheState.db = db;

    const rows = await getCachedPublicVendorPage(VENDOR_ID);

    expect(rows).toMatchObject({ vendor: { id: VENDOR_ID }, outlets: [{ id: "o1" }], products: [{ id: "p1" }], metricRows: [{ product_id: "p1" }] });
    expect(cacheState.entries).toHaveLength(1);
    expect(cacheState.entries[0]).toMatchObject({ keyParts: ["public-vendor-page"], args: [VENDOR_ID] });
    expect(JSON.parse(JSON.stringify(rows))).toEqual(rows);
    expect(filtersOn(calls, "vendors")).toContainEqual(["eq", "status", "approved"]);
    expect(filtersOn(calls, "outlets")).toEqual(expect.arrayContaining([["eq", "status", "active"], ["eq", "review_status", "approved"]]));
    expect(filtersOn(calls, "products")).toEqual(expect.arrayContaining([["eq", "status", "active"], ["eq", "review_status", "approved"]]));
    expect(filtersOn(calls, "places")).toContainEqual(["eq", "status", "active"]);
    // Entity media only: never product media, and outlet media only for the approved outlets just read.
    const media = filtersOn(calls, "media_assets");
    expect(media.filter(([method, column]) => method === "is" && column === "product_id")).toHaveLength(2);
    expect(media).toContainEqual(["in", "outlet_id", ["o1"]]);
    expect(filtersOn(calls, "reviews")).toContainEqual(["eq", "is_visible", true]);
  });

  it("does not store an unknown vendor, and skips the database for a malformed id", async () => {
    const { getCachedPublicVendorPage } = await import("@/lib/cache/catalogue-cache");
    const { db, calls } = recordingDb({});
    cacheState.db = db;

    await expect(getCachedPublicVendorPage(VENDOR_ID)).resolves.toBeNull();
    expect(cacheState.entries).toHaveLength(0);

    calls.length = 0;
    await expect(getCachedPublicVendorPage("not-a-uuid")).resolves.toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("throws a failed read so the cache never stores a partial page", async () => {
    const { getCachedPublicVendorPage } = await import("@/lib/cache/catalogue-cache");
    cacheState.db = recordingDb({ single: { vendors: { id: VENDOR_ID, name: "Vendor" } }, failTable: "products" }).db;

    await expect(getCachedPublicVendorPage(VENDOR_ID)).rejects.toMatchObject({ message: "products failed" });
    expect(cacheState.entries).toHaveLength(0);
  });
});

describe("public product page cache", () => {
  beforeEach(() => {
    cacheState.entries = [];
  });

  it("does not store a product that is not publicly listed, and reads it with the public filters", async () => {
    const { getCachedPublicProductPage } = await import("@/lib/cache/catalogue-cache");
    const { db, calls } = recordingDb({});
    cacheState.db = db;

    await expect(getCachedPublicProductPage(PRODUCT_ID, undefined)).resolves.toBeNull();
    expect(cacheState.entries).toHaveLength(0);
    expect(filtersOn(calls, "products")).toEqual(expect.arrayContaining([["eq", "status", "active"], ["eq", "review_status", "approved"]]));
  });

  it("keeps share-preview rows to the product and its visible reviews", async () => {
    const { getCachedProductMetadataRows } = await import("@/lib/cache/catalogue-cache");
    const { db, calls } = recordingDb({
      single: { products: { name: "Walk", description: "Guided", cover_url: null } },
      rows: { reviews: [{ rating: 5 }] },
    });
    cacheState.db = db;

    await expect(getCachedProductMetadataRows(PRODUCT_ID)).resolves.toEqual({ product: { name: "Walk", description: "Guided", cover_url: null }, reviewRows: [{ rating: 5 }] });
    expect(filtersOn(calls, "reviews")).toContainEqual(["eq", "is_visible", true]);
    await expect(getCachedProductMetadataRows("bad")).resolves.toBeNull();
  });
});
