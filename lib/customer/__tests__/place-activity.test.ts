import { describe, expect, it } from "vitest";
import { getPlaceActivityImage } from "@/lib/customer/place-activity";
import type { ComputedActivity } from "@/backend/core/types";

function makeActivity(overrides: Partial<ComputedActivity> = {}): ComputedActivity {
  return {
    id: "a1", outletId: "o1", name: "Kinta Valley Limestone Hike", category: "Activity", description: "",
    image: "https://images.example.invalid/food.jpg", price: 65, rating: 0, reviews: 0, duration: "", requiresBooking: true,
    variants: [], categorySlug: "activity", typeSlugs: ["nature"], outlet: {
      id: "o1", vendorId: "v1", vendorName: "Explore Outdoors Malaysia", name: "Ipoh", category: "Activity",
      state: "Perak", city: "Ipoh", address: "", lat: 0, lng: 0, hours: "", verified: true, open: true, rating: 0, reviews: 0,
    },
    ...overrides,
  };
}

describe("getPlaceActivityImage", () => {
  it("uses the curated local image for a hiking activity instead of its generic product image", () => {
    expect(getPlaceActivityImage(makeActivity())).toBe("/assets/customer/malaysia/perak-kellies-castle.webp");
  });

  it("uses the destination image for a place whose route has no special image mapping", () => {
    expect(getPlaceActivityImage(makeActivity({ name: "Heritage route", outlet: { ...makeActivity().outlet, state: "Melaka", city: "Melaka" } })))
      .toBe("/assets/customer/malaysia/melaka-a-famosa.webp");
  });
});
