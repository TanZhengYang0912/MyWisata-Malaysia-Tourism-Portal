import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RadarOverlayResult } from "@/lib/weather/types";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  getTripById: vi.fn(),
  getTripItems: vi.fn(),
  getRadar: vi.fn(),
  malaysiaDateHour: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/backend/domains/trips", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/backend/domains/trips")>();
  return { ...original, getTripById: mocks.getTripById, getTripItems: mocks.getTripItems };
});
vi.mock("@/lib/weather/rainviewer", () => ({ getRainViewerRadar: mocks.getRadar }));
vi.mock("@/lib/weather/overlay-time", () => ({ malaysiaDateHour: mocks.malaysiaDateHour }));

const { GET } = await import("../route");
const { __resetWeatherRadarRouteStateForTests } = await import("../route-state");

const trip = {
  id: "trip-1",
  user_id: "user-1",
  name: "Penang",
  start_date: "2026-09-15",
  end_date: "2026-09-17",
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};

const item = {
  id: "item-1", trip_id: trip.id, experience_id: "activity-1", sequence: 1,
  scheduled_date: "2026-09-15", scheduled_time: "18:00", created_at: trip.created_at,
  source: "vendor" as const, lat: 5.4141, lng: 100.3288, label: "Private activity label",
};

const radar: RadarOverlayResult = {
  availability: "radar",
  provider: "rainviewer",
  observedAt: "2026-09-15T10:20:00.000Z",
  fetchedAt: "2026-09-15T10:21:00.000Z",
  stale: false,
  tileUrlTemplate: "https://tilecache.rainviewer.com/v2/radar/1789467600/256/{z}/{x}/{y}/2/1_0.png",
  maxZoom: 7,
  attributionLabel: "RainViewer",
  attributionUrl: "https://www.rainviewer.com/",
};

function request(query = "tripId=trip-1") {
  return new Request(`http://localhost/api/weather/radar?${query}`);
}

describe("GET /api/weather/radar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetWeatherRadarRouteStateForTests();
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser } });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.getTripById.mockResolvedValue(trip);
    mocks.getTripItems.mockResolvedValue([item]);
    mocks.getRadar.mockResolvedValue(radar);
    mocks.malaysiaDateHour.mockReturnValue({ date: "2026-09-15", hour: 18 });
  });

  it("returns normalized current radar metadata for an owned trip without leaking trip data", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(mocks.getRadar).toHaveBeenCalledTimes(1);
    expect(body.data).toEqual(radar);
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain("user-1");
    expect(serialized).not.toContain("Private activity label");
    expect(serialized).not.toContain("5.4141");
    expect(serialized).not.toContain("100.3288");
  });

  it("requires authentication and strict trip ownership", async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "expired" } });
    expect((await GET(request())).status).toBe(401);

    mocks.getTripById.mockResolvedValueOnce(null);
    expect((await GET(request())).status).toBe(404);

    mocks.getTripById.mockResolvedValueOnce({ ...trip, user_id: "other-user" });
    expect((await GET(request())).status).toBe(403);
    expect(mocks.getRadar).not.toHaveBeenCalled();
  });

  it("rejects invalid scope before provider work", async () => {
    expect((await GET(request(""))).status).toBe(422);
    expect((await GET(request("tripId=trip-1&tripId=trip-2"))).status).toBe(422);
    expect((await GET(request("tripId=trip-1&host=https%3A%2F%2Fevil.example"))).status).toBe(422);

    mocks.malaysiaDateHour.mockReturnValueOnce({ date: "2026-09-18", hour: 18 });
    expect((await GET(request())).status).toBe(403);

    mocks.getTripItems.mockResolvedValueOnce([{ ...item, lat: Number.NaN }]);
    expect((await GET(request())).status).toBe(422);
    expect(mocks.getRadar).not.toHaveBeenCalled();
  });

  it("rate-limits repeated radar metadata requests per authenticated user", async () => {
    for (let index = 0; index < 12; index += 1) {
      expect((await GET(request())).status).toBe(200);
    }
    expect((await GET(request())).status).toBe(429);
  });

  it("fails closed without exposing exception details", async () => {
    mocks.createClient.mockRejectedValueOnce(new Error("secret stack /Users/private/project/file.ts"));

    const response = await GET(request());
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(serialized).not.toContain("/Users/private");
    expect(serialized).not.toContain("secret stack");
  });
});
