import { describe, expect, it } from "vitest";
import {
  ORS_PROFILE,
  OSRM_PROFILE,
  buildMapboxTrafficSegments,
  buildRouteDepartureTime,
  fromOrsCoordinates,
  normalizeMapboxTrafficLevel,
  summarizeRoute,
  toOrsCoordinates,
  toOsrmPath,
} from "@/lib/routing";

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

describe("Mapbox traffic normalization", () => {
  it("maps provider categories and numeric fallback values to the product traffic scale", () => {
    expect(normalizeMapboxTrafficLevel("low", 80)).toBe("normal");
    expect(normalizeMapboxTrafficLevel("moderate", null)).toBe("slow");
    expect(normalizeMapboxTrafficLevel("heavy", null)).toBe("congested");
    expect(normalizeMapboxTrafficLevel("severe", null)).toBe("severe");
    expect(normalizeMapboxTrafficLevel("unknown", 27)).toBe("slow");
    expect(normalizeMapboxTrafficLevel(undefined, 62)).toBe("congested");
    expect(normalizeMapboxTrafficLevel(undefined, 91)).toBe("severe");
    expect(normalizeMapboxTrafficLevel(undefined, null)).toBe("unknown");
  });

  it("groups contiguous annotations and converts Mapbox coordinates to app coordinate order", () => {
    const segments = buildMapboxTrafficSegments(
      [
        [100, 5],
        [100.1, 5.1],
        [100.2, 5.2],
        [100.3, 5.3],
      ],
      [
        { congestion: "low", congestion_numeric: 10 },
        { congestion: "moderate", congestion_numeric: 35 },
        { congestion: "moderate", congestion_numeric: 42 },
      ],
    );

    expect(segments).toEqual([
      { level: "normal", geometry: [[5, 100], [5.1, 100.1]] },
      { level: "slow", geometry: [[5.1, 100.1], [5.2, 100.2], [5.3, 100.3]] },
    ]);
  });

  it("rejects annotations that do not align with the route geometry", () => {
    expect(buildMapboxTrafficSegments([[100, 5], [100.1, 5.1], [100.2, 5.2]], [{ congestion: "low" }])).toEqual([]);
  });

  it("uses the earliest future Malaysia itinerary time and a noon fallback", () => {
    const now = new Date("2026-09-15T00:00:00.000Z");
    expect(buildRouteDepartureTime("2026-09-16", ["16:00", "09:30"], now)).toBe("2026-09-16T01:30:00.000Z");
    expect(buildRouteDepartureTime("2026-09-16", [null, ""], now)).toBe("2026-09-16T04:00:00.000Z");
    expect(buildRouteDepartureTime("2026-09-14", ["09:30"], now)).toBeUndefined();
  });
});
