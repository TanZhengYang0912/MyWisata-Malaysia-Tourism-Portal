import type { TravelModeId } from "./travel-modes";

// OpenRouteService (free tier) routing profiles per travel mode. TRANSIT has no
// free routing option, so it stays null and the UI falls back to the Google
// Maps handoff for that mode.
export const ORS_PROFILE: Record<TravelModeId, string | null> = {
  DRIVING: "driving-car",
  WALKING: "foot-walking",
  BICYCLING: "cycling-regular",
  TRANSIT: null,
};

// Our app carries coordinates as [lat, lng]; ORS/GeoJSON use [lng, lat]. These
// two helpers are the single place that swap ordering — get it wrong and every
// route lands in the ocean, so they're what the test pins down.
export function toOrsCoordinates(points: [number, number][]): [number, number][] {
  return points.map(([lat, lng]) => [lng, lat]);
}

export function fromOrsCoordinates(coords: [number, number][]): [number, number][] {
  return coords.map(([lng, lat]) => [lat, lng]);
}

// OSRM public demo only hosts the car profile — used as the no-key fallback for
// DRIVING so the map draws routes without any signup. Walk/Cycle need ORS.
export const OSRM_PROFILE: Record<TravelModeId, string | null> = {
  DRIVING: "driving",
  WALKING: null,
  BICYCLING: null,
  TRANSIT: null,
};

// OSRM wants the path as "lng,lat;lng,lat;..." in the URL.
export function toOsrmPath(points: [number, number][]): string {
  return points.map(([lat, lng]) => `${lng},${lat}`).join(";");
}

export function summarizeRoute(distanceMeters: number, durationSeconds: number): { distanceKm: number; durationMin: number } {
  return {
    distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
    durationMin: Math.round(durationSeconds / 60),
  };
}

export interface RouteResult {
  geometry: [number, number][]; // [lat, lng][]
  distanceKm: number;
  durationMin: number;
  hasTolls?: boolean; // driving only; ORS tollways extra_info
}

export interface GeoHit {
  label: string;
  lat: number;
  lng: number;
}
