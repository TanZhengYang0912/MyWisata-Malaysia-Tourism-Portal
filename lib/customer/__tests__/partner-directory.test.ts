import { describe, expect, it } from "vitest";
import type { ComputedActivity, SponsoredPlacement, VendorSummary } from "@/backend/core/types";
import type { DiscoveryQuery } from "@/lib/customer/discovery-query";
import {
  attachSponsoredOutletGalleryCovers,
  buildPartnerFilterFacts,
  matchesPartnerFilters,
  rankPartnerDirectory,
  selectPartnerAdvertisements,
  type PartnerActivityFacts,
} from "@/lib/customer/partner-directory";

function vendor(id: string, name: string, outletCount: number): VendorSummary {
  return {
    id,
    name,
    status: "approved",
    logoUrl: null,
    coverUrl: null,
    outlets: Array.from({ length: outletCount }, (_, index) => ({
      id: `${id}-outlet-${index}`,
      name: `${name} ${index + 1}`,
      city: "George Town",
      state: "Penang",
    })),
  };
}

function activity(id: string, overrides: Partial<ComputedActivity> = {}): ComputedActivity {
  return {
    id,
    outletId: `outlet-${id}`,
    name: `Activity ${id}`,
    category: "Activity",
    categorySlug: "activity",
    description: `Description ${id}`,
    image: null,
    price: 40,
    rating: 4.5,
    reviews: 20,
    duration: "2 hours",
    requiresBooking: true,
    variants: [],
    outlet: {
      id: `outlet-${id}`,
      vendorId: `vendor-${id}`,
      vendorName: `Vendor ${id}`,
      name: `Outlet ${id}`,
      category: "Activity",
      state: "Penang",
      city: "George Town",
      address: "Malaysia",
      lat: 5.4141,
      lng: 100.3288,
      hours: "9:00 AM - 6:00 PM",
      verified: true,
      open: true,
      rating: 4.5,
      reviews: 20,
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

describe("rankPartnerDirectory", () => {
  const vendors = [
    vendor("featured-b", "Beta", 2),
    vendor("organic", "Gamma", 1),
    vendor("featured-a", "Alpha", 3),
  ];

  it("places featured partners first and stabilizes each group by name", () => {
    const ranked = rankPartnerDirectory({
      vendors,
      featuredVendorIds: new Set(["featured-b", "featured-a"]),
      view: "all",
      sort: "featured",
    });

    expect(ranked.map((item) => item.id)).toEqual(["featured-a", "featured-b", "organic"]);
    expect(vendors.map((item) => item.id)).toEqual(["featured-b", "organic", "featured-a"]);
  });

  it("can show featured partners only", () => {
    expect(rankPartnerDirectory({
      vendors,
      featuredVendorIds: new Set(["featured-b"]),
      view: "featured",
      sort: "featured",
    }).map((item) => item.id)).toEqual(["featured-b"]);
  });

  it("sorts every visible partner by name", () => {
    expect(rankPartnerDirectory({
      vendors,
      featuredVendorIds: new Set(["featured-b"]),
      view: "all",
      sort: "name",
    }).map((item) => item.name)).toEqual(["Alpha", "Beta", "Gamma"]);
  });

  it("sorts by outlet count and uses name as the deterministic tie-breaker", () => {
    const sameCount = vendor("same-count", "Aardvark", 2);
    expect(rankPartnerDirectory({
      vendors: [...vendors, sameCount],
      featuredVendorIds: new Set(),
      view: "all",
      sort: "outlets",
    }).map((item) => item.id)).toEqual(["featured-a", "same-count", "featured-b", "organic"]);
  });
});

describe("selectPartnerAdvertisements", () => {
  const now = "2026-09-08T00:00:00.000Z";
  const penangActivity = activity("penang", {
    name: "Heritage Night Walk",
    description: "Guided street art experience",
  });
  const sabahActivity = activity("sabah", {
    name: "Island Discovery",
    category: "Nature",
    categorySlug: "nature",
    outlet: {
      ...activity("sabah").outlet,
      vendorName: "Borneo Hosts",
      city: "Kota Kinabalu",
      state: "Sabah",
    },
  });

  it("keeps matching sponsored activities in one-based campaign position order", () => {
    const result = selectPartnerAdvertisements({
      activities: [penangActivity, sabahActivity],
      placements: [
        placement("second", "penang", { priority: 2 }),
        placement("first", "sabah", { priority: 1 }),
      ],
      query: "",
      state: null,
      category: null,
      now,
    });

    expect(result.map((item) => item.id)).toEqual(["sabah", "penang"]);
    expect(result.map((item) => item.sponsorship)).toEqual([
      { placementId: "first", label: "Sponsored" },
      { placementId: "second", label: "Sponsored" },
    ]);
  });

  it("applies query, state, and canonical category before sponsorship ranking", () => {
    const placements = [
      placement("penang-placement", "penang", { state: "Penang", categorySlug: "activity" }),
      placement("sabah-placement", "sabah", { state: "Sabah", categorySlug: "activity" }),
    ];

    expect(selectPartnerAdvertisements({
      activities: [penangActivity, sabahActivity],
      placements,
      query: "borneo",
      state: "Sabah",
      category: "activity",
      now,
    }).map((item) => item.id)).toEqual(["sabah"]);

    expect(selectPartnerAdvertisements({
      activities: [penangActivity, sabahActivity],
      placements,
      query: "street art",
      state: "Penang",
      category: "food",
      now,
    })).toEqual([]);
  });

  it("treats Hidden Gem as a collection instead of a database category", () => {
    const hiddenGem = activity("hidden", { outlet: { ...activity("hidden").outlet, badgeSlugs: ["hidden_gem"] }, categorySlug: "food" });
    const ordinary = activity("ordinary", { outlet: { ...activity("ordinary").outlet, badgeSlugs: [] }, categorySlug: "food" });

    expect(selectPartnerAdvertisements({
      activities: [hiddenGem, ordinary],
      placements: [placement("hidden-placement", "hidden"), placement("ordinary-placement", "ordinary")],
      query: "",
      state: null,
      category: "hidden_gem",
      now,
    }).map((item) => item.id)).toEqual(["hidden"]);
  });
});

describe("buildPartnerFilterFacts", () => {
  function vendorActivity(id: string, vendorId: string | undefined, overrides: Partial<ComputedActivity> = {}, badgeSlugs?: string[]) {
    const base = activity(id, overrides);
    return { ...base, outlet: { ...base.outlet, vendorId: vendorId as string, badgeSlugs } };
  }

  it("lists card categories from vendor-mode products in first-seen order with the hidden gem label", () => {
    const facts = buildPartnerFilterFacts([
      vendorActivity("a", "v1", { categorySlug: "retail", category: "Retail" }),
      vendorActivity("b", "v1", { categorySlug: "food", category: "Food" }, ["hidden_gem"]),
      vendorActivity("c", "v1", { categorySlug: "retail", category: "Retail" }),
    ]);

    expect(facts.get("v1")?.categories).toEqual(["retail", "food", "hidden_gem"]);
  });

  it("keeps place-bound products out of card categories but in the filter facts", () => {
    const facts = buildPartnerFilterFacts([
      vendorActivity("guided", "v1", { categorySlug: "activity", typeSlugs: ["nature"], price: 0, requiresBooking: false }),
      vendorActivity("meal", "v1", { categorySlug: "food", category: "Food", price: 12 }),
    ]);

    expect(facts.get("v1")?.categories).toEqual(["food"]);
    expect(facts.get("v1")?.activityFacts).toEqual<PartnerActivityFacts[]>([
      { category: "activity", typeSlugs: ["nature"], price: 0, requiresBooking: false, hiddenGem: false },
      { category: "food", typeSlugs: [], price: 12, requiresBooking: true, hiddenGem: false },
    ]);
  });

  it("falls back to the raw category when the slug is missing and skips products without a vendor", () => {
    const facts = buildPartnerFilterFacts([
      vendorActivity("raw", "v1", { categorySlug: undefined, category: "Workshop" }),
      vendorActivity("place", undefined),
    ]);

    expect(facts.get("v1")?.categories).toEqual(["Workshop"]);
    expect([...facts.keys()]).toEqual(["v1"]);
  });
});

describe("matchesPartnerFilters", () => {
  const noFilters: DiscoveryQuery = {
    q: "",
    state: null,
    categories: [],
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
  const weekdayHours = { mon: { open: "09:00", close: "17:00" } };
  const lateHours = { mon: { open: "20:00", close: "02:00" } };
  const facts = (overrides: Partial<PartnerActivityFacts> = {}): PartnerActivityFacts => ({
    category: "food",
    typeSlugs: ["malay"],
    price: 20,
    requiresBooking: false,
    hiddenGem: false,
    ...overrides,
  });
  const partner = {
    name: "Kedai Kopi",
    outlets: [
      { id: "o1", name: "Main", city: "George Town", state: "Penang", operatingHours: weekdayHours, currentlyOpen: true, badgeSlugs: ["family_friendly"] },
      { id: "o2", name: "Night", city: "Ipoh", state: "Perak", operatingHours: lateHours, currentlyOpen: false, badgeSlugs: ["hidden_gem"] },
    ],
    categories: ["food", "retail", "hidden_gem"],
    activityFacts: [facts(), facts({ category: "retail", typeSlugs: [], price: 0, requiresBooking: true, hiddenGem: true })],
  };
  const match = (patch: Partial<DiscoveryQuery>, vendorOverride: Partial<typeof partner> = {}) =>
    matchesPartnerFilters({ ...partner, ...vendorOverride }, { ...noFilters, ...patch });

  it.each<[string, Partial<DiscoveryQuery>, boolean]>([
    ["no filters", {}, true],
    ["query on vendor name", { q: "kopi" }, true],
    ["query on outlet city", { q: "ipoh" }, true],
    ["query with no match", { q: "langkawi" }, false],
    ["state with an outlet", { state: "Perak" }, true],
    ["state without an outlet", { state: "Sabah" }, false],
    ["All Malaysia ignores state", { state: "All Malaysia" }, true],
    ["open now", { openNow: true }, true],
    ["time at inside hours", { hoursMode: "at", timeAt: "10:00", operatingDays: ["mon"] }, true],
    ["time at outside hours", { hoursMode: "at", timeAt: "18:30", operatingDays: ["mon"] }, false],
    ["time window inside hours", { timeFrom: "10:00", timeTo: "12:00", operatingDays: ["mon"] }, true],
    ["overnight window needs the overnight flag", { timeFrom: "21:00", timeTo: "01:00", operatingDays: ["mon"] }, false],
    ["overnight window with the flag", { timeFrom: "21:00", timeTo: "01:00", operatingDays: ["mon"], overnight: true }, true],
    ["single category from card categories", { categories: ["food"] }, true],
    ["single category the vendor lacks", { categories: ["accommodation"] }, false],
    ["hidden gem collection", { hiddenGemOnly: true }, true],
    ["type within the category", { categories: ["food"], types: ["food:malay"] }, true],
    ["type the vendor lacks", { categories: ["food"], types: ["food:chinese"] }, false],
    ["maximum price", { priceMax: 5 }, true],
    ["maximum price below every product", { priceMax: -1 }, false],
    ["free only", { freeOnly: true }, true],
    ["bookable only", { bookableOnly: true }, true],
    ["family friendly outlet", { familyFriendlyOnly: true }, true],
    ["couple friendly outlet missing", { coupleFriendlyOnly: true }, false],
    ["combined filters on one product", { categories: ["retail"], freeOnly: true, bookableOnly: true }, true],
    ["combined filters split across products", { categories: ["food"], freeOnly: true }, false],
  ])("%s → %s", (_label, patch, expected) => {
    expect(match(patch)).toBe(expected);
  });

  it("matches hidden-gem categories through the outlet badge, not the card labels", () => {
    expect(match({ categories: ["hidden_gem"] }, { categories: [] })).toBe(true);
    expect(match({ categories: ["hidden_gem"] }, { outlets: [partner.outlets[0]] })).toBe(false);
  });

  it("requires a single selected category to be one of the card categories", () => {
    expect(match({ categories: ["retail"] }, { categories: ["food"] })).toBe(false);
  });

  it("rejects bookable-only and free-only filters when no product qualifies", () => {
    const vendor = { activityFacts: [facts({ requiresBooking: false, price: 10 })] };
    expect(match({ bookableOnly: true }, vendor)).toBe(false);
    expect(match({ freeOnly: true }, vendor)).toBe(false);
  });
});

describe("attachSponsoredOutletGalleryCovers", () => {
  it("uses the first curated photo for a sponsored outlet with no published Hero", () => {
    const sponsored = activity("sponsored");
    const organic = activity("organic");
    const result = attachSponsoredOutletGalleryCovers(
      [sponsored, organic],
      new Set(["sponsored"]),
      [
        { outletId: "outlet-sponsored", url: "later.jpg", mediaType: "gallery", sortOrder: 2 },
        { outletId: "outlet-sponsored", url: "first.jpg", mediaType: "gallery", sortOrder: 1 },
        { outletId: "outlet-sponsored", url: "logo.png", mediaType: "logo", sortOrder: -1 },
        { outletId: "outlet-organic", url: "organic.jpg", mediaType: "gallery", sortOrder: 1 },
      ],
    );

    expect(result[0].outlet.coverUrl).toContain("vendor-images/first.jpg");
    expect(result[1]).toBe(organic);
  });

  it("prefers an outlet gallery photo over its Hero and keeps the Hero when no gallery photo exists", () => {
    const withHero = activity("hero", {
      outlet: { ...activity("hero").outlet, coverUrl: "hero.jpg" },
    });
    const noPhoto = activity("empty", {
      outlet: { ...activity("empty").outlet, coverUrl: null },
    });
    const heroFallback = activity("hero-fallback", {
      outlet: { ...activity("hero-fallback").outlet, coverUrl: "fallback-hero.jpg" },
    });
    const result = attachSponsoredOutletGalleryCovers(
      [withHero, noPhoto, heroFallback],
      new Set(["hero", "empty", "hero-fallback"]),
      [{ outletId: "outlet-hero", url: "gallery.jpg", mediaType: "gallery", sortOrder: 1 }],
    );

    expect(result[0].outlet.coverUrl).toContain("vendor-images/gallery.jpg");
    expect(result[1].outlet.coverUrl).toBeNull();
    expect(result[2].outlet.coverUrl).toBe("fallback-hero.jpg");
  });
});
