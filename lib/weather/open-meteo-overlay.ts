import "server-only";

import { z } from "zod";
import { buildPrecipitationContours, buildWeatherConditionContours, MAX_OVERLAY_SAMPLES } from "@/lib/weather/overlay";
import {
  FORECAST_MAX_RESPONSE_BYTES,
  FORECAST_STALE_SECONDS,
  FORECAST_TIMEOUT_MS,
  FORECAST_TTL_SECONDS,
  OPEN_METEO_PROVIDER,
} from "@/lib/weather/open-meteo";
import type { WeatherOverlayResult, WeatherOverlaySample } from "@/lib/weather/types";

type OverlayInput = {
  coordinates: Array<{ latitude: number; longitude: number }>;
  date: string;
  hour: number;
};

type CacheEntry = { value: WeatherOverlayResult; freshUntil: number; staleUntil: number };

const completed = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<WeatherOverlayResult>>();
const nullableNumbers = z.array(z.number().finite().nullable()).min(1);
const locationSchema = z.object({
  latitude: z.number().finite(),
  longitude: z.number().finite(),
  timezone: z.string().min(1),
  hourly: z.object({
    time: z.array(z.string()).min(1),
    precipitation: z.array(z.number().finite()).min(1),
    precipitation_probability: nullableNumbers,
    weather_code: nullableNumbers,
    cloud_cover: nullableNumbers,
    wind_speed_10m: nullableNumbers,
    wind_direction_10m: nullableNumbers,
  }).passthrough(),
}).passthrough();
const payloadSchema = z.union([locationSchema, z.array(locationSchema).min(1)]);

function rounded(value: number) {
  return Number(value.toFixed(4));
}

function dayDifference(date: string, now: Date) {
  const target = Date.parse(`${date}T00:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const today = Date.parse(`${values.year}-${values.month}-${values.day}T00:00:00Z`);
  return Number.isFinite(target) ? Math.round((target - today) / 86_400_000) : Number.NaN;
}

function cacheKey(input: OverlayInput) {
  return `${input.date}:${input.hour}:${input.coordinates.map(({ latitude, longitude }) => `${rounded(latitude)},${rounded(longitude)}`).join("|")}`;
}

function emptyResult(input: OverlayInput, fetchedAt: string, availability: WeatherOverlayResult["availability"] = "unavailable"): WeatherOverlayResult {
  return {
    availability,
    provider: OPEN_METEO_PROVIDER,
    date: input.date,
    hour: input.hour,
    timezone: "",
    fetchedAt,
    stale: false,
    bounds: null,
    samples: [],
    contours: { type: "FeatureCollection", features: [] },
    conditionContours: { type: "FeatureCollection", features: [] },
    rainBoundary: { type: "FeatureCollection", features: [] },
    dominantCenter: null,
  };
}

async function readResponseTextWithLimit(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > FORECAST_MAX_RESPONSE_BYTES) throw new Error("Open-Meteo response is too large");
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > FORECAST_MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("Open-Meteo response is too large");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function validInput(input: OverlayInput) {
  return input.coordinates.length > 0 && input.coordinates.length <= MAX_OVERLAY_SAMPLES
    && Number.isInteger(input.hour) && input.hour >= 0 && input.hour <= 23
    && input.coordinates.every(({ latitude, longitude }) => Number.isFinite(latitude) && Number.isFinite(longitude)
      && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180);
}

function metricAt(values: Array<number | null>, index: number) {
  const value = values[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeSamples(input: OverlayInput, payload: z.infer<typeof payloadSchema>) {
  const locations = Array.isArray(payload) ? payload : [payload];
  if (locations.length !== input.coordinates.length) throw new Error("Open-Meteo location count mismatch");
  const samples: WeatherOverlaySample[] = locations.map((location, locationIndex) => {
    const requested = input.coordinates[locationIndex];
    if (Math.abs(location.latitude - requested.latitude) > 0.25 || Math.abs(location.longitude - requested.longitude) > 0.25) {
      throw new Error("Open-Meteo coordinate mismatch");
    }
    const timeIndex = location.hourly.time.indexOf(`${input.date}T${String(input.hour).padStart(2, "0")}:00`);
    if (timeIndex < 0 || typeof location.hourly.precipitation[timeIndex] !== "number") throw new Error("Open-Meteo hour mismatch");
    return {
      latitude: rounded(requested.latitude),
      longitude: rounded(requested.longitude),
      precipitationMm: Math.max(0, location.hourly.precipitation[timeIndex]),
      precipitationProbability: metricAt(location.hourly.precipitation_probability, timeIndex),
      weatherCode: metricAt(location.hourly.weather_code, timeIndex),
      cloudCover: metricAt(location.hourly.cloud_cover, timeIndex),
      windSpeedKmh: metricAt(location.hourly.wind_speed_10m, timeIndex),
      windDirectionDeg: metricAt(location.hourly.wind_direction_10m, timeIndex),
    };
  });
  return { samples, timezone: locations[0].timezone };
}

function pruneCache() {
  if (completed.size <= 100) return;
  const oldest = [...completed.entries()].sort((a, b) => Date.parse(a[1].value.fetchedAt) - Date.parse(b[1].value.fetchedAt))[0];
  if (oldest) completed.delete(oldest[0]);
}

export function __resetOpenMeteoOverlayCacheForTests() {
  completed.clear();
  inFlight.clear();
}

export async function getOpenMeteoOverlay(
  input: OverlayInput,
  options?: { fetcher?: typeof fetch; now?: () => Date },
): Promise<WeatherOverlayResult> {
  const now = options?.now?.() ?? new Date();
  const fetchedAt = now.toISOString();
  const days = dayDifference(input.date, now);
  if (!validInput(input) || !Number.isFinite(days) || days < 0) return emptyResult(input, fetchedAt);
  if (days > 15) return emptyResult(input, fetchedAt, "unavailable_yet");

  const key = cacheKey(input);
  const nowMs = now.getTime();
  const cached = completed.get(key);
  if (cached && cached.freshUntil > nowMs) return cached.value;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FORECAST_TIMEOUT_MS);
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", input.coordinates.map(({ latitude }) => latitude.toFixed(4)).join(","));
      url.searchParams.set("longitude", input.coordinates.map(({ longitude }) => longitude.toFixed(4)).join(","));
      url.searchParams.set("start_date", input.date);
      url.searchParams.set("end_date", input.date);
      url.searchParams.set("timezone", "auto");
      url.searchParams.set("wind_speed_unit", "kmh");
      url.searchParams.set("precipitation_unit", "mm");
      url.searchParams.set("hourly", [
        "precipitation",
        "precipitation_probability",
        "weather_code",
        "cloud_cover",
        "wind_speed_10m",
        "wind_direction_10m",
      ].join(","));

      const response = await (options?.fetcher ?? fetch)(url, { cache: "no-store", redirect: "error", signal: controller.signal });
      if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}`);
      const parsed = payloadSchema.safeParse(JSON.parse(await readResponseTextWithLimit(response)));
      if (!parsed.success) throw new Error("Open-Meteo overlay response is malformed");
      const normalized = normalizeSamples(input, parsed.data);
      const geometry = buildPrecipitationContours(normalized.samples);
      const conditionContours = buildWeatherConditionContours(normalized.samples);
      const value: WeatherOverlayResult = {
        availability: "forecast",
        provider: OPEN_METEO_PROVIDER,
        date: input.date,
        hour: input.hour,
        timezone: normalized.timezone,
        fetchedAt,
        stale: false,
        samples: normalized.samples,
        ...geometry,
        conditionContours,
      };
      completed.set(key, {
        value,
        freshUntil: nowMs + FORECAST_TTL_SECONDS * 1000,
        staleUntil: nowMs + FORECAST_STALE_SECONDS * 1000,
      });
      pruneCache();
      return value;
    } catch {
      if (cached && cached.staleUntil > nowMs) return { ...cached.value, stale: true };
      return emptyResult(input, fetchedAt);
    } finally {
      clearTimeout(timeout);
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, request);
  return request;
}
