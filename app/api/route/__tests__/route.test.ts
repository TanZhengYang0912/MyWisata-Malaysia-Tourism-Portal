import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));

const { POST } = await import("../route");
const { __resetRouteStateForTests } = await import("../route-state");

function request(body: unknown) {
  return new Request("http://localhost/api/route", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mapboxResponse() {
  return new Response(JSON.stringify({
    routes: [{
      geometry: { coordinates: [[100, 5], [100.1, 5.1], [100.2, 5.2]] },
      distance: 21_200,
      duration: 1_560,
      legs: [{
        annotation: {
          congestion: ["low", "heavy"],
          congestion_numeric: [8, 68],
        },
      }],
    }],
  }), { status: 200, headers: { "content-type": "application/json" } });
}

describe("POST /api/route traffic-aware routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    __resetRouteStateForTests();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    vi.stubEnv("MAPBOX_ACCESS_TOKEN", "server-mapbox-secret");
    vi.stubEnv("ORS_API_KEY", "server-ors-secret");
  });

  it("requires authentication before calling a routing provider", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });
    const providerFetch = vi.fn();
    vi.stubGlobal("fetch", providerFetch);

    const response = await POST(request({ mode: "DRIVING", points: [[5, 100], [5.2, 100.2]] }));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("returns normalized live congestion segments without exposing the server token", async () => {
    const providerFetch = vi.fn().mockResolvedValue(mapboxResponse());
    vi.stubGlobal("fetch", providerFetch);

    const response = await POST(request({ mode: "DRIVING", points: [[5, 100], [5.2, 100.2]] }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(body.data.routes[0]).toMatchObject({
      geometry: [[5, 100], [5.1, 100.1], [5.2, 100.2]],
      distanceKm: 21.2,
      durationMin: 26,
      traffic: {
        provider: "mapbox",
        basis: "live",
        segments: [
          { level: "normal", geometry: [[5, 100], [5.1, 100.1]] },
          { level: "congested", geometry: [[5.1, 100.1], [5.2, 100.2]] },
        ],
      },
    });
    expect(JSON.stringify(body)).not.toContain("server-mapbox-secret");

    const providerUrl = String(providerFetch.mock.calls[0][0]);
    expect(providerUrl).toContain("mapbox/driving-traffic");
    expect(providerUrl).toContain("depart_at=now");
    expect(providerUrl).toContain("access_token=server-mapbox-secret");
    expect(providerUrl).not.toContain("user-1");
  });

  it("uses a future departure timestamp for predicted traffic", async () => {
    const providerFetch = vi.fn().mockResolvedValue(mapboxResponse());
    vi.stubGlobal("fetch", providerFetch);

    const response = await POST(request({
      mode: "DRIVING",
      points: [[5, 100], [5.2, 100.2]],
      departureTime: "2026-10-15T04:00:00.000Z",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.routes[0].traffic.basis).toBe("predicted");
    expect(String(providerFetch.mock.calls[0][0])).toContain("depart_at=2026-10-15T04%3A00%3A00.000Z");
  });

  it("falls back to ORS with a blue route when the traffic provider fails", async () => {
    const providerFetch = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      void _init;
      const url = String(input);
      if (url.includes("api.mapbox.com")) return new Response("unavailable", { status: 503 });
      return new Response(JSON.stringify({
        features: [{
          geometry: { coordinates: [[100, 5], [100.2, 5.2]] },
          properties: { summary: { distance: 20_000, duration: 1_200 } },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", providerFetch);

    const response = await POST(request({ mode: "DRIVING", points: [[5, 100], [5.2, 100.2]] }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(providerFetch).toHaveBeenCalledTimes(2);
    expect(providerFetch.mock.calls[1][1]).toMatchObject({ cache: "no-store", redirect: "error" });
    expect(providerFetch.mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal);
    expect(body.data.routes[0].traffic).toBeUndefined();
    expect(body.data.routes[0].geometry).toEqual([[5, 100], [5.2, 100.2]]);
  });

  it("rejects invalid coordinates and unknown request fields", async () => {
    const providerFetch = vi.fn();
    vi.stubGlobal("fetch", providerFetch);

    expect((await POST(request({ mode: "DRIVING", points: [[95, 100], [5.2, 100.2]] }))).status).toBe(422);
    expect((await POST(request({ mode: "DRIVING", points: [[5, 100], [5.2, 100.2]], userId: "other" }))).status).toBe(422);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it("rejects malformed provider coordinates and falls back without sending them to the map", async () => {
    const providerFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("api.mapbox.com")) {
        return new Response(JSON.stringify({
          routes: [{
            geometry: { coordinates: [[200, 95], [100.2, 5.2]] },
            distance: 10,
            duration: 10,
            legs: [{ annotation: { congestion: ["heavy"] } }],
          }],
        }), { status: 200 });
      }
      return new Response(JSON.stringify({
        features: [{
          geometry: { coordinates: [[100, 5], [100.2, 5.2]] },
          properties: { summary: { distance: 20_000, duration: 1_200 } },
        }],
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", providerFetch);

    const response = await POST(request({ mode: "DRIVING", points: [[5, 100], [5.2, 100.2]] }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(providerFetch).toHaveBeenCalledTimes(2);
    expect(body.data.routes[0].geometry).toEqual([[5, 100], [5.2, 100.2]]);
    expect(body.data.routes[0].traffic).toBeUndefined();
  });

  it("cancels a chunked provider response as soon as it exceeds the size limit", async () => {
    let cancelled = false;
    let sent = false;
    const oversized = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) {
          controller.close();
          return;
        }
        sent = true;
        controller.enqueue(new Uint8Array((2 * 1024 * 1024) + 1));
      },
      cancel() {
        cancelled = true;
      },
    }, { highWaterMark: 0 });
    const providerFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("api.mapbox.com")) return new Response(oversized, { status: 200 });
      return new Response(JSON.stringify({
        features: [{
          geometry: { coordinates: [[100, 5], [100.2, 5.2]] },
          properties: { summary: { distance: 20_000, duration: 1_200 } },
        }],
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", providerFetch);

    expect((await POST(request({ mode: "DRIVING", points: [[5, 100], [5.2, 100.2]] }))).status).toBe(200);
    expect(cancelled).toBe(true);
    expect(providerFetch).toHaveBeenCalledTimes(2);
  });

  it("cancels a provider body whose declared content length exceeds the size limit", async () => {
    let cancelled = false;
    const oversized = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array([123]));
      },
      cancel() {
        cancelled = true;
      },
    }, { highWaterMark: 0 });
    const providerFetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("api.mapbox.com")) {
        return new Response(oversized, { status: 200, headers: { "content-length": String((2 * 1024 * 1024) + 1) } });
      }
      return new Response(JSON.stringify({
        features: [{
          geometry: { coordinates: [[100, 5], [100.2, 5.2]] },
          properties: { summary: { distance: 20_000, duration: 1_200 } },
        }],
      }), { status: 200 });
    });
    vi.stubGlobal("fetch", providerFetch);

    expect((await POST(request({ mode: "DRIVING", points: [[5, 100], [5.2, 100.2]] }))).status).toBe(200);
    expect(cancelled).toBe(true);
    expect(providerFetch).toHaveBeenCalledTimes(2);
  });

  it("does not claim live traffic when every provider annotation is unknown", async () => {
    const providerFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      routes: [{
        geometry: { coordinates: [[100, 5], [100.2, 5.2]] },
        distance: 20_000,
        duration: 1_200,
        legs: [{ annotation: { congestion: ["unknown"], congestion_numeric: [null] } }],
      }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", providerFetch);

    const response = await POST(request({ mode: "DRIVING", points: [[5, 100], [5.2, 100.2]] }));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.routes[0].traffic).toBeUndefined();
  });

  it("rate-limits repeated route requests for one authenticated user", async () => {
    const providerFetch = vi.fn().mockImplementation(async () => mapboxResponse());
    vi.stubGlobal("fetch", providerFetch);
    for (let index = 0; index < 30; index += 1) {
      expect((await POST(request({ mode: "DRIVING", points: [[5, 100], [5.2, 100.2]] }))).status).toBe(200);
    }
    expect((await POST(request({ mode: "DRIVING", points: [[5, 100], [5.2, 100.2]] }))).status).toBe(429);
  });
});
