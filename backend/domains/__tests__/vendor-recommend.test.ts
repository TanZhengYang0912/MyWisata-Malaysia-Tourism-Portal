import { describe, expect, it } from "vitest";
import type { ComputedActivity, VendorSummary } from "@/backend/core/types";
import type { FeedItem } from "@/backend/domains/recommend";
import { rankFeaturedVendors, rankVendorsByPersonalizedFeed } from "@/backend/domains/vendor-recommend";

const vendor = (id: string, name: string, outletCount = 1): VendorSummary => ({
  id,
  name,
  status: "approved",
  logoUrl: null,
  coverUrl: null,
  outlets: Array.from({ length: outletCount }, (_, index) => ({
    id: `${id}-outlet-${index}`,
    name: `${name} outlet ${index + 1}`,
    city: "Kuala Lumpur",
    state: "Kuala Lumpur",
  })),
});

const activity = (vendorId: string, rating: number, reviews: number): ComputedActivity => ({
  id: `${vendorId}-${reviews}`,
  outletId: `${vendorId}-outlet-0`,
  name: `${vendorId} experience`,
  category: "Activity",
  categorySlug: "activity",
  description: "",
  image: "",
  price: 50,
  rating,
  reviews,
  duration: "",
  requiresBooking: false,
  variants: [],
  outlet: {
    id: `${vendorId}-outlet-0`,
    vendorId,
    name: `${vendorId} outlet`,
    category: "Activity",
    state: "Kuala Lumpur",
    city: "Kuala Lumpur",
    address: "",
    lat: 0,
    lng: 0,
    hours: "",
    verified: true,
    open: true,
    rating,
    reviews,
  },
});

const feedItem = (item: ComputedActivity, reason: FeedItem["reason"]): FeedItem => ({
  activity: item,
  reason,
  reasonLabel: reason ? "Matches your interests" : null,
});

describe("vendor recommendation ranking", () => {
  it("aggregates personalized activity order to one vendor and caps the rail", () => {
    const vendors = [vendor("a", "Alpha"), vendor("b", "Bravo"), vendor("c", "Charlie"), vendor("d", "Delta")];
    const feed = [
      feedItem(activity("b", 5, 5), "interests"),
      feedItem(activity("b", 4, 2), "near_you"),
      feedItem(activity("c", 5, 5), "similar"),
      feedItem(activity("a", 5, 5), "hidden_gem"),
    ];

    expect(rankVendorsByPersonalizedFeed(vendors, feed, 2).map((item) => item.id)).toEqual(["b", "c"]);
  });

  it("excludes vendors without a personalized activity match", () => {
    const vendors = [vendor("a", "Alpha"), vendor("b", "Bravo")];
    const feed = [feedItem(activity("a", 5, 5), "interests")];

    expect(rankVendorsByPersonalizedFeed(vendors, feed).map((item) => item.id)).toEqual(["a"]);
  });

  it("uses public quality first and active outlet count as the Featured fallback", () => {
    const vendors = [vendor("no-listing", "Zulu", 3), vendor("popular", "Popular"), vendor("steady", "Steady", 2)];
    const activities = [activity("steady", 4.5, 10), activity("popular", 5, 40)];

    expect(rankFeaturedVendors(vendors, activities).map((item) => item.id)).toEqual(["popular", "steady", "no-listing"]);
  });
});
