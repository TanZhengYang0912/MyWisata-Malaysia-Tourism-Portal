import type { DemoLocation, DemoPlace, DemoPlaceWithDistance, DemoPreferences, TravelMode } from "./types";

export const DEMO_PREFERENCES_KEY = "ip-copy-demo-map-v1";
export const DEFAULT_DEMO_PREFERENCES: DemoPreferences = { category: null, radiusKm: 50, selectedStateId: null, savedPlaceIds: [] };

export function haversineKm(from: DemoLocation, to: DemoLocation): number {
  const earthRadiusKm = 6371;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function filterPlaces(
  places: DemoPlace[],
  filters: { category?: string | null; stateId?: string | null; near?: DemoLocation; radiusKm?: number },
): DemoPlaceWithDistance[] {
  return places
    .map((place) => ({ ...place, distanceKm: filters.near ? haversineKm(filters.near, { lat: place.lat, lng: place.lng }) : undefined }))
    .filter((place) => !filters.category || place.category === filters.category)
    .filter((place) => !filters.stateId || place.stateId === filters.stateId)
    .filter((place) => !filters.near || filters.radiusKm === undefined || (place.distanceKm ?? Infinity) <= filters.radiusKm)
    .sort((a, b) => filters.near ? (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) : b.rating - a.rating);
}

export function serializeDemoPreferences(preferences: DemoPreferences): string {
  return JSON.stringify(preferences);
}

export function parseDemoPreferences(value: string | null): DemoPreferences {
  if (!value) return DEFAULT_DEMO_PREFERENCES;
  try {
    const parsed = JSON.parse(value) as Partial<DemoPreferences>;
    return {
      category: typeof parsed.category === "string" ? parsed.category : null,
      radiusKm: typeof parsed.radiusKm === "number" ? parsed.radiusKm : DEFAULT_DEMO_PREFERENCES.radiusKm,
      selectedStateId: typeof parsed.selectedStateId === "string" ? parsed.selectedStateId : null,
      savedPlaceIds: Array.isArray(parsed.savedPlaceIds) ? parsed.savedPlaceIds.filter((id): id is string => typeof id === "string") : [],
    };
  } catch {
    return DEFAULT_DEMO_PREFERENCES;
  }
}

export function loadDemoPreferences(): DemoPreferences {
  if (typeof window === "undefined") return DEFAULT_DEMO_PREFERENCES;
  try {
    return parseDemoPreferences(window.localStorage.getItem(DEMO_PREFERENCES_KEY));
  } catch {
    return DEFAULT_DEMO_PREFERENCES;
  }
}

export function saveDemoPreferences(preferences: DemoPreferences): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DEMO_PREFERENCES_KEY, serializeDemoPreferences(preferences));
  } catch {
    // Local persistence is optional; browsing the demo must continue if storage is blocked.
  }
}

export function buildDirectionsUrl(place: DemoPlace, mode: TravelMode, origin?: DemoLocation): string {
  const params = new URLSearchParams({ api: "1", destination: `${place.lat},${place.lng}`, travelmode: mode });
  if (origin) params.set("origin", `${origin.lat},${origin.lng}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export { getRouteSummary } from "./data";
