import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetOpenMeteoOverlayCacheForTests,
  getOpenMeteoOverlay,
} from "@/lib/weather/open-meteo-overlay";
import { hasBoundedForecastRain } from "@/lib/weather/rain-mask";

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
    expect(url.searchParams.get("timezone")).toBe("Asia/Kuala_Lumpur");
    expect(url.searchParams.get("cell_selection")).toBe("nearest");
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

  it("retains the model-returned grid coordinate instead of implying requested-place precision", async () => {
    const fetcher = vi.fn(async () => jsonResponse(locationPayload(5.375, 100.25)));
    const result = await getOpenMeteoOverlay(
      { coordinates: [{ latitude: 5.4, longitude: 100.3 }], date: "2026-09-16", hour: 16 },
      { fetcher: fetcher as typeof fetch, now: () => new Date("2026-09-15T00:00:00.000Z") },
    );
    expect(result.samples[0]).toMatchObject({ latitude: 5.375, longitude: 100.25 });
    expect(result.spatialCoverageComplete).toBe(false);
  });

  it("deduplicates repeated Open-Meteo model cells before building the forecast grid", async () => {
    const requested = [
      { latitude: 5.40, longitude: 100.30 },
      { latitude: 5.41, longitude: 100.31 },
      { latitude: 5.49, longitude: 100.39 },
      { latitude: 5.50, longitude: 100.40 },
      { latitude: 5.42, longitude: 100.32 },
      { latitude: 5.48, longitude: 100.38 },
    ];
    const returnedCells = [
      [5.4, 100.3], [5.4, 100.3], [5.4, 100.4], [5.4, 100.4], [5.5, 100.3], [5.5, 100.4],
    ];
    const fetcher = vi.fn(async () => jsonResponse(returnedCells.map(([latitude, longitude]) => locationPayload(latitude, longitude))));
    const result = await getOpenMeteoOverlay(
      { coordinates: requested, date: "2026-09-16", hour: 16 },
      { fetcher: fetcher as typeof fetch, now: () => new Date("2026-09-15T00:00:00.000Z") },
    );
    expect(result.samples).toHaveLength(4);
    expect(result.spatialCoverageComplete).toBe(true);
  });

  it("accepts complete staggered model cells instead of requiring a rectangular coordinate matrix", async () => {
    const requested = Array.from({ length: 48 }, (_, index) => {
      const cellIndex = index % 24;
      const row = Math.floor(cellIndex / 6);
      const column = cellIndex % 6;
      return {
        latitude: 5.3 + row * 0.07 + (index >= 24 ? 0.001 : 0),
        longitude: 100.13 + column * 0.074 + row * 0.008 + (index >= 24 ? 0.001 : 0),
      };
    });
    const returned = Array.from({ length: 48 }, (_, index) => {
      const cellIndex = index % 24;
      const row = Math.floor(cellIndex / 6);
      const column = cellIndex % 6;
      const isInteriorRain = row === 1 && column === 2;
      return locationPayload(
        5.3 + row * 0.07,
        100.13 + column * 0.074 + row * 0.008,
        isInteriorRain ? 2.5 : 0,
      );
    });
    const fetcher = vi.fn(async () => jsonResponse(returned));
    const result = await getOpenMeteoOverlay(
      { coordinates: requested, date: "2026-09-16", hour: 16 },
      { fetcher: fetcher as typeof fetch, now: () => new Date("2026-09-15T00:00:00.000Z") },
    );

    expect(result.samples).toHaveLength(24);
    expect(result.spatialCoverageComplete).toBe(true);
    expect(hasBoundedForecastRain(result.samples)).toBe(true);
    expect(result.contours.features.length).toBeGreaterThan(0);
  });

  it("marks spatial coverage incomplete and suppresses contours when probability data is missing", async () => {
    const location = locationPayload(5.4, 100.3);
    const fetcher = vi.fn(async () => jsonResponse({
      ...location,
      hourly: { ...location.hourly, precipitation_probability: [null, 80, 70] },
    }));
    const result = await getOpenMeteoOverlay(
      { coordinates: [coordinates[0]], date: "2026-09-16", hour: 15 },
      { fetcher: fetcher as typeof fetch, now: () => new Date("2026-09-15T00:00:00.000Z") },
    );

    expect(result.availability).toBe("forecast");
    expect(result.spatialCoverageComplete).toBe(false);
    expect(result.contours.features).toEqual([]);
  });

  it("suppresses rain geometry and the precise center when model cells are too sparse", async () => {
    const requested = [
      { latitude: 5.4, longitude: 100.3 },
      { latitude: 5.405, longitude: 100.3 },
      { latitude: 5.4, longitude: 100.305 },
      { latitude: 5.405, longitude: 100.305 },
      { latitude: 5.45, longitude: 100.35 },
    ];
    const returned = [
      locationPayload(5.4, 100.3, 2),
      locationPayload(5.405, 100.3, 2),
      locationPayload(5.4, 100.305, 2),
      locationPayload(5.405, 100.305, 2),
      locationPayload(5.45, 100.35, 2),
    ];
    const fetcher = vi.fn(async () => jsonResponse(returned));
    const result = await getOpenMeteoOverlay(
      { coordinates: requested, date: "2026-09-16", hour: 16 },
      { fetcher: fetcher as typeof fetch, now: () => new Date("2026-09-15T00:00:00.000Z") },
    );

    expect(result.spatialCoverageComplete).toBe(false);
    expect(result.contours.features).toEqual([]);
    expect(result.rainBoundary.features).toEqual([]);
    expect(result.dominantCenter).toBeNull();
  });

  it("keeps sample-edge rain status but emits no false closed rain region", async () => {
    const requested = [
      { latitude: 5.4, longitude: 100.3 },
      { latitude: 5.4, longitude: 100.4 },
      { latitude: 5.5, longitude: 100.3 },
      { latitude: 5.5, longitude: 100.4 },
    ];
    const fetcher = vi.fn(async () => jsonResponse(requested.map(({ latitude, longitude }) => (
      locationPayload(latitude, longitude, 2)
    ))));
    const result = await getOpenMeteoOverlay(
      { coordinates: requested, date: "2026-09-16", hour: 16 },
      { fetcher: fetcher as typeof fetch, now: () => new Date("2026-09-15T00:00:00.000Z") },
    );

    expect(result.spatialCoverageComplete).toBe(true);
    expect(hasBoundedForecastRain(result.samples)).toBe(false);
    expect(result.contours.features).toEqual([]);
    expect(result.rainBoundary.features).toEqual([]);
    expect(result.dominantCenter).toBeNull();
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

  it("rejects samples returned in a timezone that could shift the selected local hour", async () => {
    const fetcher = vi.fn(async () => jsonResponse({
      ...locationPayload(5.4, 100.3),
      timezone: "UTC",
    }));
    const result = await getOpenMeteoOverlay(
      { coordinates: [coordinates[0]], date: "2026-09-16", hour: 16 },
      { fetcher: fetcher as typeof fetch, now: () => new Date("2026-09-15T00:00:00.000Z") },
    );

    expect(result.availability).toBe("unavailable");
    expect(result.spatialCoverageComplete).toBe(false);
    expect(result.contours.features).toEqual([]);
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

  it("keeps coalesced provider work alive while another caller is subscribed", async () => {
    let resolve!: (value: Response) => void;
    let providerSignal: AbortSignal | undefined;
    const pending = new Promise<Response>((done) => { resolve = done; });
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      providerSignal = init?.signal as AbortSignal | undefined;
      return pending;
    });
    const controller = new AbortController();
    const input = { coordinates: [coordinates[0]], date: "2026-09-16", hour: 16 };
    const first = getOpenMeteoOverlay(input, { fetcher: fetcher as typeof fetch, signal: controller.signal, now: () => new Date("2026-09-15T00:00:00.000Z") });
    const second = getOpenMeteoOverlay(input, { fetcher: fetcher as typeof fetch, now: () => new Date("2026-09-15T00:00:00.000Z") });

    await vi.waitFor(() => expect(providerSignal).toBeDefined());
    controller.abort();
    expect(await first).toBeNull();
    expect(providerSignal?.aborted).toBe(false);
    resolve(jsonResponse([locationPayload(5.4, 100.3)]));
    expect((await second)?.availability).toBe("forecast");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("aborts the provider request when every coalesced caller disconnects", async () => {
    let providerSignal: AbortSignal | undefined;
    const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      providerSignal = init?.signal as AbortSignal | undefined;
      providerSignal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const controller = new AbortController();
    const result = getOpenMeteoOverlay(
      { coordinates: [coordinates[0]], date: "2026-09-16", hour: 16 },
      { fetcher: fetcher as typeof fetch, signal: controller.signal, now: () => new Date("2026-09-15T00:00:00.000Z") },
    );

    await vi.waitFor(() => expect(providerSignal).toBeDefined());
    controller.abort();
    expect(await result).toBeNull();
    expect(providerSignal?.aborted).toBe(true);
  });
});
