import { describe, expect, it } from "vitest";
import { DEMO_DISTRICTS, CITY_TO_DISTRICT, getDistricts } from "@/lib/demo-map/districts";
import { DEMO_STATES } from "@/lib/demo-map/data";
import geoJson from "@/lib/demo-map/malaysia-states.json";
import type { GeoJsonGeometry } from "@/lib/demo-map/geo";

const features = (geoJson as { features: { properties: { id: string }; geometry: GeoJsonGeometry }[] }).features;
const geometryOf = (stateId: string) => features.find((f) => f.properties.id === stateId)!.geometry;

describe("DEMO_DISTRICTS", () => {
  it("keys every entry to a real DEMO_STATES id", () => {
    for (const stateId of Object.keys(DEMO_DISTRICTS)) {
      expect(DEMO_STATES.some((state) => state.id === stateId), `unknown state id "${stateId}"`).toBe(true);
    }
  });

  it("covers all 16 states and federal territories", () => {
    for (const state of DEMO_STATES) {
      expect(DEMO_DISTRICTS[state.id], `missing entry for "${state.id}"`).toBeDefined();
    }
  });

  it("has no duplicate district id inside a state", () => {
    for (const [stateId, districts] of Object.entries(DEMO_DISTRICTS)) {
      const ids = districts.map((d) => d.id);
      expect(new Set(ids).size, `duplicate district id in "${stateId}"`).toBe(ids.length);
    }
  });

  it("leaves the federal territories and Perlis without districts", () => {
    for (const stateId of ["kuala-lumpur", "putrajaya", "labuan", "perlis"]) {
      expect(getDistricts(stateId)).toEqual([]);
    }
  });

  it("includes Kinabatangan in Sabah — the district for River & Rainforest Discovery's place coordinate", () => {
    // Added for docs/plans/2026-08-03-0237-dev-explore-discovery-map.md Δ2:
    // the product's real destination (the Kinabatangan River) has no seeded
    // town of its own, unlike the outlet-derived cities already in this list.
    const sabah = getDistricts("sabah");
    expect(sabah.some((d) => d.name === "Kinabatangan")).toBe(true);
  });

  it("places every district seed inside its state's bounding box", () => {
    for (const state of DEMO_STATES) {
      const districts = getDistricts(state.id);
      if (districts.length === 0) continue;
      const rings = geometryOf(state.id);
      const points = rings.type === "Polygon" ? rings.coordinates.flat() : rings.coordinates.flat(2);
      const lngs = points.map((p) => p[0]);
      const lats = points.map((p) => p[1]);
      for (const d of districts) {
        expect(d.seed[0], `${d.name} lng outside ${state.name}`).toBeGreaterThanOrEqual(Math.min(...lngs));
        expect(d.seed[0], `${d.name} lng outside ${state.name}`).toBeLessThanOrEqual(Math.max(...lngs));
        expect(d.seed[1], `${d.name} lat outside ${state.name}`).toBeGreaterThanOrEqual(Math.min(...lats));
        expect(d.seed[1], `${d.name} lat outside ${state.name}`).toBeLessThanOrEqual(Math.max(...lats));
      }
    }
  });
});

describe("CITY_TO_DISTRICT", () => {
  it("maps every city to a district that exists in some state", () => {
    const allNames = new Set(Object.values(DEMO_DISTRICTS).flat().map((d) => d.name));
    for (const [city, name] of Object.entries(CITY_TO_DISTRICT)) {
      expect(allNames.has(name), `"${city}" -> unknown district "${name}"`).toBe(true);
    }
  });

  it("collapses Penang's three seeded cities into one district", () => {
    // The finding that drove the plan: district is coarser than city here, so
    // it cannot be a mandatory navigation step on today's data.
    expect(CITY_TO_DISTRICT["George Town"]).toBe("Timur Laut");
    expect(CITY_TO_DISTRICT["Air Itam"]).toBe("Timur Laut");
    expect(CITY_TO_DISTRICT["Batu Ferringhi"]).toBe("Timur Laut");
  });
});
