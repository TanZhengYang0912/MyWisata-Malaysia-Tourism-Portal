import { describe, expect, it } from "vitest";
import { buildGoogleMapsDirectionsUrl } from "@/lib/travel-modes";

describe("buildGoogleMapsDirectionsUrl", () => {
  const origin = { lat: 3.139, lng: 101.6869 };
  const a = { lat: 3.15, lng: 101.7 };
  const b = { lat: 3.16, lng: 101.71 };
  const c = { lat: 3.17, lng: 101.72 };

  it("returns null with no stops", () => {
    expect(buildGoogleMapsDirectionsUrl(origin, [], "DRIVING")).toBeNull();
  });

  it("puts the last stop as destination and earlier stops as waypoints, in order", () => {
    const url = buildGoogleMapsDirectionsUrl(origin, [a, b, c], "WALKING")!;
    const params = new URL(url).searchParams;
    expect(params.get("origin")).toBe(`${origin.lat},${origin.lng}`);
    expect(params.get("destination")).toBe(`${c.lat},${c.lng}`);
    expect(params.get("waypoints")).toBe(`${a.lat},${a.lng}|${b.lat},${b.lng}`);
    expect(params.get("travelmode")).toBe("walking");
  });

  it("omits origin when none is given", () => {
    const url = buildGoogleMapsDirectionsUrl(null, [a], "DRIVING")!;
    expect(new URL(url).searchParams.has("origin")).toBe(false);
  });

  it("caps waypoints at 9 total stops", () => {
    const stops = Array.from({ length: 12 }, (_, i) => ({ lat: i, lng: i }));
    const url = buildGoogleMapsDirectionsUrl(origin, stops, "DRIVING")!;
    const params = new URL(url).searchParams;
    const waypointCount = params.get("waypoints")!.split("|").length;
    // 9 total stops = 1 destination + 8 waypoints
    expect(waypointCount).toBe(8);
    expect(params.get("destination")).toBe("8,8");
  });
});
