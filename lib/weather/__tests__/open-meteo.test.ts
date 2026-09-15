import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetOpenMeteoCacheForTests,
  FORECAST_MAX_RESPONSE_BYTES,
  getOpenMeteoForecast,
} from "@/lib/weather/open-meteo";

const validPayload = {
  latitude: 5.4141,
  longitude: 100.3288,
  timezone: "Asia/Kuala_Lumpur",
  daily: {
    time: ["2026-09-15"],
    weather_code: [95],
    temperature_2m_max: [31.5],
    temperature_2m_min: [25.2],
    apparent_temperature_max: [36.1],
    precipitation_probability_max: [88],
    precipitation_sum: [14.4],
    wind_gusts_10m_max: [43.2],
    uv_index_max: [8.4],
  },
  hourly: {
    time: Array.from({ length: 24 }, (_, hour) => `2026-09-15T${String(hour).padStart(2, "0")}:00`),
    weather_code: Array.from({ length: 24 }, (_, hour) => hour === 15 || hour === 16 ? 95 : hour === 17 ? 51 : 3),
    precipitation: Array.from({ length: 24 }, (_, hour) => hour === 15 ? 1.4 : hour === 16 ? 2.7 : hour === 17 ? 0.1 : 0),
    precipitation_probability: Array.from({ length: 24 }, (_, hour) => hour === 15 ? 44 : hour === 16 ? 61 : hour === 17 ? 71 : 14),
  },
};

function response(payload: unknown = validPayload, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), { status: 200, ...init });
}

describe("Open-Meteo forecast adapter", () => {
  beforeEach(() => {
    __resetOpenMeteoCacheForTests();
  });

  it("requests and normalizes one exact local forecast date", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      void input;
      void init;
      return response();
    });
    const result = await getOpenMeteoForecast(
      { latitude: 5.414123, longitude: 100.328812, date: "2026-09-15" },
      { fetcher: fetcher as typeof fetch, now: () => new Date("2026-09-14T10:00:00.000Z") },
    );

    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.hostname).toBe("api.open-meteo.com");
    expect(url.searchParams.get("latitude")).toBe("5.4141");
    expect(url.searchParams.get("longitude")).toBe("100.3288");
    expect(url.searchParams.get("start_date")).toBe("2026-09-15");
    expect(url.searchParams.get("end_date")).toBe("2026-09-15");
    expect(url.searchParams.get("timezone")).toBe("auto");
    expect(url.searchParams.get("daily")).toContain("weather_code");
    expect(url.searchParams.get("hourly")).toBe("weather_code,precipitation,precipitation_probability");
    expect(result).toMatchObject({
      availability: "forecast",
      provider: "open_meteo",
      date: "2026-09-15",
      timezone: "Asia/Kuala_Lumpur",
      fetchedAt: "2026-09-14T10:00:00.000Z",
      stale: false,
      evidence: { weatherCode: 95, precipitationSumMm: 14.4, uvIndexMax: 8.4 },
    });
    expect(result.hours[10]).toMatchObject({ hour: 10, weatherCode: 3, precipitationMm: 0, precipitationProbability: 14 });
    expect(result.hours[15]).toMatchObject({ hour: 15, weatherCode: 95, precipitationMm: 1.4, precipitationProbability: 44 });
  });

  it("serves a fresh cached result without a second request", async () => {
    const fetcher = vi.fn(async () => response());
    const input = { latitude: 5.4141, longitude: 100.3288, date: "2026-09-15" };
    const now = () => new Date("2026-09-14T10:00:00.000Z");

    await getOpenMeteoForecast(input, { fetcher: fetcher as typeof fetch, now });
    await getOpenMeteoForecast(input, { fetcher: fetcher as typeof fetch, now });

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns an explicitly stale cached result when refresh fails inside the stale window", async () => {
    let nowValue = new Date("2026-09-14T10:00:00.000Z");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    const input = { latitude: 5.4141, longitude: 100.3288, date: "2026-09-15" };

    await getOpenMeteoForecast(input, { fetcher, now: () => nowValue });
    nowValue = new Date("2026-09-14T10:31:00.000Z");
    const stale = await getOpenMeteoForecast(input, { fetcher, now: () => nowValue });

    expect(stale.stale).toBe(true);
    expect(stale.fetchedAt).toBe("2026-09-14T10:00:00.000Z");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not serve cached data after the stale window expires", async () => {
    let nowValue = new Date("2026-09-14T10:00:00.000Z");
    const fetcher = vi.fn()
      .mockResolvedValueOnce(response())
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
    const input = { latitude: 5.4141, longitude: 100.3288, date: "2026-09-15" };

    await getOpenMeteoForecast(input, { fetcher, now: () => nowValue });
    nowValue = new Date("2026-09-14T12:01:00.000Z");
    const expired = await getOpenMeteoForecast(input, { fetcher, now: () => nowValue });

    expect(expired.availability).toBe("unavailable");
    expect(expired.evidence).toBeNull();
  });

  it("coalesces identical in-flight requests", async () => {
    let resolveFetch!: (value: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve; }));
    const input = { latitude: 5.4141, longitude: 100.3288, date: "2026-09-15" };
    const options = { fetcher: fetcher as typeof fetch, now: () => new Date("2026-09-14T10:00:00.000Z") };

    const first = getOpenMeteoForecast(input, options);
    const second = getOpenMeteoForecast(input, options);
    resolveFetch(response());

    expect((await first).availability).toBe("forecast");
    expect((await second).availability).toBe("forecast");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("returns unavailable-yet without fetching outside the live forecast horizon", async () => {
    const fetcher = vi.fn(async () => response());
    const result = await getOpenMeteoForecast(
      { latitude: 5.4141, longitude: 100.3288, date: "2026-10-01" },
      { fetcher: fetcher as typeof fetch, now: () => new Date("2026-09-14T10:00:00.000Z") },
    );

    expect(result.availability).toBe("unavailable_yet");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("uses the Malaysia calendar date at the UTC day boundary", async () => {
    const fetcher = vi.fn(async () => response());
    const result = await getOpenMeteoForecast(
      { latitude: 5.4141, longitude: 100.3288, date: "2026-09-14" },
      { fetcher: fetcher as typeof fetch, now: () => new Date("2026-09-14T16:30:00.000Z") },
    );

    expect(result.availability).toBe("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...validPayload, timezone: "" }, "unavailable"],
    [{ ...validPayload, daily: { ...validPayload.daily, time: ["2026-09-16"] } }, "unavailable"],
    [{ ...validPayload, daily: { ...validPayload.daily, weather_code: [] } }, "unavailable"],
    [{ ...validPayload, hourly: { ...validPayload.hourly, time: validPayload.hourly.time.slice(0, 23) } }, "unavailable"],
    [{ ...validPayload, hourly: { ...validPayload.hourly, precipitation: validPayload.hourly.precipitation.slice(0, 23) } }, "unavailable"],
  ])("fails softly for malformed provider data", async (payload, availability) => {
    const result = await getOpenMeteoForecast(
      { latitude: 5.4141, longitude: 100.3288, date: "2026-09-15" },
      { fetcher: (async () => response(payload)) as typeof fetch, now: () => new Date("2026-09-14T10:00:00.000Z") },
    );
    expect(result.availability).toBe(availability);
    expect(result.evidence).toBeNull();
  });

  it("rejects an oversized response", async () => {
    const oversized = "x".repeat(FORECAST_MAX_RESPONSE_BYTES + 1);
    const result = await getOpenMeteoForecast(
      { latitude: 5.4141, longitude: 100.3288, date: "2026-09-15" },
      { fetcher: (async () => new Response(oversized)) as typeof fetch, now: () => new Date("2026-09-14T10:00:00.000Z") },
    );
    expect(result.availability).toBe("unavailable");
  });

  it("stops reading a streamed response once it exceeds the byte cap", async () => {
    let pulls = 0;
    const chunk = new Uint8Array(64 * 1024);
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls <= 30) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const result = await getOpenMeteoForecast(
      { latitude: 5.4141, longitude: 100.3288, date: "2026-09-15" },
      { fetcher: (async () => new Response(body)) as typeof fetch, now: () => new Date("2026-09-14T10:00:00.000Z") },
    );

    expect(result.availability).toBe("unavailable");
    expect(pulls).toBeLessThan(30);
  });
});
