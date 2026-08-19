import type { ComputedActivity } from "@/backend/core/types";
import { MALAYSIA_DESTINATIONS } from "@/lib/customer/malaysia-destinations";

// Single source of truth for state -> resolved Storage image URL; state
// names here are the full names (e.g. "Negeri Sembilan") that
// activity.outlet.state already carries, so no key normalization is needed.
const imageByState = new Map(MALAYSIA_DESTINATIONS.map((d) => [d.state, d.image]));
const FALLBACK_IMAGE = imageByState.get("Kuala Lumpur")!;

/** Use the destination image library so a hiking card never inherits a food photo. */
export function getPlaceActivityImage(activity: Pick<ComputedActivity, "name" | "outlet">): string {
  const haystack = `${activity.name} ${activity.outlet.city} ${activity.outlet.state}`.toLowerCase();

  if (/(hike|trek|trail|mount|waterfall|forest|geoforest|kayak|cave)/.test(haystack)) {
    if (haystack.includes("sabah") || haystack.includes("kinabalu")) return imageByState.get("Sabah") ?? FALLBACK_IMAGE;
    if (haystack.includes("sarawak") || haystack.includes("bako") || haystack.includes("mulu")) return imageByState.get("Sarawak") ?? FALLBACK_IMAGE;
    if (haystack.includes("kedah") || haystack.includes("langkawi") || haystack.includes("kilim")) return imageByState.get("Kedah") ?? FALLBACK_IMAGE;
    if (haystack.includes("pahang") || haystack.includes("tapis") || haystack.includes("cameron")) return imageByState.get("Pahang") ?? FALLBACK_IMAGE;
    if (haystack.includes("penang") || haystack.includes("monkey beach")) return imageByState.get("Penang") ?? FALLBACK_IMAGE;
  }

  return imageByState.get(activity.outlet.state) ?? FALLBACK_IMAGE;
}
