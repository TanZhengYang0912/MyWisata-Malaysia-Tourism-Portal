import React, { act } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installTestDom, type TestDocument } from "@/components/shared/__tests__/render-test-dom";
import type { WeatherOverlayResult } from "@/lib/weather/types";

let document: TestDocument;
let createRoot: typeof import("react-dom/client").createRoot;
let useWeatherOverlay: typeof import("../use-weather-overlay").useWeatherOverlay;

beforeAll(async () => {
  document = installTestDom();
  ({ createRoot } = await import("react-dom/client"));
  ({ useWeatherOverlay } = await import("../use-weather-overlay"));
});

const overlay = {
  availability: "forecast",
  provider: "open_meteo",
  date: "2026-11-17",
  hour: 10,
  timezone: "Asia/Kuala_Lumpur",
  fetchedAt: "2026-11-16T00:00:00.000Z",
  stale: false,
  spatialCoverageComplete: false,
  bounds: null,
  samples: [],
  contours: { type: "FeatureCollection", features: [] },
  conditionContours: { type: "FeatureCollection", features: [] },
  rainBoundary: { type: "FeatureCollection", features: [] },
  dominantCenter: null,
} as WeatherOverlayResult;

describe("useWeatherOverlay geography refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ data: overlay }),
    }) as Response));
  });

  it("aborts and refreshes when the saved selected-day coordinates change", async () => {
    let state!: ReturnType<typeof useWeatherOverlay>;
    function Probe({ geographyKey }: { geographyKey: string }) {
      state = useWeatherOverlay("trip-1", "2026-11-17", 10, true, true, geographyKey);
      return null;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container as unknown as Element);
    await act(async () => root.render(<Probe geographyKey="5.4141,100.3288" />));
    expect(state).toMatchObject({ status: "loading", result: null });
    await act(async () => { await vi.advanceTimersByTimeAsync(220); });

    const fetcher = vi.mocked(fetch);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/weather/overlay");
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toEqual({
      tripId: "trip-1",
      date: "2026-11-17",
      hour: 10,
    });
    const firstSignal = fetcher.mock.calls[0][1]?.signal;

    await act(async () => root.render(<Probe geographyKey="5.4141,100.3288|5.4300,100.3350" />));
    expect(state).toMatchObject({ status: "loading", result: null });
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => { await vi.advanceTimersByTimeAsync(220); });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(state).toMatchObject({ status: "ready", result: overlay });

    await act(async () => root.render(<Probe geographyKey="5.4141,100.3288|5.4300,100.3350" />));
    await act(async () => { await vi.advanceTimersByTimeAsync(220); });
    expect(fetcher).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
    vi.useRealTimers();
  });
});
