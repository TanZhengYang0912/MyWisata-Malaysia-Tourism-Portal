import { z } from "zod";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import { ORS_PROFILE, OSRM_PROFILE, fromOrsCoordinates, summarizeRoute, toOrsCoordinates, toOsrmPath, type RouteResult } from "@/lib/routing";
import type { TravelModeId } from "@/lib/travel-modes";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  mode: z.enum(["DRIVING", "WALKING", "BICYCLING", "TRANSIT"]),
  points: z.array(z.tuple([z.number(), z.number()])).min(2).max(50),
});

// Returns one or more route options (geometry + time + distance + toll flag):
//  • ORS when ORS_API_KEY is set — drive/walk/cycle, with alternative routes +
//    toll detection for a simple 2-point driving trip.
//  • OSRM public demo as a no-key fallback — DRIVING only (with alternatives, no tolls).
// Transit has no free routing (Google Maps handoff).
export async function POST(request: Request) {
  const parsed = await parseBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const mode = parsed.data.mode as TravelModeId;
  const points = parsed.data.points as [number, number][];
  if (!ORS_PROFILE[mode]) return apiFail("unsupported_mode", "This travel mode has no free in-app route.", 400);

  const key = process.env.ORS_API_KEY;
  if (key) {
    const routes = await routeViaOrs(mode, points, key);
    if (routes && routes.length) return apiOk({ routes });
  }

  if (OSRM_PROFILE[mode]) {
    const routes = await routeViaOsrm(mode, points);
    if (routes && routes.length) return apiOk({ routes });
    return apiFail("no_route", "No route available for this mode.", 502);
  }

  return apiFail("no_key", "Walk and Cycle routes need a free ORS key; only Drive works without one.", 503);
}

// ORS marks tollway segments in properties.extras.tollways.summary (value != 0).
function hasTolls(properties: { extras?: { tollways?: { summary?: Array<{ value?: number; distance?: number }> } } }): boolean {
  return (properties.extras?.tollways?.summary ?? []).some((s) => (s.value ?? 0) !== 0 && (s.distance ?? 0) > 0);
}

async function routeViaOrs(mode: TravelModeId, points: [number, number][], key: string): Promise<RouteResult[] | null> {
  const isDriving = mode === "DRIVING";
  // Alternatives require exactly 2 coordinates (ORS can't alt-route through waypoints).
  const wantsAlternatives = isDriving && points.length === 2;
  const body: Record<string, unknown> = { coordinates: toOrsCoordinates(points) };
  if (isDriving) body.extra_info = ["tollways"];
  if (wantsAlternatives) body.alternative_routes = { target_count: 3, share_factor: 0.6, weight_factor: 1.6 };

  try {
    const res = await fetch(`https://api.openrouteservice.org/v2/directions/${ORS_PROFILE[mode]}/geojson`, {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const geojson = (await res.json()) as {
      features?: Array<{
        geometry?: { coordinates?: [number, number][] };
        properties?: { summary?: { distance?: number; duration?: number }; extras?: { tollways?: { summary?: Array<{ value?: number; distance?: number }> } } };
      }>;
    };
    const routes = (geojson.features ?? [])
      .map((f): RouteResult | null => {
        const coords = f.geometry?.coordinates;
        const summary = f.properties?.summary;
        if (!coords || !summary) return null;
        return {
          geometry: fromOrsCoordinates(coords),
          ...summarizeRoute(summary.distance ?? 0, summary.duration ?? 0),
          hasTolls: isDriving ? hasTolls(f.properties ?? {}) : false,
        };
      })
      .filter((r): r is RouteResult => r !== null);
    return routes.length ? routes : null;
  } catch {
    return null;
  }
}

async function routeViaOsrm(mode: TravelModeId, points: [number, number][]): Promise<RouteResult[] | null> {
  try {
    const path = toOsrmPath(points);
    const res = await fetch(`https://router.project-osrm.org/route/v1/${OSRM_PROFILE[mode]}/${path}?overview=full&geometries=geojson&alternatives=3`);
    if (!res.ok) return null;
    const body = (await res.json()) as {
      routes?: Array<{ geometry?: { coordinates?: [number, number][] }; distance?: number; duration?: number }>;
    };
    const routes = (body.routes ?? [])
      .map((r): RouteResult | null => {
        const coords = r.geometry?.coordinates;
        if (!coords) return null;
        return { geometry: fromOrsCoordinates(coords), ...summarizeRoute(r.distance ?? 0, r.duration ?? 0), hasTolls: false };
      })
      .filter((r): r is RouteResult => r !== null);
    return routes.length ? routes : null;
  } catch {
    return null;
  }
}
