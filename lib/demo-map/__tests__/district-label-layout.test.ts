import { describe, expect, it } from "vitest";
import { districtLabelWidth, layoutDistrictLabels, type DistrictLabelInput } from "@/lib/demo-map/district-label-layout";
import { getDistricts } from "@/lib/demo-map/districts";
import { geometryBounds, projectPoint } from "@/lib/demo-map/geo";
import geoJson from "@/lib/demo-map/malaysia-states.json";
import type { GeoJsonGeometry } from "@/lib/demo-map/geo";

const PADDING = 18;
const MAX_WIDTH = 1080;
const MAX_HEIGHT = 760;

/** Mirrors malaysia-district-map.tsx's canvasFor(), so this test exercises
 * the layout against the same pixel geometry the component actually renders. */
function projectState(stateId: string): { input: DistrictLabelInput[]; bounds: { width: number; height: number } } {
  const features = (geoJson as { features: { properties: { id: string }; geometry: GeoJsonGeometry }[] }).features;
  const feature = features.find((f) => f.properties.id === stateId)!;
  const bounds = geometryBounds([feature.geometry]);
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.0001);
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.0001);
  const scale = Math.min((MAX_WIDTH - PADDING * 2) / lngSpan, (MAX_HEIGHT - PADDING * 2) / latSpan);
  const canvas = { width: Math.round(lngSpan * scale) + PADDING * 2, height: Math.round(latSpan * scale) + PADDING * 2, padding: PADDING };
  const input = getDistricts(stateId).map((d) => {
    const p = projectPoint(d.seed, bounds, canvas);
    return { id: d.id, name: d.name, x: p.x, y: p.y };
  });
  return { input, bounds: canvas };
}

function rectFor(placement: { labelX: number; labelY: number; anchor: string }, width: number) {
  const x0 = placement.anchor === "start" ? placement.labelX : placement.anchor === "end" ? placement.labelX - width : placement.labelX - width / 2;
  return { x0, x1: x0 + width, y0: placement.labelY - 8, y1: placement.labelY + 8 };
}

function anyOverlap(a: ReturnType<typeof rectFor>, b: ReturnType<typeof rectFor>): boolean {
  return a.x0 - 2 < b.x1 && b.x0 - 2 < a.x1 && a.y0 - 2 < b.y1 && b.y0 - 2 < a.y1;
}

describe("layoutDistrictLabels", () => {
  it("produces exactly one label per district, for every district given", () => {
    const { input, bounds } = projectState("perak");
    const result = layoutDistrictLabels(input, bounds);

    expect(result).toHaveLength(input.length);
    expect(new Set(result.map((r) => r.id))).toEqual(new Set(input.map((d) => d.id)));
  });

  it("is deterministic: the same input twice produces identical output", () => {
    const { input, bounds } = projectState("sabah");
    const first = layoutDistrictLabels(input, bounds);
    const second = layoutDistrictLabels([...input].reverse(), bounds); // shuffled order in

    expect(second).toEqual(first); // internal sort makes input order irrelevant
  });

  it("resolves Sabah's 17-district crowding (the tightest case measured) without any overlapping labels", () => {
    // This is the state the plan's Δ1 finding flagged as the worst case —
    // nearest-neighbour seeds only 15px apart at this scale. The four-anchor
    // search resolves it without needing the lane fallback at all; the
    // separate test below proves the fallback itself still works once a
    // state genuinely runs out of nearby room.
    const { input, bounds } = projectState("sabah");
    const result = layoutDistrictLabels(input, bounds);

    const rects = result.map((r) => rectFor(r, districtLabelWidth(input.find((d) => d.id === r.id)!.name)));
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        expect(anyOverlap(rects[i], rects[j]), `${result[i].id} overlaps ${result[j].id}`).toBe(false);
      }
    }
  });

  it("falls back to a stacked outer lane once a canvas is too small for four-anchor placement, still without overlaps", () => {
    // Synthetic worst case: 12 districts crammed into a 200x150 plate — far
    // denser than any real state — to force the lane fallback path and prove
    // it actually resolves collisions instead of just hiding them off-canvas.
    const bounds = { width: 200, height: 150 };
    const input: DistrictLabelInput[] = Array.from({ length: 12 }, (_, i) => ({
      id: `d${i}`,
      name: `District ${i}`,
      x: 90 + (i % 3) * 6,
      y: 60 + Math.floor(i / 3) * 6,
    }));

    const result = layoutDistrictLabels(input, bounds);

    expect(result).toHaveLength(12);
    expect(result.some((r) => r.lane !== "none")).toBe(true);
    const rects = result.map((r) => rectFor(r, districtLabelWidth("District 0")));
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        expect(anyOverlap(rects[i], rects[j]), `${result[i].id} overlaps ${result[j].id}`).toBe(false);
      }
    }
  });

  it("returns an empty layout for a state with no districts (Federal Territories, Perlis) instead of throwing", () => {
    expect(layoutDistrictLabels([], { width: 400, height: 300 })).toEqual([]);
  });
});
