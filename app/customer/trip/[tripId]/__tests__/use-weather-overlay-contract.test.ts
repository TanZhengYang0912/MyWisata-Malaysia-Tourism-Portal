import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("useWeatherOverlay contract", () => {
  it("posts only trip, date and hour and cancels obsolete requests", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "app/customer/trip/[tripId]/use-weather-overlay.ts"), "utf8");
    expect(source).toContain("AbortController");
    expect(source).toContain("requestFingerprint");
    expect(source).toContain("if (!active) return");
    expect(source).toContain("/api/weather/overlay");
    expect(source).toContain("JSON.stringify({ tripId, date, hour })");
    expect(source).not.toContain("latitude");
    expect(source).not.toContain("longitude");
  });

  it("stops before fetching when the selected route has no weather coordinates", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "app/customer/trip/[tripId]/use-weather-overlay.ts"), "utf8");
    const missingCoordinatesIndex = source.indexOf("if (!hasCoordinates)");
    const fetchIndex = source.indexOf('fetch("/api/weather/overlay"');

    expect(missingCoordinatesIndex).toBeGreaterThan(-1);
    expect(missingCoordinatesIndex).toBeLessThan(fetchIndex);
    expect(source).toContain('status: "missing_coordinates"');
  });

  it("preserves the API missing-coordinate error instead of calling it a provider failure", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "app/customer/trip/[tripId]/use-weather-overlay.ts"), "utf8");
    expect(source).toContain('body.error?.code === "NO_VALID_COORDINATES"');
    expect(source).toContain('status: "missing_coordinates"');
  });
});
