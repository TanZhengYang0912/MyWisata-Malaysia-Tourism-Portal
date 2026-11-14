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
