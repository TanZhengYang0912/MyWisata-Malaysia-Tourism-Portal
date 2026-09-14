import { describe, expect, it, vi } from "vitest";
import { aggregateReviewMetrics } from "@/backend/domains/review-metrics";

// catalogue.ts builds the browser Supabase singleton at module scope, which
// needs env vars we don't have in unit tests. Every function under test takes
// an injected client, so the default export is never actually used here.
vi.mock("@/backend/supabase", () => ({ supabase: {} }));

const { getActivities, getComputedActivity } = await import("@/backend/domains/catalogue");

const PRODUCT_ROW = {
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
  categories: null,
  outlet_offers: [],
  product_variants: [],
  price_rules: [],
};

/** Minimal PostgREST stub: records which tables were queried, replays canned rows. */
function makeDb(tables: Record<string, unknown[]>, seen: string[], metricBatches: string[][] = []) {
  return {
    from(table: string) {
      seen.push(table);
      const rows = tables[table] ?? [];
      let selectedRows = rows;
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: () => builder,
        in: (_column: string, values: string[]) => {
          if (table === "product_review_metrics") {
            metricBatches.push(values);
            selectedRows = rows.filter((row) => values.includes((row as { product_id: string }).product_id));
          }
          return builder;
        },
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: selectedRows, error: null }),
      };
      return builder;
    },
  } as never;
}

describe("aggregateReviewMetrics", () => {
  it("calculates a one-decimal average and review count per product", () => {
    expect(aggregateReviewMetrics([
      { product_id: "product-a", rating: 5 },
      { product_id: "product-a", rating: 4 },
      { product_id: "product-b", rating: 3 },
    ])).toEqual(new Map([
      ["product-a", { rating: 4.5, reviews: 2 }],
      ["product-b", { rating: 3, reviews: 1 }],
    ]));
  });

  it("does not create metrics for products with no visible reviews", () => {
    expect(aggregateReviewMetrics([]).get("unreviewed-product") ?? { rating: 0, reviews: 0 })
      .toEqual({ rating: 0, reviews: 0 });
  });
});

describe("getActivities review metrics", () => {
  it("reads aggregates from product_review_metrics, not the raw reviews table", async () => {
    const seen: string[] = [];
    const db = makeDb(
      {
        products: [PRODUCT_ROW],
        product_review_metrics: [{ product_id: "p1", rating: 4.6, reviews: 107 }],
      },
      seen,
    );

    const activities = await getActivities(db);

    expect(seen).toContain("product_review_metrics");
    expect(seen).not.toContain("reviews");
    expect(activities[0].rating).toBe(4.6);
    expect(activities[0].reviews).toBe(107);
  });

  it("coerces the NUMERIC/BIGINT strings PostgREST returns into numbers", async () => {
    const db = makeDb(
      {
        products: [PRODUCT_ROW],
        product_review_metrics: [{ product_id: "p1", rating: "4.6", reviews: "107" }],
      },
      [],
    );

    const activities = await getActivities(db);

    expect(activities[0].rating).toBe(4.6);
    expect(activities[0].reviews).toBe(107);
  });

  it("bounds metric lookup IDs so large catalogues do not create oversized URLs", async () => {
    const products = Array.from({ length: 201 }, (_, index) => ({
      ...PRODUCT_ROW,
      id: `p${index + 1}`,
    }));
    const metricBatches: string[][] = [];
    const db = makeDb({ products, product_review_metrics: [] }, [], metricBatches);

    await getActivities(db);

    expect(metricBatches).toHaveLength(3);
    expect(metricBatches.map((batch) => batch.length)).toEqual([100, 100, 1]);
    expect(metricBatches.flat()).toEqual(products.map((product) => product.id));
  });
});

const OUTLET_ROW = {
  id: "o1",
  vendor_id: "v1",
  name: "Test outlet",
  address: null,
  city: "Ipoh",
  state: "Perak",
  lat: 4.6,
  lng: 101.1,
  operating_hours: null,
  phone: null,
  status: "active",
  wheelchair_accessible: null,
  pet_friendly: null,
  vendors: { name: "Test vendor", status: "approved" },
  products: null,
};

/** Stub that also records the equality filters each query applied. */
function makeFilterRecordingDb(tables: Record<string, unknown[]>, filters: Record<string, unknown>[]) {
  return {
    from(table: string) {
      const rows = tables[table] ?? [];
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (column: string, value: unknown) => {
          filters.push({ table, column, value });
          return builder;
        },
        in: (column: string, value: unknown) => {
          filters.push({ table, column, value });
          return builder;
        },
        maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: rows, error: null }),
      };
      return builder;
    },
  } as never;
}

describe("getComputedActivity", () => {
  it("queries only the requested product, not the whole catalogue", async () => {
    const filters: Record<string, unknown>[] = [];
    const db = makeFilterRecordingDb(
      {
        products: [PRODUCT_ROW],
        product_review_metrics: [{ product_id: "p1", rating: "4.6", reviews: "107" }],
        outlets: [OUTLET_ROW],
      },
      filters,
    );

    const activity = await getComputedActivity("p1", undefined, db);

    expect(activity?.id).toBe("p1");
    expect(activity?.rating).toBe(4.6);
    expect(activity?.reviews).toBe(107);
    expect(activity?.outlet.id).toBe("o1");
    // The point of the rewrite: filter by id in the database rather than
    // fetching every product and calling .find().
    expect(filters).toContainEqual({ table: "products", column: "id", value: "p1" });
    expect(filters).toContainEqual({ table: "outlets", column: "id", value: ["o1"] });
  });

  it("returns null for a product that is not active or approved", async () => {
    const db = makeFilterRecordingDb({ products: [], outlets: [OUTLET_ROW] }, []);
    expect(await getComputedActivity("missing", undefined, db)).toBeNull();
  });
});
