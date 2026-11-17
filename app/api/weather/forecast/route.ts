import { getTripById, getTripItems } from "@/backend/domains/trips";
import { getTripDayDates } from "@/lib/customer/trip-planner";
import { createClient } from "@/lib/supabase/server";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import { getOpenMeteoForecast } from "@/lib/weather/open-meteo";
import { evaluateForecastRisk, evaluateForecastRiskAtHour } from "@/lib/weather/risk";
import { weatherBatchRequestSchema } from "@/lib/weather/schema";
import type { NormalizedForecast, WeatherBatchResponse, WeatherTarget, WeatherTargetResult } from "@/lib/weather/types";
import { consumeWeatherForecastRateLimit } from "./route-state";

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

function targetIdentity(target: WeatherTarget) {
  return `${target.date}:${target.latitude.toFixed(4)}:${target.longitude.toFixed(4)}`;
}

function matchesItem(target: WeatherTarget, item: { id: string; lat: number; lng: number; scheduled_date: string | null; scheduled_time: string | null }) {
  return target.itemId === item.id
    && target.latitude.toFixed(4) === item.lat.toFixed(4)
    && target.longitude.toFixed(4) === item.lng.toFixed(4)
    && (target.kind !== "item" || (target.date === item.scheduled_date && target.scheduledTime === item.scheduled_time));
}

function unavailableFor(target: WeatherTarget): NormalizedForecast {
  return {
    availability: "unavailable",
    provider: "open_meteo",
    latitude: target.latitude,
    longitude: target.longitude,
    timezone: "",
    date: target.date,
    fetchedAt: new Date().toISOString(),
    stale: false,
    evidence: null,
    hours: [],
  };
}

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return privateResponse(apiFail("UNAUTHORIZED", "Sign in required", 401));
  if (!consumeWeatherForecastRateLimit(user.id)) {
    return privateResponse(apiFail("RATE_LIMITED", "Too many weather requests. Please try again shortly.", 429));
  }

  const limited = await limitedBodyRequest(request);
  if (limited instanceof Response) return limited;
  const parsed = await parseBody(limited, weatherBatchRequestSchema);
  if (!parsed.ok) return privateResponse(parsed.response);

  const trip = await getTripById(parsed.data.tripId, db);
  if (!trip) return privateResponse(apiFail("TRIP_NOT_FOUND", "Trip not found", 404));
  if (trip.user_id !== user.id) {
    return privateResponse(apiFail("FORBIDDEN", "Trip access denied", 403));
  }

  const items = await getTripItems(parsed.data.tripId, db);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const tripDays = new Set(getTripDayDates(trip));
  const invalidTarget = parsed.data.targets.find((target) => {
    const item = itemsById.get(target.itemId);
    return !item || !tripDays.has(target.date) || !matchesItem(target, item);
  });
  if (invalidTarget) {
    return privateResponse(apiFail("TARGET_NOT_IN_TRIP", "Weather target does not belong to this trip", 403));
  }

  const groups = new Map<string, WeatherTarget[]>();
  for (const target of parsed.data.targets) {
    const identity = targetIdentity(target);
    groups.set(identity, [...(groups.get(identity) ?? []), target]);
  }

  const resolveGroup = async (group: WeatherTarget[]) => {
    const representative = group[0];
    let forecast: NormalizedForecast;
    try {
      forecast = await getOpenMeteoForecast({
        latitude: representative.latitude,
        longitude: representative.longitude,
        date: representative.date,
      }, { signal: request.signal });
    } catch {
      forecast = unavailableFor(representative);
    }
    return group.map((target): [string, WeatherTargetResult] => {
      const scheduledHour = target.scheduledTime ? Number(target.scheduledTime.slice(0, 2)) : null;
      const risk = target.kind === "item" && scheduledHour !== null
        ? evaluateForecastRiskAtHour(forecast, scheduledHour)
        : evaluateForecastRisk(forecast);
      return [target.key, {
        target: { ...target, label: itemsById.get(target.itemId)?.label ?? target.label },
        forecast,
        risk,
      }];
    });
  };
  const entries: Array<Array<[string, WeatherTargetResult]>> = [];
  const groupList = [...groups.values()];
  // Bound each request's fanout too; the adapter independently caps real fetches
  // across route and Copilot consumers, after cache/in-flight coalescing.
  for (let offset = 0; offset < groupList.length; offset += 3) {
    entries.push(...await Promise.all(groupList.slice(offset, offset + 3).map(resolveGroup)));
  }

  const data: WeatherBatchResponse = { results: Object.fromEntries(entries.flat()) };
  return privateResponse(apiOk(data));
}
