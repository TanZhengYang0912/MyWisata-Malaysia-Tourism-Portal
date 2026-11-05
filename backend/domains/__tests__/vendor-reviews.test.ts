import { describe, expect, it, vi } from "vitest";

vi.mock("@/backend/supabase", () => ({ supabase: {} }));

import { getReviewRatingSummary, getScopedReviewPage, getVendorRatingSummaries } from "@/backend/domains/vendor-reviews";

type Row = Record<string, unknown>;

function makeDb(tables: Record<string, Row[]>, trace: Array<Record<string, unknown>> = []) {
  return {
    from(table: string) {
      let rows = [...(tables[table] ?? [])];
      let countMode = false;
      let range: [number, number] | null = null;
      let selected = "";
      const builder: Record<string, unknown> = {
        select: (columns: string, options?: { count?: string; head?: boolean }) => {
          selected = columns;
          countMode = Boolean(options?.head);
          trace.push({ table, columns, countMode });
          return builder;
        },
        eq: (column: string, value: unknown) => {
          trace.push({ table, column, value });
          rows = rows.filter((row) => row[column] === value);
          return builder;
        },
        in: (column: string, values: unknown[]) => {
          trace.push({ table, column, values });
          rows = rows.filter((row) => values.includes(row[column]));
          return builder;
        },
        order: (column: string, options?: { ascending?: boolean }) => {
          trace.push({ table, order: column, ascending: options?.ascending });
          return builder;
        },
        range: (from: number, to: number) => {
          range = [from, to];
          trace.push({ table, range: [from, to] });
          return builder;
        },
        then: (resolve: (value: { data: Row[]; count: number | null; error: null }) => unknown) => {
          const resultRows = range ? rows.slice(range[0], range[1] + 1) : rows;
          return resolve({ data: countMode ? [] : resultRows, count: countMode ? rows.length : null, error: null });
        },
      };
      void selected;
      return builder;
    },
  } as never;
}

describe("scoped customer review reads", () => {
  it("gets aggregate rating buckets from the protected view for one scope", async () => {
    const trace: Array<Record<string, unknown>> = [];
    const db = makeDb({
      review_rating_metrics_by_scope: [
        { scope_type: "vendor", scope_id: "vendor-1", rating: 5, review_count: "3" },
        { scope_type: "vendor", scope_id: "vendor-1", rating: 4, review_count: "1" },
        { scope_type: "vendor", scope_id: "vendor-2", rating: 1, review_count: "90" },
      ],
    }, trace);

    await expect(getReviewRatingSummary("vendor", "vendor-1", db)).resolves.toEqual({
      rating: 4.8,
      total: 4,
      buckets: [
        { rating: 5, count: 3 },
        { rating: 4, count: 1 },
      ],
    });

    expect(trace).toContainEqual({ table: "review_rating_metrics_by_scope", column: "scope_type", value: "vendor" });
    expect(trace).toContainEqual({ table: "review_rating_metrics_by_scope", column: "scope_id", value: "vendor-1" });
    expect(trace.some((entry) => entry.table === "reviews")).toBe(false);
  });

  it("summarises many vendors in one query, matching the single-vendor summary", async () => {
    const trace: Array<Record<string, unknown>> = [];
    const rows = [
      { scope_type: "vendor", scope_id: "vendor-1", rating: 5, review_count: 3 },
      { scope_type: "vendor", scope_id: "vendor-1", rating: 4, review_count: 1 },
      { scope_type: "vendor", scope_id: "vendor-2", rating: 3, review_count: 2 },
      { scope_type: "outlet", scope_id: "vendor-3", rating: 5, review_count: 9 },
    ];
    const db = makeDb({ review_rating_metrics_by_scope: rows }, trace);

    const summaries = await getVendorRatingSummaries(["vendor-1", "vendor-2", "vendor-3"], db);
    const single = await getReviewRatingSummary("vendor", "vendor-1", makeDb({ review_rating_metrics_by_scope: rows }));

    expect(summaries.get("vendor-1")).toEqual({ value: single.rating, count: single.total });
    expect(summaries.get("vendor-2")).toEqual({ value: 3, count: 2 });
    expect(summaries.has("vendor-3")).toBe(false);
    expect(trace.filter((entry) => entry.columns)).toHaveLength(1);
  });

  it("filters, orders, and bounds a scoped page before returning it", async () => {
    const trace: Array<Record<string, unknown>> = [];
    const db = makeDb({
      reviews: [
        { id: "review-1", vendor_id: "vendor-1", is_visible: true, rating: 5, title: "Great", body: "Lovely place", created_at: "2026-10-10T00:00:00Z", user_id: "user-1", product_id: "product-1", outlet_id: "outlet-1", products: { name: "Laksa" }, outlets: { name: "Main branch" } },
        { id: "review-hidden", vendor_id: "vendor-1", is_visible: false, rating: 5, title: null, body: null, created_at: "2026-10-09T00:00:00Z", user_id: "user-2", product_id: "product-2", outlet_id: null },
        { id: "review-other", vendor_id: "vendor-2", is_visible: true, rating: 5, title: null, body: null, created_at: "2026-10-08T00:00:00Z", user_id: "user-3", product_id: "product-3", outlet_id: null },
      ],
      public_users: [{ id: "user-1", full_name: "Alice Example" }],
    }, trace);

    const result = await getScopedReviewPage("vendor", "vendor-1", { page: 1, pageSize: 1, rating: 5 }, db);

    expect(result.total).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      id: "review-1",
      authorName: "Alice E.",
      verifiedPurchase: true,
      productName: "Laksa",
      outletName: "Main branch",
    });
    expect(trace).toContainEqual({ table: "reviews", column: "vendor_id", value: "vendor-1" });
    expect(trace).toContainEqual({ table: "reviews", column: "is_visible", value: true });
    expect(trace).toContainEqual({ table: "reviews", column: "rating", value: 5 });
    expect(trace).toContainEqual({ table: "reviews", order: "created_at", ascending: false });
    expect(trace).toContainEqual({ table: "reviews", range: [0, 0] });
  });

  it("keeps hotel review pages scoped to accommodation products in Postgres", async () => {
    const trace: Array<Record<string, unknown>> = [];
    const db = makeDb({ reviews: [] }, trace);

    await getScopedReviewPage("outlet", "outlet-1", { page: 1, pageSize: 6, productCategorySlug: "accommodation" }, db);

    expect(trace).toContainEqual({
      table: "reviews",
      columns: "id,products!inner(categories!inner(slug))",
      countMode: true,
    });
    expect(trace).toContainEqual({ table: "reviews", column: "products.categories.slug", value: "accommodation" });
    expect(trace).toContainEqual({
      table: "reviews",
      columns: "id,rating,title,body,created_at,user_id,product_id,outlet_id,products!inner(name,categories!inner(slug)),outlets(name)",
      countMode: false,
    });
  });
});
