import { getTripById, getTripItems } from "@/backend/domains/trips";
import { getTripDayDates, isValidTripCoordinate } from "@/lib/customer/trip-planner";
import { createClient } from "@/lib/supabase/server";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import { buildWeatherSampleGrid } from "@/lib/weather/overlay";
import { getOpenMeteoOverlay } from "@/lib/weather/open-meteo-overlay";
import { weatherOverlayRequestSchema } from "@/lib/weather/schema";
import { consumeWeatherOverlayRateLimit, withWeatherOverlayProviderSlot } from "./route-state";

export const dynamic = "force-dynamic";

const MAX_REQUEST_BYTES = 32 * 1024;

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

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return privateResponse(apiFail("UNAUTHORIZED", "Sign in required", 401));
  if (!consumeWeatherOverlayRateLimit(user.id)) return privateResponse(apiFail("RATE_LIMITED", "Too many weather requests", 429));

  const limited = await limitedBodyRequest(request);
  if (limited instanceof Response) return limited;
  const parsed = await parseBody(limited, weatherOverlayRequestSchema);
  if (!parsed.ok) return privateResponse(parsed.response);

  const trip = await getTripById(parsed.data.tripId, db);
  if (!trip) return privateResponse(apiFail("TRIP_NOT_FOUND", "Trip not found", 404));
  if (trip.user_id !== user.id) return privateResponse(apiFail("FORBIDDEN", "Trip access denied", 403));
  if (!getTripDayDates(trip).includes(parsed.data.date)) {
    return privateResponse(apiFail("DATE_NOT_IN_TRIP", "Weather date does not belong to this trip", 403));
  }

  const items = await getTripItems(parsed.data.tripId, db);
  const origin = items.find((item) => item.source === "location" && isValidTripCoordinate(item.lat, item.lng));
  const dated = items.filter((item) => item.scheduled_date === parsed.data.date && isValidTripCoordinate(item.lat, item.lng));
  const coordinateItems = [...(origin ? [origin] : []), ...dated.filter((item) => item.id !== origin?.id)];
  const coordinates = buildWeatherSampleGrid(coordinateItems.map((item) => ({ lat: item.lat, lng: item.lng })));
  if (coordinates.length === 0) return privateResponse(apiFail("NO_VALID_COORDINATES", "Trip has no valid weather coordinates", 422));

  const overlay = await withWeatherOverlayProviderSlot(() => getOpenMeteoOverlay({
    coordinates,
    date: parsed.data.date,
    hour: parsed.data.hour,
  }));
  return privateResponse(apiOk(overlay));
}
