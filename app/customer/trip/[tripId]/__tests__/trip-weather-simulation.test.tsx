import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { weatherEffectBounds } from "@/lib/weather/overlay-particles";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => `${key}${values ? ` ${Object.values(values).join(" ")}` : ""}`,
    i18n: { resolvedLanguage: "en" },
  }),
}));

const { TripWeatherHint } = await import("../trip-weather-hint");
const { buildSimulatedWeatherOverlay, buildSimulatedWeatherResult, simulatedWeatherConditionKeyForHour, SIMULATED_WEATHER_HOURS } = await import("../trip-weather-simulation");

describe("temporary trip weather simulation", () => {
  it("offers the approved two-hour test sequence", () => {
    expect(SIMULATED_WEATHER_HOURS).toEqual([6, 8, 10, 12, 14, 16, 18, 20]);
  });

  it.each([
    [6, 45, "fog"],
    [8, 53, "drizzle"],
    [10, 63, "rain"],
    [12, 81, "showers"],
    [14, 95, "thunderstorm"],
    [16, 75, "snow"],
    [18, 3, "overcast"],
    [20, 0, "clear"],
  ] as const)("renders hour %s with WMO %s as %s", (hour, weatherCode, condition) => {
    const result = buildSimulatedWeatherResult("2026-09-17", hour);
    expect(result.forecast.date).toBe("2026-09-17");
    expect(result.forecast.evidence?.weatherCode).toBe(weatherCode);
    expect(simulatedWeatherConditionKeyForHour(hour)).toBe(condition === "showers" ? "showers" : condition);

    const markup = renderToStaticMarkup(
      <TripWeatherHint date="2026-09-17" anchorLabel="Test weather" result={result} loading={false} />,
    );
    expect(markup).toContain(`data-weather-condition="${condition}"`);
  });

  it.each([
    [6, "fog"],
    [8, "drizzle"],
    [10, "rain"],
    [12, "showers"],
    [14, "thunderstorm"],
    [16, "snow"],
    [18, "overcast"],
    [20, "clear"],
  ] as const)("builds an irregular map effect for %s:00 %s", (hour, condition) => {
    const result = buildSimulatedWeatherOverlay("2026-09-17", hour, { lat: 5.4141, lng: 100.3288 });
    expect(result.date).toBe("2026-09-17");
    expect(result.hour).toBe(hour);
    expect(result.conditionContours.features.map((feature) => feature.properties.condition)).toEqual(
      condition === "clear" ? [] : [condition],
    );
    if (condition === "clear") {
      expect(weatherEffectBounds(result.conditionContours)).toBeNull();
      return;
    }
    const bounds = weatherEffectBounds(result.conditionContours);
    expect(bounds).not.toBeNull();
    expect(bounds![0]).toBeLessThan(100.3288);
    expect(bounds![2]).toBeGreaterThan(100.3288);
    expect(result.conditionContours.features[0].geometry.coordinates[0][0].length).toBeGreaterThan(4);
  });
});
