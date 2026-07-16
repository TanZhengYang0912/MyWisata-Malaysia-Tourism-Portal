import { describe, expect, it } from "vitest";
import { DEMO_PLACES } from "@/lib/demo-map/data";
import { buildDirectionsUrl, getRouteSummary } from "@/lib/demo-map/store";

describe("local demo navigation", () => {
  it("builds a mode-specific Google Maps URL", () => {
    const url = new URL(buildDirectionsUrl(DEMO_PLACES[0], "bicycling", { lat: 3.139, lng: 101.6869 }));
    expect(url.hostname).toBe("www.google.com");
    expect(url.searchParams.get("travelmode")).toBe("bicycling");
    expect(url.searchParams.get("origin")).toBe("3.139,101.6869");
  });

  it("returns a local summary without a network request", () => {
    expect(getRouteSummary(DEMO_PLACES[0], "walking")).toEqual(expect.objectContaining({ durationText: expect.any(String), distanceText: expect.any(String) }));
  });
});
