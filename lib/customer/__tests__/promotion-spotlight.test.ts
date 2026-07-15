import { describe, expect, it } from "vitest";
import { buildPromotionSpotlight } from "@/lib/customer/promotion-spotlight";
import type { ComputedActivity } from "@/backend/core/types";

function activity(overrides: Partial<ComputedActivity> = {}): ComputedActivity {
  return {
    id: "activity-1",
    outletId: "outlet-1",
    name: "Local Experience",
    category: "Culture",
    description: "A local experience.",
    image: "https://example.com/activity.jpg",
    price: 80,
    rating: 4.8,
    reviews: 12,
    duration: "2 hours",
    requiresBooking: false,
    variants: [],
    outlet: {
      id: "outlet-1",
      vendorId: "vendor-1",
      vendorName: "Local Host",
      name: "Local Outlet",
      category: "Culture",
      state: "Kuala Lumpur",
      city: "Kuala Lumpur",
      address: "Malaysia",
      lat: 3.139,
      lng: 101.6869,
      hours: "9:00 AM - 6:00 PM",
      verified: true,
      open: true,
      rating: 4.8,
      reviews: 12,
    },
    ...overrides,
  };
}

describe("buildPromotionSpotlight", () => {
  it("builds at most three real-data promotion cards with activity routes", () => {
    const promotions = buildPromotionSpotlight([
      activity({ id: "food-1", category: "Food & Dining", name: "Night Market Bites" }),
      activity({ id: "borneo-1", outlet: { ...activity().outlet, state: "Sabah", city: "Kota Kinabalu" } }),
      activity({ id: "culture-1", name: "Batik Workshop" }),
    ]);

    expect(promotions).toHaveLength(3);
    expect(promotions.every((promotion) => promotion.href.startsWith("/customer/activity/"))).toBe(true);
    expect(new Set(promotions.map((promotion) => promotion.activityId)).size).toBe(3);
  });

  it("returns no cards when there are no activities to promote", () => {
    expect(buildPromotionSpotlight([])).toEqual([]);
  });
});
