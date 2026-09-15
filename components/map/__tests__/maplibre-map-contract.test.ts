import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mapSource = readFileSync(new URL("../maplibre-map.tsx", import.meta.url), "utf8");
const viewSource = readFileSync(new URL("../map-view.tsx", import.meta.url), "utf8");

describe("shared MapLibre composition contract", () => {
  it("supports optional real-image stop markers without changing fallback markers", () => {
    expect(mapSource).toContain("imageUrl?: string | null");
    expect(mapSource).toContain("order?: number");
    expect(mapSource).toContain("data-map-pin-image");
    expect(mapSource).toContain("onError");
    expect(mapSource).toContain('<svg width="30" height="38"');
  });

  it("accepts optional children inside the existing map context", () => {
    expect(mapSource).toContain("children?: ReactNode");
    expect(mapSource).toContain("{children}");
    expect(viewSource).toContain("children?: ReactNode");
    expect(viewSource).toContain("<MaplibreMap {...props} />");
  });

  it("reports map movement so geographic animations can pause cleanly", () => {
    expect(mapSource).toContain("onMapMovingChange?: (moving: boolean) => void");
    expect(mapSource).toContain("onMoveStart={() => onMapMovingChange?.(true)}");
    expect(mapSource).toContain("onMoveEnd={() => onMapMovingChange?.(false)}");
    expect(viewSource).toContain("onMapMovingChange?: (moving: boolean) => void");
  });

  it("places weather children below route layers while keeping DOM stop markers above them", () => {
    const childIndex = mapSource.indexOf("{children}");
    const routeIndex = mapSource.indexOf("id={`route-alt-${i}`}");
    const markerIndex = mapSource.indexOf("{stopPins.map");
    expect(childIndex).toBeGreaterThan(-1);
    expect(routeIndex).toBeGreaterThan(childIndex);
    expect(markerIndex).toBeGreaterThan(routeIndex);
  });

  it("fills its flex-column host instead of collapsing the map canvas to zero width", () => {
    expect(viewSource).toContain('className="h-full min-h-0 min-w-0 flex-1"');
  });

  it("renders a distinct star marker and 'Suggested' badge for AI-suggested pins, never confused with an in-trip stop", () => {
    expect(mapSource).toContain("suggestedIds?: string[]");
    expect(mapSource).toContain("function SuggestedMarkerVisual");
    expect(mapSource).toContain("{suggestedPins.map");
    // The pin's own trip-membership always wins over "suggested" — a stop
    // that also happens to be a past suggestion still reads "In trip".
    const badgeLine = mapSource.split("\n").find((line) => line.includes("★ ${t(\"ui.actions.suggested\")}"));
    expect(badgeLine).toBeDefined();
    expect(viewSource).toContain("suggestedIds?: string[]");
  });

  it("renders provider traffic segments as geographically anchored route colors", () => {
    expect(mapSource).toContain("trafficSegments?: RouteTrafficSegment[]");
    expect(viewSource).toContain("trafficSegments?: RouteTrafficSegment[]");
    expect(mapSource).toContain("function trafficRouteGeoJSON");
    expect(mapSource).toContain("trafficLevel: segment.level");
    expect(mapSource).toContain('"line-color": [');
    expect(mapSource).toContain('"slow", "#FACC15"');
    expect(mapSource).toContain('"congested", "#EF4444"');
    expect(mapSource).toContain('"severe", "#B91C1C"');
    expect(mapSource).toContain('id={`route-traffic-line-${i}`}');
  });
});
