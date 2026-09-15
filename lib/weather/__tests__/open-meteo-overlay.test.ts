import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetOpenMeteoOverlayCacheForTests,
  getOpenMeteoOverlay,
} from "@/lib/weather/open-meteo-overlay";

const coordinates = [
  { latitude: 5.4, longitude: 100.3 },
  { latitude: 5.41, longitude: 100.31 },
];

function locationPayload(latitude: number, longitude: number, precipitation = 4) {
  return {
    latitude,
    longitude,
    timezone: "Asia/Kuala_Lumpur",
    hourly: {
      time: ["2026-09-16T15:00", "2026-09-16T16:00", "2026-09-16T17:00"],
      precipitation: [1, precipitation, 2],
      precipitation_probability: [60, 80, 70],
      weather_code: [61, 63, 61],
      cloud_cover: [70, 90, 80],
      wind_speed_10m: [10, 18, 12],
      wind_direction_10m: [220, 240, 230],
    },
  };
}

function jsonResponse(payload: unknown, headers?: HeadersInit) {
  return new Response(JSON.stringify(payload), { status: 200, headers });
}

describe("Open-Meteo spatial overlay adapter", () => {
  beforeEach(() => __resetOpenMeteoOverlayCacheForTests());

  it("requests multiple coordinates once and selects the exact local hour", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => jsonResponse([
      locationPayload(5.4, 100.3, 2.8),
      locationPayload(5.41, 100.31, 8.2),
    ]));

    const result = await getOpenMeteoOverlay(
      { coordinates, date: "2026-09-16", hour: 16 },
      { fetcher: fetcher as typeof fetch, now: () => new Date("2026-09-15T00:00:00.000Z") },
    );

    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(url.searchParams.get("latitude")).toBe("5.4000,5.4100");
    expect(url.searchParams.get("longitude")).toBe("100.3000,100.3100");
    expect(url.searchParams.get("hourly")).toContain("precipitation");
    expect(url.searchParams.get("timezone")).toBe("auto");
    expect(result.samples).toEqual([
      expect.objectContaining({ latitude: 5.4, longitude: 100.3, precipitationMm: 2.8 }),
      expect.objectContaining({ latitude: 5.41, longitude: 100.31, precipitationMm: 8.2 }),
    ]);
    expect(result.availability).toBe("forecast");
  });

  it("accepts the documented object shape for one coordinate", async () => {
    const fetcher = vi.fn(async () => jsonResponse(locationPayload(5.4, 100.3)));
    const result = await getOpenMeteoOverlay(
      { coordinates: [coordinates[0]], date: "2026-09-16", hour: 16 },
      { fetcher: fetcher as typeof fetch, now: () => new Date("2026-09-15T00:00:00.000Z") },
    );
    expect(result.samples).toHaveLength(1);
  });

  it("fails closed on coordinate, hour, and response-size mismatches", async () => {
    const wrongCoordinate = vi.fn(async () => jsonResponse(locationPayload(1, 1)));
    expect((await getOpenMeteoOverlay(
      { coordinates: [coordinates[0]], date: "2026-09-16", hour: 16 },
      { fetcher: wrongCoordinate as typeof fetch, now: () => new Date("2026-09-15T00:00:00.000Z") },
    )).availability).toBe("unavailable");

    __resetOpenMeteoOverlayCacheForTests();
    const missingHour = vi.fn(async () => jsonResponse({
      ...locationPayload(5.4, 100.3),
      hourly: { ...locationPayload(5.4, 100.3).hourly, time: ["2026-09-16T15:00"] },
    }));
    expect((await getOpenMeteoOverlay(
      { coordinates: [coordinates[0]], date: "2026-09-16", hour: 16 },
      { fetcher: missingHour as typeof fetch, now: () => new Date("2026-09-15T00:00:00.000Z") },
    )).availability).toBe("unavailable");

    __resetOpenMeteoOverlayCacheForTests();
    const oversized = vi.fn(async () => jsonResponse(locationPayload(5.4, 100.3), { "content-length": String(1024 * 1024 + 1) }));
    expect((await getOpenMeteoOverlay(
      { coordinates: [coordinates[0]], date: "2026-09-16", hour: 16 },
      { fetcher: oversized as typeof fetch, now: () => new Date("2026-09-15T00:00:00.000Z") },
    )).availability).toBe("unavailable");
  });

  it("does not call the provider outside the live forecast horizon", async () => {
    const fetcher = vi.fn();
    const tooFar = await getOpenMeteoOverlay(
      { coordinates, date: "2026-10-02", hour: 16 },
      { fetcher: fetcher as typeof fetch, now: () => new Date("2026-09-15T00:00:00.000Z") },
    );
    expect(tooFar.availability).toBe("unavailable_yet");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects more than the bounded 48 server-derived coordinates", async () => {
    const fetcher = vi.fn();
    const tooMany = Array.from({ length: 49 }, (_, index) => ({ latitude: 5.3, longitude: 100.2 + index * 0.001 }));
    const result = await getOpenMeteoOverlay(
      { coordinates: tooMany, date: "2026-09-16", hour: 16 },
      { fetcher: fetcher as typeof fetch, now: () => new Date("2026-09-15T00:00:00.000Z") },
    );
    expect(result.availability).toBe("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("coalesces in-flight work and returns stale cache after a refresh failure", async () => {
    let resolve!: (value: Response) => void;
    const pending = new Promise<Response>((done) => { resolve = done; });
    const fetcher = vi.fn(() => pending);
    const input = { coordinates, date: "2026-09-16", hour: 16 };
    const first = getOpenMeteoOverlay(input, { fetcher: fetcher as typeof fetch, now: () => new Date("2026-09-15T00:00:00.000Z") });
    const second = getOpenMeteoOverlay(input, { fetcher: fetcher as typeof fetch, now: () => new Date("2026-09-15T00:00:00.000Z") });
    resolve(jsonResponse([locationPayload(5.4, 100.3), locationPayload(5.41, 100.31)]));
    expect((await first).availability).toBe("forecast");
    expect((await second).availability).toBe("forecast");
    expect(fetcher).toHaveBeenCalledTimes(1);

    const failed = vi.fn(async () => new Response("no", { status: 503 }));
    const stale = await getOpenMeteoOverlay(input, { fetcher: failed as typeof fetch, now: () => new Date("2026-09-15T00:31:00.000Z") });
    expect(stale.stale).toBe(true);
  });
});
