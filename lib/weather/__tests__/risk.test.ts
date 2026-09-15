import { describe, expect, it } from "vitest";
import {
  classifyWeatherSensitivity,
  deriveForecastRiskWindow,
  evaluateForecastRisk,
} from "@/lib/weather/risk";
import type { ForecastEvidence, ForecastHourEvidence, NormalizedForecast } from "@/lib/weather/types";

const baseEvidence: ForecastEvidence = {
  weatherCode: 1,
  temperatureMaxC: 31,
  temperatureMinC: 25,
  apparentTemperatureMaxC: 35,
  precipitationProbabilityMax: 20,
  precipitationSumMm: 1,
  windGustMaxKmh: 15,
  uvIndexMax: 5,
};

function forecast(
  evidence: Partial<ForecastEvidence> = {},
  availability: NormalizedForecast["availability"] = "forecast",
  hours: ForecastHourEvidence[] = [],
): NormalizedForecast {
  return {
    availability,
    provider: "open_meteo",
    latitude: 5.4141,
    longitude: 100.3288,
    timezone: "Asia/Kuala_Lumpur",
    date: "2026-09-15",
    fetchedAt: "2026-09-14T10:00:00.000Z",
    stale: false,
    evidence: availability === "forecast" ? { ...baseEvidence, ...evidence } : null,
    hours: availability === "forecast" ? hours : [],
  };
}

describe("forecast-derived itinerary risk", () => {
  it.each([95, 96, 99])("treats WMO thunderstorm code %s as high risk", (weatherCode) => {
    expect(evaluateForecastRisk(forecast({ weatherCode }))).toEqual({
      level: "high",
      reasons: ["thunderstorm"],
      ruleVersion: "2026-09-v1",
      window: null,
    });
  });

  it.each([65, 67, 82])("treats WMO heavy-rain code %s as high risk", (weatherCode) => {
    expect(evaluateForecastRisk(forecast({ weatherCode }))).toMatchObject({ level: "high", reasons: ["heavy_rain"] });
  });

  it("applies precipitation thresholds only when both probability and amount meet the rule", () => {
    expect(evaluateForecastRisk(forecast({ precipitationProbabilityMax: 59, precipitationSumMm: 10 })).level).toBe("none");
    expect(evaluateForecastRisk(forecast({ precipitationProbabilityMax: 60, precipitationSumMm: 9.9 })).level).toBe("none");
    expect(evaluateForecastRisk(forecast({ precipitationProbabilityMax: 60, precipitationSumMm: 10 }))).toMatchObject({ level: "caution", reasons: ["heavy_rain"] });
  });

  it("uses exact wind and UV boundary values", () => {
    expect(evaluateForecastRisk(forecast({ windGustMaxKmh: 39.9, uvIndexMax: 7.9 })).level).toBe("none");
    expect(evaluateForecastRisk(forecast({ windGustMaxKmh: 40 })).reasons).toEqual(["strong_wind"]);
    expect(evaluateForecastRisk(forecast({ windGustMaxKmh: 59.9 })).level).toBe("caution");
    expect(evaluateForecastRisk(forecast({ windGustMaxKmh: 60 })).level).toBe("high");
    expect(evaluateForecastRisk(forecast({ uvIndexMax: 8 })).reasons).toEqual(["extreme_uv"]);
  });

  it("preserves reasons in stable priority order", () => {
    expect(evaluateForecastRisk(forecast({ weatherCode: 95, windGustMaxKmh: 65, uvIndexMax: 9 })).reasons).toEqual([
      "thunderstorm",
      "strong_wind",
      "extreme_uv",
    ]);
  });

  it("returns unknown when no trustworthy forecast evidence exists", () => {
    expect(evaluateForecastRisk(forecast({}, "unavailable_yet"))).toEqual({
      level: "unknown",
      reasons: [],
      ruleVersion: "2026-09-v1",
      window: null,
    });
    expect(evaluateForecastRisk({ ...forecast(), evidence: null }).level).toBe("unknown");
  });

  it("does not call an incomplete risk dataset neutral", () => {
    const incomplete = forecast({
      precipitationProbabilityMax: null,
      precipitationSumMm: null,
      windGustMaxKmh: null,
      uvIndexMax: null,
    });

    expect(evaluateForecastRisk(incomplete)).toEqual({
      level: "unknown",
      reasons: [],
      ruleVersion: "2026-09-v1",
      window: null,
    });
  });

  it("derives the first contiguous afternoon rain window while keeping a dry morning out", () => {
    const hours: ForecastHourEvidence[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      weatherCode: hour === 15 || hour === 16 ? 95 : hour === 17 ? 51 : 3,
      precipitationMm: hour === 15 ? 1.4 : hour === 16 ? 2.7 : hour === 17 ? 0.1 : 0,
      precipitationProbability: hour === 15 ? 44 : hour === 16 ? 61 : hour === 17 ? 71 : 14,
    }));

    expect(deriveForecastRiskWindow(hours)).toEqual({ startHour: 15, endHour: 17 });
    expect(evaluateForecastRisk(forecast({ weatherCode: 95 }, "forecast", hours)).window).toEqual({ startHour: 15, endHour: 17 });
  });

  it("returns no risk window when every exact hour is below the map display gate", () => {
    const hours: ForecastHourEvidence[] = Array.from({ length: 24 }, (_, hour) => ({
      hour,
      weatherCode: 3,
      precipitationMm: 0,
      precipitationProbability: 14,
    }));

    expect(deriveForecastRiskWindow(hours)).toBeNull();
  });
});

describe("activity weather sensitivity", () => {
  it.each(["Outdoor", "outdoor", "Both"])("recognizes %s metadata as weather-sensitive", (indoorOutdoor) => {
    expect(classifyWeatherSensitivity({ typeSlugs: [], attributes: { indoorOutdoor } })).toBe("weather_sensitive");
  });

  it.each(["nature", "adventure", "water", "sightseeing"])("recognizes %s activity types as weather-sensitive", (type) => {
    expect(classifyWeatherSensitivity({ typeSlugs: [type], attributes: {} })).toBe("weather_sensitive");
  });

  it("keeps explicitly indoor activities separate from unknown metadata", () => {
    expect(classifyWeatherSensitivity({ typeSlugs: ["cultural"], attributes: { indoorOutdoor: "Indoor" } })).toBe("not_weather_sensitive");
    expect(classifyWeatherSensitivity({ typeSlugs: ["cultural"], attributes: {} })).toBe("unknown");
    expect(classifyWeatherSensitivity(undefined)).toBe("unknown");
  });
});
