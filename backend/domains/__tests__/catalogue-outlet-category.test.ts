import { describe, expect, it, vi } from "vitest";

// catalogue.ts builds the browser Supabase singleton at module scope, which
// needs env vars we don't have in unit tests. Every function under test takes
// an injected client, so the default export is never actually used here.
vi.mock("@/backend/supabase", () => ({ supabase: {} }));

const { resolveVendorCategory, getOutlets } = await import("@/backend/domains/catalogue");

const cat = (slug: string) => ({ categories: { name: slug, slug } });

describe("resolveVendorCategory", () => {
  it("returns the label of the only category present", () => {
    expect(resolveVendorCategory([cat("food"), cat("food")])).toBe("Food");
  });

  it("returns the most common category when a vendor spans several", () => {
    expect(resolveVendorCategory([cat("accommodation"), cat("accommodation"), cat("activity")]))
      .toBe("Accommodation");
  });

  it("breaks ties by DISCOVERY_CATEGORIES order, not by array order", () => {
    // food is declared before activity, so an even split must resolve to Food
    // regardless of which row PostgREST happens to return first.
    expect(resolveVendorCategory([cat("activity"), cat("food")])).toBe("Food");
    expect(resolveVendorCategory([cat("food"), cat("activity")])).toBe("Food");
  });

  it("returns empty string when there are no products", () => {
    expect(resolveVendorCategory([])).toBe("");
    expect(resolveVendorCategory(null)).toBe("");
    expect(resolveVendorCategory(undefined)).toBe("");
  });

  it("ignores products with no category", () => {
    expect(resolveVendorCategory([{ categories: null }, cat("retail")])).toBe("Retail");
  });
});

describe("getOutlets", () => {
  it("gives every outlet of a vendor the same category, even without pinned products", () => {
    // The exact shape the bug produced: one outlet owns a pinned product, its
    // siblings own none. All three must still read "Food".
    const rows = [
      { id: "o1", vendor_id: "v1", name: "Flagship", address: null, city: null, state: null,
        lat: 1, lng: 2, operating_hours: null, phone: null, status: "active",
        wheelchair_accessible: null, pet_friendly: null,
        outlet_pages: { hero_url: "https://cdn.example.com/flagship.jpg" },
        vendors: { name: "Chendul", status: "approved", products: [cat("food"), cat("food")] } },
      { id: "o2", vendor_id: "v1", name: "Mall branch", address: null, city: null, state: null,
        lat: 1, lng: 2, operating_hours: null, phone: null, status: "active",
        wheelchair_accessible: null, pet_friendly: null,
        outlet_pages: null,
        vendors: { name: "Chendul", status: "approved", products: [cat("food"), cat("food")] } },
    ];
    const db = {
      from: () => {
        const query = {
          select: () => query,
          eq: () => query,
          then: (resolve: (value: { data: typeof rows; error: null }) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
        };
        return query;
      },
    };

    return getOutlets(db as never).then((outlets) => {
      expect(outlets.map((o) => o.category)).toEqual(["Food", "Food"]);
      expect(outlets.map((o) => o.coverUrl)).toEqual(["https://cdn.example.com/flagship.jpg", null]);
    });
  });

  it("retries without the optional food modes column when its migration is not live", async () => {
    const responses = [
      { data: null, error: { code: "42703", message: "column outlets.food_service_modes does not exist" } },
      { data: [{
        id: "o1", vendor_id: "v1", name: "Food stall", address: null, city: null, state: null,
        lat: null, lng: null, operating_hours: null, phone: null, status: "active",
        wheelchair_accessible: null, pet_friendly: null, outlet_pages: null,
        vendors: { name: "Food stall", slug: null, status: "approved", products: [] },
      }], error: null },
    ];
    const selections: string[] = [];
    let attempt = 0;
    const db = {
      from: () => {
        const response = responses[attempt++];
        const query: {
          select: (columns: string) => typeof query;
          eq: () => typeof query;
          then: (resolve: (value: (typeof responses)[number]) => unknown) => Promise<unknown>;
        } = {
          select: (columns) => { selections.push(columns); return query; },
          eq: () => query,
          then: (resolve) => Promise.resolve(response).then(resolve),
        };
        return query;
      },
    };

    const outlets = await getOutlets(db as never);

    expect(attempt).toBe(2);
    expect(selections[0]).toContain("food_service_modes");
    expect(selections[1]).not.toContain("food_service_modes");
    expect(outlets[0].foodServiceModes).toEqual(["dine_in", "takeaway"]);
  });
});
