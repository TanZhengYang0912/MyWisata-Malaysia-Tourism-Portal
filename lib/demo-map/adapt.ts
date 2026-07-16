import type { ComputedActivity } from "@/backend/core/types";
import type { MapPlace } from "./types";

/** "Kuala Lumpur" -> "kuala-lumpur" — matches the ids in DEMO_STATES. */
export function slugifyState(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "-");
}

export function activityToMapPlace(activity: ComputedActivity): MapPlace {
  return {
    id: activity.id,
    name: activity.name,
    stateId: slugifyState(activity.outlet.state),
    lat: activity.outlet.lat,
    lng: activity.outlet.lng,
    category: activity.category,
    city: activity.outlet.city,
    rating: activity.rating,
    reviews: activity.reviews,
    price: activity.price,
    distanceKm: activity.distanceKm,
  };
}
