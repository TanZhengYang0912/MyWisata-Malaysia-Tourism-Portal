import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  outletRows: [] as Array<Record<string, unknown>>,
  directProducts: [] as Array<Record<string, unknown>>,
  sharedProducts: [] as Array<Record<string, unknown>>,
  cards: [] as Array<Record<string, unknown>>,
  calls: [] as Array<{ table: string; filters: Array<[string, unknown]>; limit?: number; order: string[] }>,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      const call = { table, filters: [] as Array<[string, unknown]>, order: [] as string[], limit: undefined as number | undefined };
      mocks.calls.push(call);
      let columns = "";
      const query = {
        select: (value: string) => { columns = value; return query; },
        eq: (column: string, value: unknown) => { call.filters.push([column, value]); return query; },
        is: (column: string, value: unknown) => { call.filters.push([column, value]); return query; },
        gte: (column: string, value: unknown) => { call.filters.push([column, value]); return query; },
        order: (column: string) => { call.order.push(column); return query; },
        limit: (count: number) => { call.limit = count; return query; },
        then: (resolve: (value: unknown) => unknown) => resolve({
          data: table === "outlets" ? mocks.outletRows : columns.includes("outlet_offers!inner") ? mocks.sharedProducts : mocks.directProducts,
          error: null,
        }),
      };
      return query;
    },
  })),
}));
vi.mock("@/backend/domains/places", () => ({ getPlaceBySlug: vi.fn(async () => null) }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn(() => ({})) }));
vi.mock("@/backend/domains/vendor-reviews", () => ({ getScopeRatingSummaries: vi.fn(async () => new Map()) }));
vi.mock("@/lib/i18n/server", () => ({ getServerTranslation: vi.fn(async () => ({ t: (key: string) => key })) }));
vi.mock("@/components/customer/product-card", () => ({ ProductCard: ({ listing }: { listing: Record<string, unknown> }) => { mocks.cards.push(listing); return null; } }));

import DestinationPage from "@/app/customer/destination/[destinationId]/page";
import { getScopeRatingSummaries } from "@/backend/domains/vendor-reviews";

const directProduct = {
  id: "direct", vendor_id: "v1", name: "Coffee", description: null, product_type: "food",
  cover_url: null, base_price: "7.50", requires_booking: false, vendors: { name: "Coffee Shop" },
  outlets: { id: "o1", name: "Main", city: "George Town", state: "Penang", operating_hours: null },
  outlet_offers: [],
};

describe("destination outlet card routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.directProducts = [];
    mocks.sharedProducts = [];
    mocks.cards = [];
    mocks.calls = [];
    mocks.outletRows = [{
      id: "outlet-123",
      name: "Test Outlet",
      address: "1 Test Street",
      city: "George Town",
      state: "Penang",
      vendors: { id: "vendor-456", name: "Test Vendor", logo_url: null, status: "approved" },
    }];
  });

  it("opens the outlet page, not its vendor page, when the outlet has a vendor", async () => {
    const markup = renderToStaticMarkup(await DestinationPage({ params: Promise.resolve({ destinationId: "penang" }) }));

    expect(markup).toContain('href="/customer/outlets/outlet-123"');
    expect(markup).not.toContain('href="/customer/vendors/vendor-456"');
  });

  it("includes shared products and summarizes their eligible in-state offers", async () => {
    const outlet = { id: "o1", name: "Main", city: "George Town", state: "Penang", operating_hours: null };
    mocks.sharedProducts = [{
      id: "shared", vendor_id: "v1", name: "Tea", description: null, product_type: "food",
      cover_url: null, base_price: 99, requires_booking: false, outlets: null, vendors: { name: "Tea Shop" },
      outlet_offers: [{ outlet_id: "o1", price: 12, status: "active", outlets: outlet },
        { outlet_id: "o2", price: 8, status: "active", outlets: { ...outlet, id: "o2" } }],
    }];
    renderToStaticMarkup(await DestinationPage({ params: Promise.resolve({ destinationId: "penang" }) }));
    expect(mocks.cards).toHaveLength(1);
    expect(mocks.cards[0]).toMatchObject({ id: "shared", sales: { outletCount: 2, fromPrice: 8 } });
    const reads = mocks.calls.filter((call) => call.table === "products");
    expect(reads).toHaveLength(2);
    expect(reads.every((call) => call.limit === 8 && call.order.join(",") === "name,id")).toBe(true);
    expect(reads.some((call) => call.filters.some(([key, value]) => key === "outlet_offers.outlets.state" && value === "Penang"))).toBe(true);
    expect(reads.some((call) => call.filters.some(([key, value]) => key === "outlets.state" && value === "Penang"))).toBe(true);
    for (const read of reads) {
      expect(read.filters).toEqual(expect.arrayContaining([
        ["status", "active"], ["review_status", "approved"], ["vendors.status", "approved"],
        ["outlet_offers.status", "active"],
      ]));
    }
    expect(reads[0].filters).toEqual(expect.arrayContaining([
      ["outlets.status", "active"], ["outlets.review_status", "approved"], ["outlet_offers", null], ["base_price", 0],
    ]));
    expect(reads[1].filters).toEqual(expect.arrayContaining([
      ["outlet_offers.outlets.status", "active"], ["outlet_offers.outlets.review_status", "approved"], ["outlet_offers.price", 0],
    ]));
  });

  it("uses the base price for a direct-only product and retains its single outlet", async () => {
    mocks.directProducts = [directProduct];
    renderToStaticMarkup(await DestinationPage({ params: Promise.resolve({ destinationId: "penang" }) }));
    expect(mocks.cards).toHaveLength(1);
    expect(mocks.cards[0]).toMatchObject({
      id: "direct", ratingKnown: true, sales: { outletCount: 1, fromPrice: 7.5 }, singleOutlet: { id: "o1" },
    });
  });

  it("does not label an unavailable rating lookup as zero reviews", async () => {
    mocks.directProducts = [directProduct];
    vi.mocked(getScopeRatingSummaries).mockRejectedValueOnce(new Error("Rating service unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      renderToStaticMarkup(await DestinationPage({ params: Promise.resolve({ destinationId: "penang" }) }));
      expect(mocks.cards[0]).toMatchObject({ id: "direct", ratingKnown: false });
      expect(log).toHaveBeenCalledWith("Destination product ratings unavailable", expect.any(Error));
    } finally {
      log.mockRestore();
    }
  });

  it("deduplicates candidates and bounds both rendered cards and the batched rating lookup", async () => {
    mocks.directProducts = Array.from({ length: 8 }, (_, index) => ({ ...directProduct, id: `p${index}`, name: `Coffee ${index}` }));
    mocks.sharedProducts = mocks.directProducts.map((row) => ({ ...row }));
    renderToStaticMarkup(await DestinationPage({ params: Promise.resolve({ destinationId: "penang" }) }));
    expect(mocks.cards).toHaveLength(8);
    expect(new Set(mocks.cards.map((card) => card.id)).size).toBe(8);
    expect(getScopeRatingSummaries).toHaveBeenCalledExactlyOnceWith("product", mocks.cards.map((card) => card.id), {});
  });
});
