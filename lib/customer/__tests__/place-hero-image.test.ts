import { describe, expect, it } from "vitest";
import { MALAYSIA_DESTINATIONS } from "@/lib/customer/malaysia-destinations";
import { getPlaceHeroImage } from "@/lib/customer/place-hero-image";

describe("getPlaceHeroImage", () => {
  it("resolves the curated image for every state destination", () => {
    expect(
      MALAYSIA_DESTINATIONS.every((destination) =>
        Boolean(getPlaceHeroImage({ level: "state", state: destination.state, imageUrl: null })),
      ),
    ).toBe(true);
  });

  it("reuses the Explore image ahead of a legacy state database image", () => {
    expect(
      getPlaceHeroImage({
        level: "state",
        state: "Kelantan",
        imageUrl: "https://example.com/legacy-kelantan.jpg",
      }),
    ).toContain(
      "/storage/v1/object/public/place-images/malaysia/kelantan-siti-khadijah-market.webp",
    );
  });

  it("does not apply a broad state image to region or POI pages", () => {
    expect(getPlaceHeroImage({ level: "region", state: "Kedah", imageUrl: null })).toBeNull();
    expect(getPlaceHeroImage({ level: "poi", state: "Kedah", imageUrl: null })).toBeNull();
  });
});
