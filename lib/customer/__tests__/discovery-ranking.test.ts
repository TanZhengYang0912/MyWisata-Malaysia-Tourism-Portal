import { describe, expect, it } from "vitest";
import type { ComputedActivity, SponsoredPlacement } from "@/backend/core/types";
import type { DiscoveryQuery } from "@/lib/customer/discovery-query";
import { rankDiscoveryResults, selectHomeDiscoverySections } from "@/lib/customer/discovery-ranking";

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
  operatingDays: [],
  hoursMode: "during",
  timeAt: null,
  timeFrom: null,
  timeTo: null,
  overnight: false,
  openNow: false,
  freeOnly: false,
  bookableOnly: false,
  hiddenGemOnly: false,
  familyFriendlyOnly: false,
  coupleFriendlyOnly: false,
};

describe('home highlights and recommendations', () => {
  it('sorts highlights without changing the old recommendation exclusion or reasons', () => {
    const activities = [activity('z', { name: 'Zulu' }), activity('y', { name: 'Yankee' }), activity('x', { name: 'Xray' }), activity('w', { name: 'Whisky' }), activity('a', { name: 'Alpha' })];
    const recommended = [activity('z', { aiTag: 'near you' }), activity('a', { name: 'Alpha', aiTag: 'interests' }), activity('b', { aiTag: 'similar' })];
    const result = selectHomeDiscoverySections(activities, recommended);
    expect(result.highlightItems.map((item) => item.id)).toEqual(['a', 'w', 'x', 'y', 'z']);
    expect(result.forYouItems.map((item) => [item.id, item.aiTag])).toEqual([['a', 'interests'], ['b', 'similar']]);
  });
  it('counts duplicate accommodation product ids once when grouping a property', () => {
    const hotel = activity('room-1', { name: 'Room 1', categorySlug: 'accommodation' });
    const secondRoom = activity('room-2', { name: 'Room 2', categorySlug: 'accommodation', outlet: hotel.outlet });
    const result = selectHomeDiscoverySections([hotel, hotel, secondRoom], []);
    expect(result.highlightItems).toHaveLength(1);
    expect(result.highlightItems[0].property?.roomTypeCount).toBe(2);
  });
});

describe('home highlight tiers', () => {
  const now = '2026-09-15T00:00:00.000Z';
  const named = (id: string, name: string, tags?: string[]) => activity(id, { name, ...(tags ? { tags } : {}) });

  it('fills Sponsored, then merchant Featured by name, then everything else by name', () => {
    const activities = [named('p1', 'Alpha'), named('p2', 'Bravo'), named('f1', 'Zulu', ['featured']), named('s1', 'Yankee'), named('s2', 'Xray'), named('f2', 'Mike', ['featured'])];
    const result = selectHomeDiscoverySections(activities, [], [placement('pl1', 's1'), placement('pl2', 's2', { priority: 2 })], now);
    expect(result.highlightItems.map((item) => item.id)).toEqual(['s1', 's2', 'f2', 'f1', 'p1', 'p2']);
    expect(result.highlightItems.map((item) => item.sponsorship?.placementId ?? null)).toEqual(['pl1', 'pl2', null, null, null, null]);
  });

  it('lets Sponsored take the whole first page and caps it at four', () => {
    const activities = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => named(id, id.toUpperCase()));
    const placements = ['a', 'b', 'c', 'd', 'e'].map((id, index) => placement(`pl-${id}`, id, { priority: index }));
    const result = selectHomeDiscoverySections(activities, [], placements, now);
    expect(result.highlightItems.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
    expect(result.highlightItems.map((item) => Boolean(item.sponsorship))).toEqual([true, true, true, true, false, false]);
  });

  it('shows a product that is both Sponsored and Featured once, in its Sponsored slot', () => {
    const activities = [named('both', 'Zulu', ['featured']), named('plain', 'Alpha')];
    const result = selectHomeDiscoverySections(activities, [], [placement('pl', 'both')], now);
    expect(result.highlightItems.map((item) => [item.id, item.sponsorship?.placementId ?? null, item.tags ?? []])).toEqual([['both', 'pl', ['featured']], ['plain', null, []]]);
  });

  it('never shows state- or category-targeted placements on Home', () => {
    const activities = [named('a', 'Alpha'), named('t', 'Zulu')];
    const result = selectHomeDiscoverySections(activities, [], [placement('pl', 't', { state: 'Sabah' })], now);
    expect(result.highlightItems.map((item) => item.id)).toEqual(['a', 't']);
    expect(result.highlightItems.some((item) => item.sponsorship)).toBe(false);
  });
});

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

describe('home highlights pager', () => {
  const ids = (count: number) => Array.from({ length: count }, (_, index) => `i${index}`);

  it('keeps at most 12 highlights and leaves For You filtering on the first 4', () => {
    const activities = ids(13).map((id) => activity(id, { name: id.padStart(4, '0') }));
    const result = selectHomeDiscoverySections(activities, activities.slice(0, 6));
    expect(result.highlightItems).toHaveLength(12);
    expect(result.forYouItems.map(({ id }) => id)).toEqual(['i4', 'i5']);
  });
});
