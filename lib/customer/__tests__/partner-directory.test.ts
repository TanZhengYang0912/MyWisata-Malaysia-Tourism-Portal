import { describe, expect, it } from "vitest";
import type { ComputedActivity, SponsoredPlacement, VendorSummary } from "@/backend/core/types";
import {
  attachSponsoredOutletGalleryCovers,
  rankPartnerDirectory,
  selectPartnerAdvertisements,
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
    const hiddenGem = activity("hidden", { isHiddenGem: true, categorySlug: "food" });
    const ordinary = activity("ordinary", { isHiddenGem: false, categorySlug: "food" });

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
