import { describe, expect, it } from "vitest";
import { featureToPath, projectPoint } from "@/lib/demo-map/geo";

describe("Malaysia map projection", () => {
  it("keeps projected coordinates inside the canvas", () => {
    const point = projectPoint([101.6869, 3.139], { minLng: 99, minLat: 0, maxLng: 120, maxLat: 8 }, { width: 900, height: 500, padding: 26 });
    expect(point.x).toBeGreaterThanOrEqual(26);
    expect(point.y).toBeGreaterThanOrEqual(26);
    expect(point.x).toBeLessThanOrEqual(874);
    expect(point.y).toBeLessThanOrEqual(474);
  });

  it("creates an SVG path for a polygon feature", () => {
    expect(featureToPath({ type: "Polygon", coordinates: [[[100, 1], [101, 1], [101, 2], [100, 1]]] }, { minLng: 99, minLat: 0, maxLng: 120, maxLat: 8 }, { width: 900, height: 500, padding: 26 })).toMatch(/^M/);
  });
});
