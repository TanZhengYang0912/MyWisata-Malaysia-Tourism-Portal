import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetRainViewerCacheForTests,
  getRainViewerRadar,
  RAINVIEWER_METADATA_URL,
} from "@/lib/weather/rainviewer";
import { FORECAST_TIMEOUT_MS } from "@/lib/weather/open-meteo";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    version: "2.0.1",
    generated: 1_789_471_800,
    host: "https://tilecache.rainviewer.com",
    radar: {
      past: [
        { time: 1_789_471_200, path: "/v2/radar/319a7eaf1712" },
        { time: 1_789_471_800, path: "/v2/radar/ae786c325270" },
      ],
    },
    ...overrides,
  };
}

function response(value: unknown, headers?: HeadersInit) {
  return new Response(JSON.stringify(value), { status: 200, headers });
}

describe("RainViewer radar adapter", () => {
  beforeEach(() => __resetRainViewerCacheForTests());

  it("selects the latest validated past frame and constructs a fixed tile template", async () => {
    const fetcher = vi.fn(async () => response(payload()));
    const result = await getRainViewerRadar({
      fetcher: fetcher as typeof fetch,
      now: () => new Date("2026-09-15T11:40:00.000Z"),
    });

    expect(fetcher).toHaveBeenCalledWith(RAINVIEWER_METADATA_URL, expect.objectContaining({ cache: "no-store", redirect: "error" }));
    expect(result).toMatchObject({
      availability: "radar",
      provider: "rainviewer",
      observedAt: "2026-09-15T11:30:00.000Z",
      maxZoom: 7,
      attributionLabel: "RainViewer",
      attributionUrl: "https://www.rainviewer.com/",
    });
    expect(result.tileUrlTemplate).toBe("https://tilecache.rainviewer.com/v2/radar/ae786c325270/256/{z}/{x}/{y}/2/1_0.png");
  });

  it.each([
    ["non-https host", payload({ host: "http://tilecache.rainviewer.com" })],
    ["outside host", payload({ host: "https://rainviewer.com.evil.example" })],
    ["credentialed host", payload({ host: "https://user@tilecache.rainviewer.com" })],
    ["host with a port", payload({ host: "https://tilecache.rainviewer.com:444" })],
    ["malformed frame path", payload({ radar: { past: [{ time: 1_789_471_800, path: "/v2/radar/../../secret" }] } })],
    ["encoded separator in frame path", payload({ radar: { past: [{ time: 1_789_471_800, path: "/v2/radar/abc%2fsecret" }] } })],
    ["query in frame path", payload({ radar: { past: [{ time: 1_789_471_800, path: "/v2/radar/ae786c325270?x=1" }] } })],
  ])("rejects %s metadata", async (_label, value) => {
    const result = await getRainViewerRadar({
      fetcher: (async () => response(value)) as typeof fetch,
      now: () => new Date("2026-09-15T11:40:00.000Z"),
    });
    expect(result.availability).toBe("unavailable");
    expect(result.tileUrlTemplate).toBeNull();
  });

  it("rejects empty and implausibly future frame lists", async () => {
    const empty = await getRainViewerRadar({
      fetcher: (async () => response(payload({ radar: { past: [] } }))) as typeof fetch,
      now: () => new Date("2026-09-15T11:40:00.000Z"),
    });
    expect(empty.availability).toBe("unavailable");

    __resetRainViewerCacheForTests();
    const futureTime = 1_789_473_001;
    const future = await getRainViewerRadar({
      fetcher: (async () => response(payload({ radar: { past: [{ time: futureTime, path: "/v2/radar/aabbccddeeff" }] } }))) as typeof fetch,
      now: () => new Date("2026-09-15T11:40:00.000Z"),
    });
    expect(future.availability).toBe("unavailable");
  });

  it("rejects radar frames older than the bounded observation window", async () => {
    const result = await getRainViewerRadar({
      fetcher: (async () => response(payload({
        radar: { past: [{ time: 1_789_464_000, path: "/v2/radar/ae786c325270" }] },
      }))) as typeof fetch,
      now: () => new Date("2026-09-15T11:40:00.000Z"),
    });

    expect(result.availability).toBe("unavailable");
  });

  it("rejects implausible metadata generation times", async () => {
    const result = await getRainViewerRadar({
      fetcher: (async () => response(payload({ generated: 1_789_473_001 }))) as typeof fetch,
      now: () => new Date("2026-09-15T11:40:00.000Z"),
    });
    expect(result.availability).toBe("unavailable");
  });

  it("times out bounded metadata work", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }));
      const pending = getRainViewerRadar({ fetcher: fetcher as typeof fetch, now: () => new Date("2026-09-15T11:40:00.000Z") });
      await vi.advanceTimersByTimeAsync(FORECAST_TIMEOUT_MS);
      expect((await pending).availability).toBe("unavailable");
    } finally {
      vi.useRealTimers();
    }
  });

  it("reuses fresh metadata and serves a bounded stale result after refresh failure", async () => {
    const fetcher = vi.fn(async () => response(payload()));
    const first = await getRainViewerRadar({ fetcher: fetcher as typeof fetch, now: () => new Date("2026-09-15T11:40:00.000Z") });
    const fresh = await getRainViewerRadar({ fetcher: fetcher as typeof fetch, now: () => new Date("2026-09-15T11:44:00.000Z") });
    const failed = vi.fn(async () => new Response("no", { status: 503 }));
    const stale = await getRainViewerRadar({ fetcher: failed as typeof fetch, now: () => new Date("2026-09-15T11:50:00.000Z") });

    expect(first.availability).toBe("radar");
    expect(fresh).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(stale).toMatchObject({ availability: "radar", stale: true, tileUrlTemplate: first.tileUrlTemplate });

    const expired = await getRainViewerRadar({ fetcher: failed as typeof fetch, now: () => new Date("2026-09-15T11:56:00.000Z") });
    expect(expired.availability).toBe("unavailable");
  });

  it("fails closed on oversized and invalid JSON responses", async () => {
    const oversized = await getRainViewerRadar({
      fetcher: (async () => response(payload(), { "content-length": String(1024 * 1024 + 1) })) as typeof fetch,
      now: () => new Date("2026-09-15T11:40:00.000Z"),
    });
    expect(oversized.availability).toBe("unavailable");

    __resetRainViewerCacheForTests();
    const invalid = await getRainViewerRadar({
      fetcher: (async () => new Response("not-json")) as typeof fetch,
      now: () => new Date("2026-09-15T11:40:00.000Z"),
    });
    expect(invalid.availability).toBe("unavailable");
  });
});
