import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("useWeatherRadar contract", () => {
  it("gets only the owned trip scope and cancels obsolete requests", () => {
    const source = fs.readFileSync(path.resolve(process.cwd(), "app/customer/trip/[tripId]/use-weather-radar.ts"), "utf8");
    expect(source).toContain("AbortController");
    expect(source).toContain("if (!active) return");
    expect(source).toContain("visibilitychange");
    expect(source).toContain("/api/weather/radar?tripId=");
    expect(source).toContain("encodeURIComponent(tripId)");
    expect(source).not.toContain("latitude");
    expect(source).not.toContain("longitude");
  });
});
