import { z } from "zod";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import {
  ORS_PROFILE,
  OSRM_PROFILE,
  buildMapboxTrafficSegments,
  fromOrsCoordinates,
  summarizeRoute,
  toOrsCoordinates,
  toOsrmPath,
  type MapboxTrafficAnnotation,
  type RouteResult,
} from "@/lib/routing";
import type { TravelModeId } from "@/lib/travel-modes";
import { createClient } from "@/lib/supabase/server";
import { consumeRouteRateLimit, withRouteProviderSlot } from "./route-state";

export const dynamic = "force-dynamic";

const coordinateSchema = z.tuple([
  z.number().finite().min(-90).max(90),
  z.number().finite().min(-180).max(180),
]);

const bodySchema = z.object({
  mode: z.enum(["DRIVING", "WALKING", "BICYCLING", "TRANSIT"]),
  points: z.array(coordinateSchema).min(2).max(25),
  departureTime: z.string().datetime({ offset: true }).optional(),
}).strict();

const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_PROVIDER_BYTES = 2 * 1024 * 1024;

function privateResponse(response: Response) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}

async function limitedBodyRequest(request: Request): Promise<Request | Response> {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BYTES) {
    return privateResponse(apiFail("PAYLOAD_TOO_LARGE", "Request body is too large", 413));
  }
  if (!request.body) return new Request(request.url, { method: "POST", body: "" });

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BYTES) {
      await reader.cancel();
      return privateResponse(apiFail("PAYLOAD_TOO_LARGE", "Request body is too large", 413));
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(request.url, {
    method: "POST",
    headers: { "content-type": request.headers.get("content-type") ?? "application/json" },
    body: new TextDecoder().decode(bytes),
  });
}

async function readProviderJson(response: Response): Promise<unknown | null> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (!response.body) return null;
  const reader = response.body.getReader();
  if (Number.isFinite(declaredLength) && declaredLength > MAX_PROVIDER_BYTES) {
    await reader.cancel();
    return null;
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PROVIDER_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

// Returns one or more route options (geometry + time + distance + toll flag):
//  • ORS when ORS_API_KEY is set — drive/walk/cycle, with alternative routes +
//    toll detection for a simple 2-point driving trip.
//  • OSRM public demo as a no-key fallback — DRIVING only (with alternatives, no tolls).
// Transit has no free routing (Google Maps handoff).
export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return privateResponse(apiFail("UNAUTHORIZED", "Sign in required", 401));
  if (!consumeRouteRateLimit(user.id)) return privateResponse(apiFail("RATE_LIMITED", "Too many route requests", 429));

  const limited = await limitedBodyRequest(request);
  if (limited instanceof Response) return limited;
  const parsed = await parseBody(limited, bodySchema);
  if (!parsed.ok) return privateResponse(parsed.response);

  const mode = parsed.data.mode as TravelModeId;
  const points = parsed.data.points as [number, number][];
  if (!ORS_PROFILE[mode]) return privateResponse(apiFail("unsupported_mode", "This travel mode has no free in-app route.", 400));

  const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
  if (mode === "DRIVING" && mapboxToken) {
    const routes = await withRouteProviderSlot(() => routeViaMapbox(points, mapboxToken, parsed.data.departureTime));
    if (routes?.length) return privateResponse(apiOk({ routes }));
  }

  const key = process.env.ORS_API_KEY;
  if (key) {
    const routes = await withRouteProviderSlot(() => routeViaOrs(mode, points, key));
    if (routes && routes.length) return privateResponse(apiOk({ routes }));
  }

  if (OSRM_PROFILE[mode]) {
    const routes = await withRouteProviderSlot(() => routeViaOsrm(mode, points));
    if (routes && routes.length) return privateResponse(apiOk({ routes }));
    return privateResponse(apiFail("no_route", "No route available for this mode.", 502));
  }

  return privateResponse(apiFail("no_key", "Walk and Cycle routes need a free ORS key; only Drive works without one.", 503));
}

const providerCoordinateSchema = z.tuple([
  z.number().finite().min(-180).max(180),
  z.number().finite().min(-90).max(90),
]);
const providerCoordinatesSchema = z.array(providerCoordinateSchema).min(2).max(50_000);
const routeMetricSchema = z.number().finite().nonnegative();
const mapboxRouteSchema = z.object({
  geometry: z.object({ coordinates: providerCoordinatesSchema }),
  distance: routeMetricSchema,
  duration: routeMetricSchema,
  legs: z.array(z.object({
    annotation: z.object({
      congestion: z.array(z.enum(["unknown", "low", "moderate", "heavy", "severe"]).nullable()).max(50_000).optional(),
      congestion_numeric: z.array(z.number().finite().min(0).max(100).nullable()).max(50_000).optional(),
    }).optional(),
  })).max(25).optional(),
});
const mapboxResponseSchema = z.object({ routes: z.array(mapboxRouteSchema).max(3) });
type MapboxRoute = z.infer<typeof mapboxRouteSchema>;

const orsFeatureSchema = z.object({
  geometry: z.object({ coordinates: providerCoordinatesSchema }),
  properties: z.object({
    summary: z.object({ distance: routeMetricSchema, duration: routeMetricSchema }),
    extras: z.object({
      tollways: z.object({
        summary: z.array(z.object({ value: z.number().finite().optional(), distance: routeMetricSchema.optional() })).max(10_000).optional(),
      }).optional(),
    }).optional(),
  }),
});
const orsResponseSchema = z.object({ features: z.array(orsFeatureSchema).max(3) });
const osrmResponseSchema = z.object({
  routes: z.array(z.object({
    geometry: z.object({ coordinates: providerCoordinatesSchema }),
    distance: routeMetricSchema,
    duration: routeMetricSchema,
  })).max(3),
});

function mapboxAnnotations(route: MapboxRoute, segmentCount: number): MapboxTrafficAnnotation[] {
  const categories = (route.legs ?? []).flatMap((leg) => leg.annotation?.congestion ?? []);
  const numeric = (route.legs ?? []).flatMap((leg) => leg.annotation?.congestion_numeric ?? []);
  if (categories.length !== segmentCount && numeric.length !== segmentCount) return [];
  return Array.from({ length: segmentCount }, (_, index) => ({
    congestion: categories.length === segmentCount ? categories[index] : undefined,
    congestion_numeric: numeric.length === segmentCount ? numeric[index] : undefined,
  }));
}

async function routeViaMapbox(points: [number, number][], token: string, departureTime?: string): Promise<RouteResult[] | null> {
  const params = new URLSearchParams({
    access_token: token,
    alternatives: "true",
    annotations: "congestion,congestion_numeric",
    depart_at: departureTime ?? "now",
    geometries: "geojson",
    overview: "full",
    steps: "false",
  });
  const path = toOsrmPath(points);
  try {
    const response = await fetch(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${path}?${params.toString()}`, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return null;
    const parsed = mapboxResponseSchema.safeParse(await readProviderJson(response));
    if (!parsed.success) return null;
    const retrievedAt = new Date().toISOString();
    const routes = parsed.data.routes.map((route): RouteResult | null => {
      const coordinates = route.geometry.coordinates;
      const annotations = mapboxAnnotations(route, coordinates.length - 1);
      const segments = buildMapboxTrafficSegments(coordinates, annotations);
      const hasKnownTraffic = segments.some((segment) => segment.level !== "unknown");
      return {
        geometry: fromOrsCoordinates(coordinates),
        ...summarizeRoute(route.distance, route.duration),
        ...(hasKnownTraffic ? {
          traffic: {
            provider: "mapbox" as const,
            basis: departureTime ? "predicted" as const : "live" as const,
            retrievedAt,
            segments,
          },
        } : {}),
      };
    }).filter((route): route is RouteResult => route !== null);
    return routes.length ? routes : null;
  } catch {
    return null;
  }
}

// ORS marks tollway segments in properties.extras.tollways.summary (value != 0).
function hasTolls(properties: { extras?: { tollways?: { summary?: Array<{ value?: number; distance?: number }> } } }): boolean {
  return (properties.extras?.tollways?.summary ?? []).some((s) => (s.value ?? 0) !== 0 && (s.distance ?? 0) > 0);
}

async function routeViaOrs(mode: TravelModeId, points: [number, number][], key: string): Promise<RouteResult[] | null> {
  const isDriving = mode === "DRIVING";
  // Alternatives require exactly 2 coordinates (ORS can't alt-route through waypoints).
  const wantsAlternatives = points.length === 2;

  if (wantsAlternatives) {
    const routes = await fetchOrsRoutes(mode, points, key, isDriving, true);
    if (routes) return routes;
    // ORS's alternative_routes option is only reliably documented for driving-car —
    // walk/cycle may reject it outright. Retry without it rather than losing the route.
  }
  return fetchOrsRoutes(mode, points, key, isDriving, false);
}

async function fetchOrsRoutes(mode: TravelModeId, points: [number, number][], key: string, isDriving: boolean, withAlternatives: boolean): Promise<RouteResult[] | null> {
  const body: Record<string, unknown> = { coordinates: toOrsCoordinates(points) };
  if (isDriving) body.extra_info = ["tollways"];
  if (withAlternatives) body.alternative_routes = { target_count: 3, share_factor: 0.6, weight_factor: 1.6 };

  try {
    const res = await fetch(`https://api.openrouteservice.org/v2/directions/${ORS_PROFILE[mode]}/geojson`, {
      method: "POST",
      headers: { Authorization: key, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const parsed = orsResponseSchema.safeParse(await readProviderJson(res));
    if (!parsed.success) return null;
    const routes = parsed.data.features
      .map((f): RouteResult | null => {
        const coords = f.geometry.coordinates;
        const summary = f.properties.summary;
        return {
          geometry: fromOrsCoordinates(coords),
          ...summarizeRoute(summary.distance, summary.duration),
          hasTolls: isDriving ? hasTolls(f.properties) : false,
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
    const res = await fetch(`https://router.project-osrm.org/route/v1/${OSRM_PROFILE[mode]}/${path}?overview=full&geometries=geojson&alternatives=3`, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const parsed = osrmResponseSchema.safeParse(await readProviderJson(res));
    if (!parsed.success) return null;
    const routes = parsed.data.routes
      .map((r): RouteResult | null => {
        const coords = r.geometry.coordinates;
        return { geometry: fromOrsCoordinates(coords), ...summarizeRoute(r.distance, r.duration), hasTolls: false };
      })
      .filter((r): r is RouteResult => r !== null);
    return routes.length ? routes : null;
  } catch {
    return null;
  }
}
