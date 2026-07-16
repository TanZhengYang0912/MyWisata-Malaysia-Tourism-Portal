import { Bike, Bus, Car, Footprints } from "lucide-react";

export const TRAVEL_MODES = [
  { id: "DRIVING", urlParam: "driving", label: "Drive", icon: Car },
  { id: "WALKING", urlParam: "walking", label: "Walk", icon: Footprints },
  { id: "BICYCLING", urlParam: "bicycling", label: "Cycle", icon: Bike },
  { id: "TRANSIT", urlParam: "transit", label: "Transit", icon: Bus },
] as const;

export type TravelModeId = (typeof TRAVEL_MODES)[number]["id"];

// Google's consumer "dir" URL supports an origin, a destination and up to 9
// intermediate waypoints — anything beyond that is silently dropped.
const MAX_WAYPOINTS = 9;

export function buildGoogleMapsDirectionsUrl(
  origin: { lat: number; lng: number } | null,
  stops: { lat: number; lng: number }[],
  mode: TravelModeId,
): string | null {
  if (stops.length === 0) return null;
  const capped = stops.slice(0, MAX_WAYPOINTS);
  const destination = capped[capped.length - 1];
  const waypoints = capped.slice(0, -1);

  const params = new URLSearchParams({
    api: "1",
    destination: `${destination.lat},${destination.lng}`,
    travelmode: TRAVEL_MODES.find((m) => m.id === mode)!.urlParam,
  });
  if (origin) params.set("origin", `${origin.lat},${origin.lng}`);
  if (waypoints.length > 0) params.set("waypoints", waypoints.map((w) => `${w.lat},${w.lng}`).join("|"));

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
