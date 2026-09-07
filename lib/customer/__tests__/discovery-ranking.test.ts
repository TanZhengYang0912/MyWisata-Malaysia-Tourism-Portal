import { describe, expect, it } from "vitest";
import type { ComputedActivity, SponsoredPlacement } from "@/backend/core/types";
import type { DiscoveryQuery } from "@/lib/customer/discovery-query";
import { rankDiscoveryResults } from "@/lib/customer/discovery-ranking";

function activity(id: string, overrides: Partial<ComputedActivity> = {}): ComputedActivity {
  return {
    id,
    outletId: `outlet-${id}`,
    name: `Activity ${id}`,
    category: "Activities",
    categorySlug: "activity",
    description: "",
    image: null,
    price: 30,
    rating: 4.5,
    reviews: 10,
    duration: "2 hours",
    requiresBooking: false,
    variants: [],
    outlet: {
      id: `outlet-${id}`,
      vendorId: `vendor-${id}`,
      name: `Outlet ${id}`,
      category: "Activities",
      state: "Sabah",
      city: "Kota Kinabalu",
      address: "Malaysia",
      lat: 5.98,
      lng: 116.07,
      hours: "9:00 AM - 6:00 PM",
      verified: true,
      open: true,
      rating: 4.5,
      reviews: 10,
    },
    ...overrides,
  };
}

function placement(
  id: string,
  productId: string,
  overrides: Partial<SponsoredPlacement> = {},
): SponsoredPlacement {
  return {
    id,
    productId,
    state: null,
    categorySlug: null,
    startsAt: "2026-09-01T00:00:00.000Z",
    endsAt: "2026-09-30T00:00:00.000Z",
    priority: 100,
    status: "approved",
    ...overrides,
  };
}

const filters: DiscoveryQuery = {
  q: "",
  state: "Sabah",
  categories: ["activity"],
  types: [],
  priceMax: null,
  freeOnly: false,
  bookableOnly: false,
  hiddenGemOnly: false,
  familyFriendlyOnly: false,
  coupleFriendlyOnly: false,
};

describe("rankDiscoveryResults", () => {
  it("caps six eligible placements to four unique sponsored products in deterministic order", () => {
    const activities = [activity("a"), activity("b"), activity("c"), activity("d")];
    const placements = [
      placement("placement-f", "a", { priority: 200, startsAt: "2026-09-03T00:00:00.000Z" }),
      placement("placement-e", "b", { priority: 300 }),
      placement("placement-d", "d", { priority: 200, startsAt: "2026-09-02T00:00:00.000Z" }),
      placement("placement-c", "c", { priority: 200, startsAt: "2026-09-02T00:00:00.000Z" }),
      placement("placement-b", "a", { priority: 400 }),
      placement("placement-a", "b", { priority: 100 }),
    ];

    const result = rankDiscoveryResults({
      activities,
      placements,
      filters,
      now: "2026-09-05T00:00:00.000Z",
    });

    expect(result).toHaveLength(4);
    expect(result.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
    expect(result.map((item) => item.sponsorship)).toEqual([
      { placementId: "placement-b", label: "Sponsored" },
      { placementId: "placement-e", label: "Sponsored" },
      { placementId: "placement-c", label: "Sponsored" },
      { placementId: "placement-d", label: "Sponsored" },
    ]);
  });

  it("rejects placements with the wrong status, schedule, filter scope, or organic product set", () => {
    const activities = [activity("eligible"), activity("organic")];
    const placements = [
      placement("eligible-placement", "eligible", { state: "Sabah", categorySlug: "activity" }),
      placement("draft", "eligible", { status: "draft" }),
      placement("future", "eligible", { startsAt: "2026-09-06T00:00:00.000Z" }),
      placement("expired", "eligible", { endsAt: "2026-09-05T00:00:00.000Z" }),
      placement("wrong-state", "eligible", { state: "Penang" }),
      placement("wrong-category", "eligible", { categorySlug: "food" }),
      placement("not-organic", "missing-product"),
    ];

    const result = rankDiscoveryResults({
      activities,
      placements,
      filters,
      now: "2026-09-05T00:00:00.000Z",
    });

    expect(result.map((item) => [item.id, item.sponsorship])).toEqual([
      ["eligible", { placementId: "eligible-placement", label: "Sponsored" }],
      ["organic", null],
    ]);
  });

  it("appends unsponsored activities in their original organic order", () => {
    const activities = [activity("a"), activity("b"), activity("c"), activity("d")];
    const result = rankDiscoveryResults({
      activities,
      placements: [
        placement("placement-d", "d", { priority: 50 }),
        placement("placement-b", "b", { priority: 100 }),
      ],
      filters,
      now: "2026-09-05T00:00:00.000Z",
    });

    expect(result.map((item) => item.id)).toEqual(["b", "d", "a", "c"]);
    expect(result.slice(2).map((item) => item.sponsorship)).toEqual([null, null]);
  });

  it("orders equal priorities by actual start time across timezone offsets", () => {
    const result = rankDiscoveryResults({
      activities: [activity("a"), activity("b")],
      placements: [
        placement("placement-a", "a", { startsAt: "2026-09-01T00:30:00+08:00" }),
        placement("placement-b", "b", { startsAt: "2026-08-31T17:00:00.000Z" }),
      ],
      filters,
      now: "2026-09-05T00:00:00.000Z",
    });

    expect(result.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("does not manufacture sponsorship from untrusted browser filter claims", () => {
    const browserFilters = { ...filters, sponsored: true } as DiscoveryQuery & { sponsored: boolean };
    const result = rankDiscoveryResults({
      activities: [activity("a")],
      placements: [],
      filters: browserFilters,
      now: "2026-09-05T00:00:00.000Z",
    });

    expect(result).toEqual([{ ...activity("a"), sponsorship: null }]);
  });
});
