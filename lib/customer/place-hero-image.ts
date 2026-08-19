import type { Place } from "@/backend/core/types";
import { MALAYSIA_DESTINATIONS } from "@/lib/customer/malaysia-destinations";

/**
 * Resolve a place hero without allowing a broad state image to leak into a
 * region or POI page. State pages reuse the same curated imagery shown in
 * Explore, with database imagery as a fallback when no curated image exists.
 */
export function getPlaceHeroImage(
  place: Pick<Place, "level" | "state" | "imageUrl">,
): string | null {
  if (place.level === "state") {
    return (
      MALAYSIA_DESTINATIONS.find((destination) => destination.state === place.state)?.image ??
      place.imageUrl ??
      null
    );
  }

  return place.imageUrl;
}
