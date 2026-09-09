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
    priority: 1,
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
  it("caps eligible placements to four unique sponsored products in one-based position order", () => {
    const activities = [activity("a"), activity("b"), activity("c"), activity("d")];
    const placements = [
      placement("placement-f", "a", { priority: 3, startsAt: "2026-09-03T00:00:00.000Z" }),
      placement("placement-e", "b", { priority: 2 }),
      placement("placement-d", "d", { priority: 4, startsAt: "2026-09-02T00:00:00.000Z" }),
      placement("placement-c", "c", { priority: 3, startsAt: "2026-09-02T00:00:00.000Z" }),
      placement("placement-b", "a", { priority: 1 }),
      placement("placement-a", "b", { priority: 4 }),
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
      placement("archived", "eligible", { status: "archived" }),
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
        placement("placement-d", "d", { priority: 2 }),
        placement("placement-b", "b", { priority: 1 }),
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

  it("orders exact targeting before broader fallback even when fallback has Position 1", () => {
    const result = rankDiscoveryResults({
      activities: [activity("exact"), activity("state"), activity("category"), activity("broad")],
      placements: [
        placement("broad-placement", "broad", { priority: 1 }),
        placement("category-placement", "category", { categorySlug: "activity", priority: 1 }),
        placement("state-placement", "state", { state: "Sabah", priority: 4 }),
        placement("exact-placement", "exact", { state: "Sabah", categorySlug: "activity", priority: 4 }),
      ],
      filters,
      now: "2026-09-05T00:00:00.000Z",
    });

    expect(result.map((item) => item.id)).toEqual(["exact", "state", "category", "broad"]);
  });

  it("uses broad campaigns to fill remaining sponsored slots", () => {
    const result = rankDiscoveryResults({
      activities: [activity("exact"), activity("fallback"), activity("organic")],
      placements: [
        placement("fallback-placement", "fallback", { priority: 1 }),
        placement("exact-placement", "exact", { state: "Sabah", categorySlug: "activity", priority: 2 }),
      ],
      filters,
      now: "2026-09-05T00:00:00.000Z",
    });

    expect(result.map((item) => [item.id, item.sponsorship?.placementId ?? null])).toEqual([
      ["exact", "exact-placement"],
      ["fallback", "fallback-placement"],
      ["organic", null],
    ]);
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
