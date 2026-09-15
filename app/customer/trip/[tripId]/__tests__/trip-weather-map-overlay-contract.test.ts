import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routeDir = path.resolve(process.cwd(), "app/customer/trip/[tripId]");

describe("journey canvas weather overlay contract", () => {
  it("keeps every visual weather element geographically anchored", () => {
    const source = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    expect(source).toContain("<Source id=\"trip-weather-contours\"");
    expect(source).toContain("<Source id=\"trip-weather-effect-particles\"");
    expect(source).toContain("<Source id=\"trip-weather-condition-contours\"");
    expect(source).toContain("<Marker");
    expect(source).toContain("dominantCenter");
    expect(source).toContain("seedWeatherEffectParticles");
    expect(source).toContain("advanceWeatherEffectParticles");
  });

  it("renders every approved weather effect from condition-filtered map layers", () => {
    const source = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    for (const condition of ["fog", "overcast", "drizzle", "rain", "showers", "thunderstorm", "snow"]) {
      expect(source).toContain(`id="trip-weather-effect-${condition}"`);
      expect(source).toContain(`conditionFilter("${condition}")`);
    }
    expect(source).toContain('id="trip-weather-condition-base"');
    expect(source).toContain('id="trip-weather-effect-thunder-flash"');
    expect(source).toContain('result.conditionContours');
  });

  it("renders mutually exclusive rain bands from light to heavy", () => {
    const source = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    const lightIndex = source.indexOf('id="trip-weather-light-fill"');
    const moderateIndex = source.indexOf('id="trip-weather-moderate-fill"');
    const heavyIndex = source.indexOf('id="trip-weather-heavy-fill"');

    expect(lightIndex).toBeGreaterThan(-1);
    expect(moderateIndex).toBeGreaterThan(lightIndex);
    expect(heavyIndex).toBeGreaterThan(moderateIndex);
    expect(source).not.toContain('<Layer id="trip-weather-boundary" type="line" filter=');
    expect(source).toContain('<Source id="trip-weather-rain-boundary"');
    expect(source).toContain("result.rainBoundary");
  });

  it("renders a bounded RainViewer raster only in the live-radar branch", () => {
    const source = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    expect(source).toContain('mode === "now"');
    expect(source).toContain('<Source id="trip-weather-radar"');
    expect(source).toContain('type="raster"');
    expect(source).toContain('tileSize={256}');
    expect(source).toContain('maxzoom={7}');
    expect(source).toContain('<Layer id="trip-weather-radar-layer" type="raster"');
    expect(source).toContain('"raster-opacity": 0.62');
    expect(source).toContain("radarResult.tileUrlTemplate");
    expect(source).toContain("radarResult?.attributionUrl");
  });

  it("keeps adjacent rain-band fills visibly distinct on the basemap", () => {
    const source = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    const opacityFor = (level: "light" | "moderate" | "heavy") => {
      const match = source.match(new RegExp(`id="trip-weather-${level}-fill"[^\\n]+"fill-opacity": (0\\.\\d+)`));
      expect(match, `missing ${level} fill opacity`).not.toBeNull();
      return Number(match?.[1]);
    };

    const light = opacityFor("light");
    const moderate = opacityFor("moderate");
    const heavy = opacityFor("heavy");

    expect(moderate - light).toBeGreaterThanOrEqual(0.12);
    expect(heavy - moderate).toBeGreaterThanOrEqual(0.12);
    expect(heavy).toBeLessThan(0.7);
  });

  it("does not explain the boundary with redundant inside/outside copy", () => {
    const source = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    expect(source).not.toContain("虚线内有雨");
    expect(source).not.toContain("虚线外无雨");
    expect(source).not.toContain("inside the dashed");
    expect(source).not.toContain("outside the dashed");
  });

  it("pauses animation for map movement, hidden tabs, and reduced motion", () => {
    const source = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    expect(source).toContain("mapMoving");
    expect(source).toContain("prefers-reduced-motion");
    expect(source).toContain("visibilitychange");
    expect(source).toContain("!reducedMotion && !pageHidden && !mapMoving && animationTick");
  });

  it("keeps simulation renderer-only and hides real-provider attribution", () => {
    const source = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    expect(source).toContain("simulationEnabled");
    expect(source).toContain("!simulationEnabled");
    expect(source).toContain("strictMigration.tripPlanner.weather.simulation.missingAnchor");
    expect(source).not.toContain("simulatedWeatherOverlayAction");
  });

  it("renders both forecast availability fallbacks", () => {
    const source = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    expect(source).toContain('result?.availability === "unavailable_yet"');
    expect(source).toContain('result?.availability === "unavailable"');
  });

  it("distinguishes missing trip coordinates from a provider failure", () => {
    const source = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    expect(source).toContain('activeStatus === "missing_coordinates"');
    expect(source).toContain("strictMigration.tripPlanner.weather.missingCoordinates");
    expect(source).toContain('status === "error"');
    expect(source).toContain("strictMigration.tripPlanner.weather.mapUnavailable");
  });

  it("offers the approved animation schedule only through a development simulation control", () => {
    const source = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    expect(source).toContain("simulationAvailable");
    expect(source).toContain("simulationEnabled");
    expect(source).toContain("onSimulationEnabledChange");
    expect(source).toContain("SIMULATED_WEATHER_HOURS");
    expect(source).toContain("strictMigration.tripPlanner.weather.simulation.testData");
    expect(source).toContain("strictMigration.tripPlanner.weather.simulation.hint");
  });

  it("explains when the selected forecast hour has no drawable rain", () => {
    const source = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    expect(source).toContain('result.contours.features.length === 0');
    expect(source).toContain('strictMigration.tripPlanner.weather.noRainAtHour');
    expect(source).toContain('String(hour).padStart(2, "0")');
  });
});
