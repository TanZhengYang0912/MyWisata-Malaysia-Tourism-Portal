import { describe, expect, it } from "vitest";
import { resolveOutletImage } from "@/lib/outlet-images";

describe("resolveOutletImage", () => {
  it("prefers an outlet hero image over a related place image", () => {
    expect(resolveOutletImage({
      outletName: "Kek Lok Si Temple — Main Entrance",
      outletHeroUrl: "https://example.com/outlet-hero.jpg",
      managedPlaceImages: [{ name: "Kek Lok Si Temple", imageUrl: "penang/kek-lok-si-temple.webp" }],
    })).toBe("https://example.com/outlet-hero.jpg");
  });

  it("uses the matching customer place image for an outlet", () => {
    expect(resolveOutletImage({
      outletName: "Kek Lok Si Temple — Main Entrance",
      outletHeroUrl: null,
      managedPlaceImages: [{ name: "Kek Lok Si Temple", imageUrl: "https://example.com/place.jpg" }],
    })).toBe("https://example.com/place.jpg");
  });

  it("does not assign an unrelated place image", () => {
    expect(resolveOutletImage({
      outletName: "Queensbay Mall",
      outletHeroUrl: null,
      managedPlaceImages: [{ name: "Kek Lok Si Temple", imageUrl: "https://example.com/place.jpg" }],
    })).toBeNull();
  });
});
