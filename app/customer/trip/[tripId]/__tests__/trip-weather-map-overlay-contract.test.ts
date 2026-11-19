import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const routeDir = path.resolve(process.cwd(), "app/customer/trip/[tripId]");

describe("journey canvas weather overlay contract", () => {
  it("renders a georeferenced canvas mask without vector rain boundaries", () => {
    const source = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    expect(source).toContain("<canvas ref={canvasRef}");
    expect(source).toContain("map.unproject([x / scale, y / scale])");
    expect(source).toContain("map.project(drop.coordinates)");
    expect(source).toContain('data-weather-rain-mask');
    expect(source).not.toContain('<Source id="trip-weather-rain-boundary"');
    expect(source).not.toContain('<Layer id="trip-weather-boundary"');
  });

  it("leaves the maplibre worker setup to the lazy map so the planner's first load skips maplibre-gl", () => {
    const overlay = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    const map = fs.readFileSync(path.resolve(process.cwd(), "components/map/maplibre-map.tsx"), "utf8");
    const mapView = fs.readFileSync(path.resolve(process.cwd(), "components/map/map-view.tsx"), "utf8");
    expect(overlay).not.toContain('import "@/lib/maplibre-worker"');
    expect(map).toContain('import "@/lib/maplibre-worker"');
    expect(mapView).toContain('dynamic(() => import("./maplibre-map")');
  });

  it("keeps the map atmosphere scoped to the existing nearby-place radius", () => {
    const planner = fs.readFileSync(path.join(routeDir, "trip-planner-client.tsx"), "utf8");
    const overlay = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    expect(planner).toContain("grayShadeCenter={discoveryNear ? [discoveryNear.lat, discoveryNear.lng] : undefined}");
    expect(planner).toContain("grayShadeRadiusKm={discoveryNear ? placeFilters.distanceKm : null}");
    expect(overlay).toContain("weatherAtmosphereFade(");
    expect(overlay).toContain("WEATHER_ATMOSPHERE_ALPHA");
    expect(overlay).not.toContain('background: "rgba(112,112,112');
  });

  it("keeps live radar and forecast sampling on separate data paths", () => {
    const source = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    expect(source).toContain('mode === "now"');
    expect(source).toContain("sampleRadarIntensityAt(tile.radar.data, pixelIndex, isCovered)");
    expect(source).toContain("buildForecastIntensitySampler(currentResult.samples)");
    expect(source).toContain("frame.intensityTileUrlTemplate");
    expect(source).toContain("frame.coverageTileUrlTemplate");
    expect(source).toContain("MAX_RADAR_MASK_ZOOM = 7");
  });

  it("reprojects the mask on map movement and keeps animation subtle", () => {
    const source = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    expect(source).toContain('map.on("move", update)');
    expect(source).toContain('map.on("zoomend", update)');
    expect(source).toContain("mapMoving");
    expect(source).toContain("prefers-reduced-motion");
    expect(source).toContain("visibilitychange");
    expect(source).toContain("context.lineWidth = 0.9");
    expect(source).toContain("context.lineCap = \"round\"");
  });

  it("animates supported rain even when its full extent is unknown", () => {
    const source = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    expect(source).toContain("currentResult.samples.some(isForecastRainSample)");
    expect(source).not.toContain("hasBoundedForecastRain(currentResult.samples)");
    expect(source).toContain("result.spatialCoverageComplete && hasForecastRain");
    expect(source).toContain("strictMigration.tripPlanner.weather.coverageInsufficient");
    expect(source).toContain("strictMigration.tripPlanner.weather.rainBeyondCoverage");
    expect(source).toContain("strictMigration.tripPlanner.weather.noRainAtHour");
  });

  it("keeps weather details collapsed until the user asks to open them", () => {
    const source = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    expect(source).toContain("const [controlsExpanded, setControlsExpanded] = useState(false)");
    expect(source).toContain("aria-expanded={controlsExpanded}");
    expect(source).toContain("{controlsExpanded && enabled && (");
    expect(source).toContain("onEnabledChange(!enabled)");
  });

  it("keeps simulated conditions marked as test data and separates them from live radar", () => {
    const source = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    expect(source).toContain("simulationAvailable");
    expect(source).toContain("simulationEnabled");
    expect(source).toContain("strictMigration.tripPlanner.weather.simulation.testData");
    expect(source).toContain("disabled={!canOpenNearbyRadar}");
  });

  it("opens nearby radar from the trip stops and restores the trip camera", () => {
    const source = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    expect(source).toContain("data-weather-nearby-radar");
    expect(source).toContain("data-weather-return-to-trip");
    expect(source).toContain("tripCoordinates: ReadonlyArray<readonly [latitude: number, longitude: number]>");
    expect(source).toContain("tripCameraRef.current = {");
    expect(source).toContain("map.fitBounds([[west, south], [east, north]]");
    expect(source).toContain("maxZoom: MAX_RADAR_MASK_ZOOM");
    expect(source).toContain('onModeChange("forecast")');
  });

  it("paints observed radar echoes with a relative strength legend", () => {
    const source = fs.readFileSync(path.join(routeDir, "trip-weather-map-overlay.tsx"), "utf8");
    expect(source).toContain("radarEchoShade(cellIntensities[index])");
    expect(source).toContain("data-radar-echo-legend");
    expect(source).toContain("disabled={!radarZoomSupported || radarStatus !== \"ready\"}");
  });
});
