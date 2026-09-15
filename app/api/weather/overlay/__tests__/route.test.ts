import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WeatherOverlayResult } from "@/lib/weather/types";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  getTripById: vi.fn(),
  getTripItems: vi.fn(),
  getOverlay: vi.fn(),
  isDemoRuntime: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser } }) }));
vi.mock("@/backend/domains/trips", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/backend/domains/trips")>();
  return { ...original, getTripById: mocks.getTripById, getTripItems: mocks.getTripItems };
});
vi.mock("@/lib/weather/open-meteo-overlay", () => ({ getOpenMeteoOverlay: mocks.getOverlay }));
vi.mock("@/lib/demo/runtime", () => ({ isDemoToolRuntimeEnabled: mocks.isDemoRuntime }));

const { POST } = await import("../route");
const { __resetWeatherOverlayRouteStateForTests } = await import("../route-state");

const trip = {
  id: "trip-1",
  user_id: "user-1",
  name: "Penang",
  start_date: "2026-09-15",
  end_date: "2026-09-17",
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};
const origin = {
  id: "origin-1", trip_id: trip.id, experience_id: null, sequence: 0,
  scheduled_date: null, scheduled_time: null, created_at: trip.created_at,
  source: "location" as const, kind: "custom" as const, lat: 5.3978, lng: 100.3664,
  label: "Penang Sentral",
};
const item = {
  id: "item-1", trip_id: trip.id, experience_id: "activity-1", sequence: 1,
  scheduled_date: "2026-09-16", scheduled_time: "16:00", created_at: trip.created_at,
  source: "vendor" as const, lat: 5.4141, lng: 100.3288, label: "Secret activity label",
};
const overlay: WeatherOverlayResult = {
  availability: "forecast", provider: "open_meteo", date: "2026-09-16", hour: 16,
  timezone: "Asia/Kuala_Lumpur", fetchedAt: "2026-09-15T00:00:00.000Z", stale: false,
  bounds: null, samples: [], contours: { type: "FeatureCollection", features: [] }, conditionContours: { type: "FeatureCollection", features: [] }, dominantCenter: null,
  rainBoundary: { type: "FeatureCollection", features: [] },
};

function request(body: unknown) {
  return new Request("http://localhost/api/weather/overlay", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/weather/overlay", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetWeatherOverlayRouteStateForTests();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.getTripById.mockResolvedValue(trip);
    mocks.getTripItems.mockResolvedValue([origin, item]);
    mocks.getOverlay.mockResolvedValue(overlay);
    mocks.isDemoRuntime.mockReturnValue(false);
  });

  it("derives a bounded sample grid from an owned trip without leaking labels", async () => {
    const response = await POST(request({ tripId: trip.id, date: "2026-09-16", hour: 16 }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(mocks.getOverlay).toHaveBeenCalledTimes(1);
    const providerInput = mocks.getOverlay.mock.calls[0][0];
    expect(providerInput).toMatchObject({ date: "2026-09-16", hour: 16 });
    expect(providerInput.coordinates).toHaveLength(48);
    expect(JSON.stringify(providerInput)).not.toContain("user-1");
    expect(JSON.stringify(providerInput)).not.toContain("Secret activity label");
    expect(JSON.stringify(providerInput)).not.toContain("Penang Sentral");
  });

  it("requires authentication and strict trip ownership", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "expired" } });
    expect((await POST(request({ tripId: trip.id, date: "2026-09-16", hour: 16 }))).status).toBe(401);

    mocks.getTripById.mockResolvedValueOnce({ ...trip, user_id: "other-user" });
    expect((await POST(request({ tripId: trip.id, date: "2026-09-16", hour: 16 }))).status).toBe(403);

    mocks.getTripById.mockResolvedValue({ ...trip, user_id: "mock-user" });
    mocks.isDemoRuntime.mockReturnValue(true);
    expect((await POST(request({ tripId: trip.id, date: "2026-09-16", hour: 16 }))).status).toBe(403);
    expect(mocks.getOverlay).not.toHaveBeenCalled();
  });

  it("rejects invalid scope, unknown input, and oversized bodies before provider work", async () => {
    expect((await POST(request({ tripId: trip.id, date: "2026-09-18", hour: 16 }))).status).toBe(403);
    expect((await POST(request({ tripId: trip.id, date: "2026-09-16", hour: 16.5 }))).status).toBe(422);
    expect((await POST(request({ tripId: trip.id, date: "2026-09-16", hour: 16, latitude: 1 }))).status).toBe(422);
    expect((await POST(request({ tripId: trip.id, date: "2026-09-16", hour: 16, padding: "x".repeat(40_000) }))).status).toBe(413);
  });

  it("fails closed when the trip has no valid coordinate", async () => {
    mocks.getTripItems.mockResolvedValue([{ ...item, lat: Number.NaN }]);
    const response = await POST(request({ tripId: trip.id, date: "2026-09-16", hour: 16 }));
    expect(response.status).toBe(422);
    expect(mocks.getOverlay).not.toHaveBeenCalled();
  });

  it("rate-limits repeated batches per authenticated user", async () => {
    for (let index = 0; index < 6; index += 1) {
      expect((await POST(request({ tripId: trip.id, date: "2026-09-16", hour: 16 }))).status).toBe(200);
    }
    expect((await POST(request({ tripId: trip.id, date: "2026-09-16", hour: 16 }))).status).toBe(429);
  });
});
