import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCachedPublicProductPage: vi.fn(),
  getCachedDiscoveryActivityData: vi.fn(async () => ({ activities: [], outlets: [] })),
  getBookingSlots: vi.fn(),
  getOutletActivities: vi.fn(async () => []),
  getVendorActivities: vi.fn(async () => []),
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("@/lib/cache/catalogue-cache", () => ({
  getCachedPublicProductPage: mocks.getCachedPublicProductPage,
  getCachedDiscoveryActivityData: mocks.getCachedDiscoveryActivityData,
}));
vi.mock("@/backend/domains/catalogue", () => ({
  getBookingSlots: mocks.getBookingSlots,
  getOutletActivities: mocks.getOutletActivities,
  getVendorActivities: mocks.getVendorActivities,
}));
vi.mock("@/lib/affiliate/activity-metadata", () => ({ buildActivityMetadata: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../activity-detail-client", () => ({ ActivityDetailClient: () => null }));

const { default: ActivityDetailPage } = await import("../page");

const PRODUCT_ID = "22222222-2222-4222-8222-222222222222";

function publicPage(outletId: string, requiresBooking = true) {
  return {
    activity: {
      id: PRODUCT_ID,
      outletId,
      requiresBooking,
      categorySlug: "activity",
      offers: [{ outletId: "outlet-a" }, { outletId: "outlet-b" }],
      outlet: { vendorId: "vendor-1" },
    },
    outletChoices: [{ outletId: "outlet-a" }, { outletId: "outlet-b" }],
    reviews: [{ id: `review-${outletId}` }],
  };
}

async function render(searchParams: Record<string, string> = {}) {
  const element = await ActivityDetailPage({ params: Promise.resolve({ id: PRODUCT_ID }), searchParams: Promise.resolve(searchParams) });
  return (element as { props: Record<string, unknown> }).props;
}

describe("product page public cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCachedPublicProductPage.mockImplementation(async (_id: string, outletId?: string) => publicPage(outletId ?? "outlet-a"));
    mocks.getBookingSlots.mockResolvedValue([{ id: "slot-live" }]);
  });

  it("reads live booking slots on every request next to the cached product", async () => {
    const props = await render();
    expect(props.initialSlots).toEqual([{ id: "slot-live" }]);
    expect(props.initialReviews).toEqual([{ id: "review-outlet-a" }]);
    expect(mocks.getBookingSlots).toHaveBeenCalledWith(PRODUCT_ID, {});
  });

  it("shows no slots for a product that takes no bookings, even when the slot read fails", async () => {
    mocks.getCachedPublicProductPage.mockResolvedValue(publicPage("outlet-a", false));
    mocks.getBookingSlots.mockRejectedValue(new Error("offline"));
    expect((await render()).initialSlots).toEqual([]);
  });

  it("uses an outlet-specific entry only for one of the product's own outlets", async () => {
    const props = await render({ outletId: "outlet-b" });
    expect(mocks.getCachedPublicProductPage).toHaveBeenCalledWith(PRODUCT_ID, "outlet-b");
    expect(props.initialReviews).toEqual([{ id: "review-outlet-b" }]);

    mocks.getCachedPublicProductPage.mockClear();
    await render({ outletId: "33333333-3333-4333-8333-333333333333" });
    expect(mocks.getCachedPublicProductPage).toHaveBeenCalledTimes(1);
    expect(mocks.getCachedPublicProductPage).toHaveBeenCalledWith(PRODUCT_ID, undefined);
  });

  it("renders the not-found state without slots or related reads for an unlisted product", async () => {
    mocks.getCachedPublicProductPage.mockResolvedValue(null);
    const props = await render();
    expect(props.initialActivity).toBeNull();
    expect(props.initialSlots).toEqual([]);
    expect(mocks.getOutletActivities).not.toHaveBeenCalled();
  });
});
