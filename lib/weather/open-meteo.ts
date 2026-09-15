import "server-only";

import { z } from "zod";
import type { NormalizedForecast } from "@/lib/weather/types";

export const OPEN_METEO_PROVIDER = "open_meteo" as const;
export const FORECAST_TTL_SECONDS = 30 * 60;
export const FORECAST_STALE_SECONDS = 2 * 60 * 60;
export const FORECAST_TIMEOUT_MS = 5_000;
export const FORECAST_MAX_RESPONSE_BYTES = 1024 * 1024;

type CacheEntry = {
  value: NormalizedForecast;
  freshUntil: number;
  staleUntil: number;
};

const completed = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<NormalizedForecast>>();

const nullableMetric = z.array(z.number().finite().nullable()).length(1);
const nullableHourlyMetric = z.array(z.number().finite().nullable()).length(24);
const payloadSchema = z.object({
  timezone: z.string().min(1),
  daily: z.object({
    time: z.array(z.string()).length(1),
    weather_code: z.array(z.number().int().finite()).length(1),
    temperature_2m_max: nullableMetric,
    temperature_2m_min: nullableMetric,
    apparent_temperature_max: nullableMetric,
    precipitation_probability_max: nullableMetric,
    precipitation_sum: nullableMetric,
    wind_gusts_10m_max: nullableMetric,
    uv_index_max: nullableMetric,
  }).passthrough(),
  hourly: z.object({
    time: z.array(z.string()).length(24),
    weather_code: nullableHourlyMetric,
    precipitation: nullableHourlyMetric,
    precipitation_probability: nullableHourlyMetric,
  }).passthrough(),
}).passthrough();

function rounded(value: number) {
  return Number(value.toFixed(4));
}

function cacheKey(input: { latitude: number; longitude: number; date: string }) {
  return `${rounded(input.latitude)},${rounded(input.longitude)},${input.date}`;
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

function unavailable(
  input: { latitude: number; longitude: number; date: string },
  fetchedAt: string,
  availability: NormalizedForecast["availability"] = "unavailable",
): NormalizedForecast {
  return {
    availability,
    provider: OPEN_METEO_PROVIDER,
    latitude: rounded(input.latitude),
    longitude: rounded(input.longitude),
    timezone: "",
    date: input.date,
    fetchedAt,
    stale: false,
    evidence: null,
    hours: [],
  };
}

function pruneCompletedCache() {
  if (completed.size <= 200) return;
  const oldest = [...completed.entries()].sort((a, b) => Date.parse(a[1].value.fetchedAt) - Date.parse(b[1].value.fetchedAt))[0];
  if (oldest) completed.delete(oldest[0]);
}

async function readResponseTextWithLimit(response: Response) {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > FORECAST_MAX_RESPONSE_BYTES) {
    throw new Error("Open-Meteo response is too large");
  }
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

export function __resetOpenMeteoCacheForTests() {
  completed.clear();
  inFlight.clear();
}

export async function getOpenMeteoForecast(
  input: { latitude: number; longitude: number; date: string },
  options?: { fetcher?: typeof fetch; now?: () => Date },
): Promise<NormalizedForecast> {
  const now = options?.now?.() ?? new Date();
  const fetchedAt = now.toISOString();
  const days = dayDifference(input.date, now);
  if (!Number.isFinite(input.latitude) || !Number.isFinite(input.longitude)
    || input.latitude < -90 || input.latitude > 90 || input.longitude < -180 || input.longitude > 180
    || !Number.isFinite(days) || days < 0) {
    return unavailable(input, fetchedAt);
  }
  if (days > 15) return unavailable(input, fetchedAt, "unavailable_yet");

  const key = cacheKey(input);
  const cached = completed.get(key);
  const nowMs = now.getTime();
  if (cached && cached.freshUntil > nowMs) return cached.value;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    let nextValue: NormalizedForecast;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FORECAST_TIMEOUT_MS);
    try {
      const url = new URL("https://api.open-meteo.com/v1/forecast");
      url.searchParams.set("latitude", rounded(input.latitude).toString());
      url.searchParams.set("longitude", rounded(input.longitude).toString());
      url.searchParams.set("start_date", input.date);
      url.searchParams.set("end_date", input.date);
      url.searchParams.set("timezone", "auto");
      url.searchParams.set("temperature_unit", "celsius");
      url.searchParams.set("wind_speed_unit", "kmh");
      url.searchParams.set("precipitation_unit", "mm");
      url.searchParams.set("daily", [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "apparent_temperature_max",
        "precipitation_probability_max",
        "precipitation_sum",
        "wind_gusts_10m_max",
        "uv_index_max",
      ].join(","));
      url.searchParams.set("hourly", [
        "weather_code",
        "precipitation",
        "precipitation_probability",
      ].join(","));

      const providerResponse = await (options?.fetcher ?? fetch)(url, {
        cache: "no-store",
        redirect: "error",
        signal: controller.signal,
      });
      if (!providerResponse.ok) throw new Error(`Open-Meteo returned ${providerResponse.status}`);
      const text = await readResponseTextWithLimit(providerResponse);
      const parsed = payloadSchema.safeParse(JSON.parse(text));
      if (!parsed.success || parsed.data.daily.time[0] !== input.date) {
        throw new Error("Open-Meteo response did not match the requested date");
      }
      const daily = parsed.data.daily;
      const hourly = parsed.data.hourly;
      const hours = Array.from({ length: 24 }, (_, hour) => {
        const expectedTime = `${input.date}T${String(hour).padStart(2, "0")}:00`;
        if (hourly.time[hour] !== expectedTime) {
          throw new Error("Open-Meteo hourly response did not match the requested date");
        }
        return {
          hour,
          weatherCode: hourly.weather_code[hour],
          precipitationMm: hourly.precipitation[hour],
          precipitationProbability: hourly.precipitation_probability[hour],
        };
      });
      nextValue = {
        availability: "forecast",
        provider: OPEN_METEO_PROVIDER,
        latitude: rounded(input.latitude),
        longitude: rounded(input.longitude),
        timezone: parsed.data.timezone,
        date: input.date,
        fetchedAt,
        stale: false,
        hours,
        evidence: {
          weatherCode: daily.weather_code[0],
          temperatureMaxC: daily.temperature_2m_max[0],
          temperatureMinC: daily.temperature_2m_min[0],
          apparentTemperatureMaxC: daily.apparent_temperature_max[0],
          precipitationProbabilityMax: daily.precipitation_probability_max[0],
          precipitationSumMm: daily.precipitation_sum[0],
          windGustMaxKmh: daily.wind_gusts_10m_max[0],
          uvIndexMax: daily.uv_index_max[0],
        },
      };
      completed.set(key, {
        value: nextValue,
        freshUntil: nowMs + FORECAST_TTL_SECONDS * 1000,
        staleUntil: nowMs + FORECAST_STALE_SECONDS * 1000,
      });
      pruneCompletedCache();
      return nextValue;
    } catch {
      if (cached && cached.staleUntil > nowMs) return { ...cached.value, stale: true };
      return unavailable(input, fetchedAt);
    } finally {
      clearTimeout(timeout);
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, request);
  return request;
}
