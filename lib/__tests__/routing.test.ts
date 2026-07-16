import { describe, expect, it } from "vitest";
import { ORS_PROFILE, OSRM_PROFILE, fromOrsCoordinates, summarizeRoute, toOrsCoordinates, toOsrmPath } from "@/lib/routing";

describe("ORS_PROFILE", () => {
  it("maps drive/walk/cycle to ORS profiles and transit to null", () => {
    expect(ORS_PROFILE.DRIVING).toBe("driving-car");
    expect(ORS_PROFILE.WALKING).toBe("foot-walking");
    expect(ORS_PROFILE.BICYCLING).toBe("cycling-regular");
    expect(ORS_PROFILE.TRANSIT).toBeNull();
  });
});

describe("coordinate order swap", () => {
  it("toOrsCoordinates swaps [lat,lng] -> [lng,lat]", () => {
    expect(toOrsCoordinates([[3.139, 101.6869]])).toEqual([[101.6869, 3.139]]);
  });

  it("fromOrsCoordinates swaps [lng,lat] -> [lat,lng]", () => {
    expect(fromOrsCoordinates([[101.6869, 3.139]])).toEqual([[3.139, 101.6869]]);
  });

  it("round-trips a multi-point path unchanged", () => {
    const points: [number, number][] = [
      [3.139, 101.6869],
      [3.15, 101.7],
      [3.16, 101.71],
    ];
    expect(fromOrsCoordinates(toOrsCoordinates(points))).toEqual(points);
  });
});

describe("OSRM fallback (no-key, driving only)", () => {
  it("only supports driving", () => {
    expect(OSRM_PROFILE.DRIVING).toBe("driving");
    expect(OSRM_PROFILE.WALKING).toBeNull();
    expect(OSRM_PROFILE.BICYCLING).toBeNull();
    expect(OSRM_PROFILE.TRANSIT).toBeNull();
  });

  it("formats the path as lng,lat;lng,lat", () => {
    expect(toOsrmPath([[3.139, 101.6869], [3.15, 101.7]])).toBe("101.6869,3.139;101.7,3.15");
  });
});

describe("summarizeRoute", () => {
  it("converts meters/seconds to rounded km and minutes", () => {
    expect(summarizeRoute(21234, 1560)).toEqual({ distanceKm: 21.2, durationMin: 26 });
    expect(summarizeRoute(0, 0)).toEqual({ distanceKm: 0, durationMin: 0 });
  });
});
