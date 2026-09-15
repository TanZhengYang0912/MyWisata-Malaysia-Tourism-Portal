import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NormalizedForecast } from "@/lib/weather/types";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getTripById: vi.fn(),
  getTripItems: vi.fn(),
  getForecast: vi.fn(),
  isDemoRuntime: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));

vi.mock("@/backend/domains/trips", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/backend/domains/trips")>();
  return { ...original, getTripById: mocks.getTripById, getTripItems: mocks.getTripItems };
});

vi.mock("@/lib/weather/open-meteo", () => ({
  getOpenMeteoForecast: mocks.getForecast,
}));

vi.mock("@/lib/demo/runtime", () => ({
  isDemoToolRuntimeEnabled: mocks.isDemoRuntime,
}));

const { POST } = await import("../route");
const { __resetWeatherRouteStateForTests } = await import("../route-state");

const trip = {
  id: "trip-1",
  user_id: "user-1",
  name: "Penang",
  start_date: "2026-09-15",
  end_date: "2026-09-17",
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};

const tripItem = {
  id: "item-1",
  trip_id: "trip-1",
  experience_id: "activity-1",
  sequence: 0,
  scheduled_date: "2026-09-15",
  scheduled_time: "10:00",
  created_at: "2026-09-01T00:00:00.000Z",
  source: "vendor" as const,
  lat: 5.4141,
  lng: 100.3288,
  label: "George Town",
};

const target = {
  key: "w:2026-09-15:5.4141:100.3288",
  date: "2026-09-15",
  latitude: 5.4141,
  longitude: 100.3288,
  label: "George Town",
  kind: "day" as const,
  itemId: "item-1",
};

const forecast: NormalizedForecast = {
  availability: "forecast",
  provider: "open_meteo",
  latitude: 5.4141,
  longitude: 100.3288,
  timezone: "Asia/Kuala_Lumpur",
  date: "2026-09-15",
  fetchedAt: "2026-09-14T10:00:00.000Z",
  stale: false,
  hours: Array.from({ length: 24 }, (_, hour) => ({
    hour,
    weatherCode: hour === 15 || hour === 16 ? 95 : hour === 17 ? 51 : 3,
    precipitationMm: hour === 15 ? 1.4 : hour === 16 ? 2.7 : hour === 17 ? 0.1 : 0,
    precipitationProbability: hour === 15 ? 44 : hour === 16 ? 61 : hour === 17 ? 71 : 14,
  })),
  evidence: {
    weatherCode: 95,
    temperatureMaxC: 31,
    temperatureMinC: 25,
    apparentTemperatureMaxC: 36,
    precipitationProbabilityMax: 80,
    precipitationSumMm: 12,
    windGustMaxKmh: 45,
    uvIndexMax: 8,
  },
};

function request(body: unknown, extraHeaders: Record<string, string> = {}) {
  return new Request("http://localhost/api/weather/forecast", {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
}

describe("POST /api/weather/forecast", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetWeatherRouteStateForTests();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.getTripById.mockResolvedValue(trip);
    mocks.getTripItems.mockResolvedValue([tripItem]);
    mocks.getForecast.mockResolvedValue(forecast);
    mocks.isDemoRuntime.mockReturnValue(false);
  });

  it("requires a successful authenticated session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    const response = await POST(request({ tripId: "trip-1", targets: [target] }));

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "UNAUTHORIZED" } });
    expect(mocks.getForecast).not.toHaveBeenCalled();
  });

  it("binds every target to an owned trip item, coordinate, and trip date", async () => {
    const wrongCoordinate = await POST(request({ tripId: "trip-1", targets: [{ ...target, latitude: 3.139 }] }));
    expect(wrongCoordinate.status).toBe(403);

    mocks.getTripById.mockResolvedValue({ ...trip, user_id: "another-user" });
    const wrongOwner = await POST(request({ tripId: "trip-1", targets: [target] }));
    expect(wrongOwner.status).toBe(403);
    expect(mocks.getForecast).not.toHaveBeenCalled();
  });

  it("never bypasses authenticated ownership for a mock-user trip", async () => {
    mocks.getTripById.mockResolvedValue({ ...trip, user_id: "mock-user" });
    mocks.isDemoRuntime.mockReturnValue(true);

    expect((await POST(request({ tripId: "trip-1", targets: [target] }))).status).toBe(403);
    expect(mocks.getForecast).not.toHaveBeenCalled();
  });

  it("rejects malformed, oversized, and dangerous-key request bodies", async () => {
    const malformed = await POST(new Request("http://localhost/api/weather/forecast", { method: "POST", body: "{" }));
    expect(malformed.status).toBe(400);

    const dangerous = await POST(request({ tripId: "trip-1", targets: [{ ...target, key: "__proto__" }] }));
    expect(dangerous.status).toBe(422);

    const impossibleDate = await POST(request({
      tripId: "trip-1",
      targets: [{ ...target, date: "2026-02-31" }],
    }));
    expect(impossibleDate.status).toBe(422);

    const oversized = await POST(request({ tripId: "trip-1", targets: [target], padding: "x".repeat(40_000) }));
    expect(oversized.status).toBe(413);
  });

  it("deduplicates provider work and returns private fail-soft results", async () => {
    const duplicate = { ...target, key: "w:duplicate", kind: "item" as const };
    const response = await POST(request({ tripId: "trip-1", targets: [target, duplicate] }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(mocks.getForecast).toHaveBeenCalledTimes(1);
    expect(Object.keys(body.data.results)).toEqual([target.key, duplicate.key]);
    expect(body.data.results[target.key].risk).toMatchObject({ level: "high", reasons: expect.arrayContaining(["thunderstorm"]) });
    expect(body.data.results[target.key].risk.window).toEqual({ startHour: 15, endHour: 17 });
    expect(JSON.stringify(body)).not.toContain("stack");
  });

  it("limits provider concurrency across one batch to three", async () => {
    const items = Array.from({ length: 5 }, (_, index) => ({
      ...tripItem,
      id: `item-${index}`,
      lat: 5.4 + index * 0.01,
    }));
    const targets = items.map((item, index) => ({
      ...target,
      key: `w:${index}`,
      itemId: item.id,
      latitude: item.lat,
    }));
    mocks.getTripItems.mockResolvedValue(items);
    let active = 0;
    let maxActive = 0;
    mocks.getForecast.mockImplementation(async (input) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active -= 1;
      return { ...forecast, latitude: input.latitude };
    });

    const response = await POST(request({ tripId: "trip-1", targets }));
    expect(response.status).toBe(200);
    expect(maxActive).toBe(3);
  });

  it("rate-limits repeated user batches", async () => {
    for (let index = 0; index < 6; index += 1) {
      expect((await POST(request({ tripId: "trip-1", targets: [target] }))).status).toBe(200);
    }
    const limited = await POST(request({ tripId: "trip-1", targets: [target] }));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toMatchObject({ error: { code: "RATE_LIMITED" } });
  });
});
