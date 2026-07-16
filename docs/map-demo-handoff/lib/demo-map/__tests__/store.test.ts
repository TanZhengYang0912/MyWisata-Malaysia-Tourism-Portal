import { describe, expect, it } from "vitest";
import { DEMO_PLACES, DEMO_STATES, getRouteSummary } from "@/lib/demo-map/data";
import { filterPlaces, haversineKm, parseDemoPreferences, serializeDemoPreferences } from "@/lib/demo-map/store";

describe("local demo map domain", () => {
  it("contains all 16 Malaysian administrative units", () => {
    expect(DEMO_STATES).toHaveLength(16);
    expect(DEMO_STATES.map((state) => state.name)).toEqual(expect.arrayContaining(["Johor", "Penang", "Kuala Lumpur", "Labuan", "Putrajaya", "Sabah", "Sarawak"]));
  });

  it("filters by category, state, and radius", () => {
    const result = filterPlaces(DEMO_PLACES, { category: "Food & Dining", stateId: "penang", near: { lat: 5.4141, lng: 100.3288 }, radiusKm: 30 });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((place) => place.category === "Food & Dining" && place.stateId === "penang" && (place.distanceKm ?? Infinity) <= 30)).toBe(true);
  });

  it("serializes preferences without losing saved place ids", () => {
    const value = { category: "Nature & Hiking", radiusKm: 50, selectedStateId: "sabah", savedPlaceIds: ["place-1"] };
    expect(parseDemoPreferences(serializeDemoPreferences(value))).toEqual(value);
  });

  it("provides a deterministic route summary for every travel mode", () => {
    expect(getRouteSummary(DEMO_PLACES[0], "driving").distanceText).toMatch(/km/);
    expect(getRouteSummary(DEMO_PLACES[0], "transit").durationText).toMatch(/min/);
  });

  it("computes a zero distance for the same point", () => {
    expect(haversineKm({ lat: 3.139, lng: 101.6869 }, { lat: 3.139, lng: 101.6869 })).toBe(0);
  });
});
