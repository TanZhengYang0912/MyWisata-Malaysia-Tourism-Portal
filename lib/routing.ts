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

export type RouteTrafficLevel = "normal" | "slow" | "congested" | "severe" | "unknown";

export interface RouteTrafficSegment {
  geometry: [number, number][]; // [lat, lng][]
  level: RouteTrafficLevel;
}

export interface RouteTraffic {
  provider: "mapbox";
  basis: "live" | "predicted";
  retrievedAt: string;
  segments: RouteTrafficSegment[];
}

export interface MapboxTrafficAnnotation {
  congestion?: string | null;
  congestion_numeric?: number | null;
}

export function normalizeMapboxTrafficLevel(category?: string | null, numeric?: number | null): RouteTrafficLevel {
  if (category === "low") return "normal";
  if (category === "moderate") return "slow";
  if (category === "heavy") return "congested";
  if (category === "severe") return "severe";

  if (typeof numeric !== "number" || !Number.isFinite(numeric)) return "unknown";
  if (numeric >= 75) return "severe";
  if (numeric >= 50) return "congested";
  if (numeric >= 25) return "slow";
  return "normal";
}

export function buildMapboxTrafficSegments(
  coordinates: [number, number][],
  annotations: MapboxTrafficAnnotation[],
): RouteTrafficSegment[] {
  if (coordinates.length < 2 || annotations.length !== coordinates.length - 1) return [];

  const segments: RouteTrafficSegment[] = [];
  for (let index = 0; index < annotations.length; index += 1) {
    const level = normalizeMapboxTrafficLevel(annotations[index].congestion, annotations[index].congestion_numeric);
    const start = fromOrsCoordinates([coordinates[index]])[0];
    const end = fromOrsCoordinates([coordinates[index + 1]])[0];
    const previous = segments.at(-1);
    if (previous?.level === level) {
      previous.geometry.push(end);
    } else {
      segments.push({ level, geometry: [start, end] });
    }
  }
  return segments;
}

export function buildRouteDepartureTime(
  date: string | null,
  scheduledTimes: Array<string | null | undefined>,
  now = new Date(),
): string | undefined {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const earliestTime = scheduledTimes
    .filter((time): time is string => typeof time === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    .sort()[0] ?? "12:00";
  const departure = new Date(`${date}T${earliestTime}:00+08:00`);
  if (!Number.isFinite(departure.getTime()) || departure.getTime() <= now.getTime()) return undefined;
  return departure.toISOString();
}

export interface RouteResult {
  geometry: [number, number][]; // [lat, lng][]
  distanceKm: number;
  durationMin: number;
  hasTolls?: boolean; // driving only; ORS tollways extra_info
  traffic?: RouteTraffic;
}

export interface GeoHit {
  label: string;
  lat: number;
  lng: number;
}
