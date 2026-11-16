import { describe, expect, it, vi } from "vitest";
import type { Activity, Outlet } from "@/backend/core/types";

vi.mock("@/backend/supabase", () => ({ supabase: {} }));

const { searchTripActivities } = await import("@/backend/domains/catalogue");

const outlet: Outlet = {
  id: "outlet-1",
  vendorId: "vendor-1",
  vendorName: "Vendor",
  name: "Outlet",
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
  reviews: 1,
};

function candidate(id: string, overrides: Partial<Activity> = {}): Activity {
  return {
    id,
    vendorId: "vendor-1",
    outletId: outlet.id,
    name: id,
    category: "Activities",
    description: "",
    image: null,
    price: 20,
    rating: 4,
    reviews: 1,
    duration: "",
    requiresBooking: false,
    variants: [],
    categorySlug: "activity",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeDb(
  rows: unknown[],
  error: unknown = null,
  seenSelects: string[] = [],
  seenFilters: Array<{ table: string; column: string; value: unknown }> = [],
) {
  return {
    from(table: string) {
      let selected = rows;
      const builder: Record<string, unknown> = {
        select: (columns: string) => {
          if (table === "products") seenSelects.push(columns);
          return builder;
        },
        in: (_column: string, ids: string[]) => {
          selected = rows.filter((row) => ids.includes((row as { id: string }).id));
          return builder;
        },
        eq: (column: string, value: unknown) => {
          seenFilters.push({ table, column, value });
          selected = selected.filter((row) => (row as Record<string, unknown>)[column] === value);
          return builder;
        },
        then: (resolve: (value: { data: unknown[]; error: unknown }) => unknown) =>
          Promise.resolve(resolve({ data: selected, error })),
      };
      return builder;
    },
  } as never;
}

const inventory = (outletId: string, quantity: number, reserved = 0) => ({ outlet_id: outletId, quantity, reserved });
const product = (id: string, productVariants: unknown[], requires_booking = false) => ({
  id,
  status: "active",
  review_status: "approved",
  requires_booking,
  product_variants: productVariants,
});

describe("Trip discovery purchase availability", () => {
  it("keeps public and booking places, and hides missing or unpurchasable vendor listings", async () => {
    const activities = [
      candidate("public-place", { price: 0, typeSlugs: ["nature"] }),
      candidate("bookable", { requiresBooking: true, variants: [] }),
      candidate("available", { offers: [{ outletId: outlet.id, price: 20, status: "active" }] }),
      candidate("sold-out"),
      candidate("inactive-variant"),
      candidate("missing-variant"),
      candidate("other-outlet-stock"),
      candidate("missing-product"),
    ];
    const products = [
      product("bookable", [], true),
      product("available", [{ is_active: true, inventory: [inventory(outlet.id, 4, 1)] }]),
      product("sold-out", [{ is_active: true, inventory: [inventory(outlet.id, 2, 2)] }]),
      product("inactive-variant", [{ is_active: false, inventory: [inventory(outlet.id, 5)] }]),
      product("missing-variant", []),
      product("other-outlet-stock", [{ is_active: true, inventory: [inventory("other-outlet", 5)] }]),
    ];
    const selects: string[] = [];
    const filters: Array<{ table: string; column: string; value: unknown }> = [];
    const result = await searchTripActivities(
      { category: null },
      [],
      makeDb(products, null, selects, filters),
      { activities, outlets: [outlet] },
    );

    expect(Object.fromEntries(result.map((item) => [item.id, item.tripDiscoveryAvailable]))).toEqual({
      "public-place": true,
      bookable: true,
      available: true,
      "sold-out": false,
      "inactive-variant": false,
      "missing-variant": false,
      "other-outlet-stock": false,
      "missing-product": false,
    });
    expect(selects).toContain("id,requires_booking,product_variants(id,is_active,inventory(outlet_id,quantity,reserved))");
    expect(filters).toContainEqual({ table: "products", column: "status", value: "active" });
    expect(filters).toContainEqual({ table: "products", column: "review_status", value: "approved" });
  });

  it("rejects a failed availability read instead of labeling its rows sold out", async () => {
    const dbError = new Error("availability read failed");
    await expect(searchTripActivities(
      { category: null },
      [],
      makeDb([], dbError),
      { activities: [candidate("vendor-product")], outlets: [outlet] },
    )).rejects.toBe(dbError);
  });
});
