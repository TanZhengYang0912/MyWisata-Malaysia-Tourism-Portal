import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { WeatherTargetResult } from "@/lib/weather/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => `${key}${values ? ` ${Object.values(values).join(" ")}` : ""}`,
    i18n: { resolvedLanguage: "en" },
  }),
}));

const { TripWeatherHint, TripWeatherItemMarker, weatherConditionForCode } = await import("../trip-weather-hint");

const result: WeatherTargetResult = {
  target: {
    key: "w:2026-09-15:5.4141:100.3288",
    date: "2026-09-15",
    latitude: 5.4141,
    longitude: 100.3288,
    label: "George Town",
    kind: "day",
    itemId: "item-1",
  },
  forecast: {
    availability: "forecast",
    provider: "open_meteo",
    latitude: 5.4141,
    longitude: 100.3288,
    timezone: "Asia/Kuala_Lumpur",
    date: "2026-09-15",
    fetchedAt: "2026-09-14T10:00:00.000Z",
    stale: false,
    hours: [],
    evidence: {
      weatherCode: 95,
      temperatureMaxC: 31,
      temperatureMinC: 25,
      apparentTemperatureMaxC: 36,
      precipitationProbabilityMax: 80,
      precipitationSumMm: 12,
      windGustMaxKmh: 45,
      uvIndexMax: 8,
    },
  },
  risk: {
    level: "high",
    reasons: ["thunderstorm", "extreme_uv"],
    ruleVersion: "2026-09-v1",
    window: { startHour: 15, endHour: 17 },
  },
};

describe("TripWeatherHint", () => {
  it.each([
    [0, "clear"],
    [1, "mainly-clear"],
    [2, "partly-cloudy"],
    [3, "overcast"],
    [45, "fog"],
    [53, "drizzle"],
    [63, "rain"],
    [75, "snow"],
    [81, "showers"],
    [95, "thunderstorm"],
    [999, "unknown"],
  ] as const)("maps WMO code %s to %s", (weatherCode, condition) => {
    expect(weatherConditionForCode(weatherCode)).toBe(condition);
  });

  it("renders loading without claiming a risk state", () => {
    const markup = renderToStaticMarkup(<TripWeatherHint date="2026-09-15" anchorLabel="George Town" result={null} loading />);
    expect(markup).toContain("weather.loading");
    expect(markup).not.toContain("official");
  });

  it("renders explainable high-risk evidence and provider attribution", () => {
    const markup = renderToStaticMarkup(<TripWeatherHint date="2026-09-15" anchorLabel="George Town" result={result} loading={false} onSelectRiskHour={() => undefined} />);
    expect(markup).toContain("weather.levels.high");
    expect(markup).toContain("weather.reasons.thunderstorm");
    expect(markup).toContain("George Town");
    expect(markup).toContain("2026-09-15");
    expect(markup).toContain("80");
    expect(markup).toContain("45");
    expect(markup).toContain("open-meteo.com");
    expect(markup).toContain("2026-09-14T10:00:00.000Z");
    expect(markup).toContain("15:00");
    expect(markup).toContain("17:00");
    expect(markup).toContain("weather.viewOnMap");
    expect(markup).toContain("<details");
    expect(markup).not.toContain("official warning");
    expect(markup).not.toContain("bg-green");
  });

  it("marks simulated weather without attributing it to Open-Meteo", () => {
    const markup = renderToStaticMarkup(
      <TripWeatherHint date="2026-09-17" anchorLabel="Weather test" result={result} loading={false} simulationLabel="Test data · Thunderstorm · 14:00" />,
    );
    expect(markup).toContain("Test data · Thunderstorm · 14:00");
    expect(markup).not.toContain("open-meteo.com");
    expect(markup).not.toContain("weather.providerAttribution");
  });

  it("renders a semantic animated condition with a reduced-motion fallback", () => {
    const cloudy = {
      ...result,
      forecast: {
        ...result.forecast,
        evidence: { ...result.forecast.evidence!, weatherCode: 3 },
      },
    };
    const markup = renderToStaticMarkup(<TripWeatherHint date="2026-09-15" anchorLabel="George Town" result={cloudy} loading={false} />);

    expect(markup).toContain('data-weather-condition="overcast"');
    expect(markup).toContain('aria-label="strictMigration.tripPlanner.weather.conditions.overcast"');
    expect(markup).toContain("trip-weather-cloud-drift");
    expect(markup).toContain("prefers-reduced-motion: reduce");
  });

  it("animates falling rain for rain, showers, and thunderstorms", () => {
    for (const weatherCode of [63, 81, 95]) {
      const rainy = {
        ...result,
        forecast: {
          ...result.forecast,
          evidence: { ...result.forecast.evidence!, weatherCode },
        },
      };
      const markup = renderToStaticMarkup(<TripWeatherHint date="2026-09-15" anchorLabel="George Town" result={rainy} loading={false} />);
      expect(markup).toContain('class="trip-weather-fall trip-weather-fall-a"');
      expect(markup).toContain("trip-weather-rain-fall");
    }
  });

  it("uses a distinct semantic icon marker for every risk reason", () => {
    const allReasons = {
      ...result,
      risk: {
        ...result.risk,
        reasons: [
          "thunderstorm",
          "heavy_rain",
          "strong_wind",
          "rain",
          "extreme_uv",
        ] as WeatherTargetResult["risk"]["reasons"],
      },
    };
    const markup = renderToStaticMarkup(<TripWeatherHint date="2026-09-15" anchorLabel="George Town" result={allReasons} loading={false} />);

    for (const reason of allReasons.risk.reasons) {
      expect(markup).toContain(`data-weather-reason="${reason}"`);
    }
  });

  it("renders a neutral valid forecast without a safe label", () => {
    const neutral = { ...result, risk: { ...result.risk, level: "none" as const, reasons: [], window: null } };
    const markup = renderToStaticMarkup(<TripWeatherHint date="2026-09-15" anchorLabel="George Town" result={neutral} loading={false} />);
    expect(markup).toContain("weather.levels.none");
    expect(markup.toLowerCase()).not.toContain("safe");
  });

  it("renders incomplete evidence as unknown rather than no risk", () => {
    const unknown = { ...result, risk: { ...result.risk, level: "unknown" as const, reasons: [], window: null } };
    const markup = renderToStaticMarkup(<TripWeatherHint date="2026-09-15" anchorLabel="George Town" result={unknown} loading={false} />);
    expect(markup).toContain("weather.levels.unknown");
    expect(markup).not.toContain("weather.levels.none");
  });

  it.each([
    ["unavailable_yet", "weather.forecastAvailableNearerDeparture"],
    ["unavailable", "weather.forecastUnavailable"],
  ] as const)("renders %s as unavailable rather than low risk", (availability, copy) => {
    const unavailable = {
      ...result,
      forecast: { ...result.forecast, availability, evidence: null, hours: [] },
      risk: { ...result.risk, level: "unknown" as const, reasons: [], window: null },
    };
    const markup = renderToStaticMarkup(<TripWeatherHint date="2026-09-15" anchorLabel="George Town" result={unavailable} loading={false} />);
    expect(markup).toContain(copy);
    expect(markup.toLowerCase()).not.toContain("safe");
  });

  it("discloses stale forecast data", () => {
    const stale = { ...result, forecast: { ...result.forecast, stale: true } };
    const markup = renderToStaticMarkup(<TripWeatherHint date="2026-09-15" anchorLabel="George Town" result={stale} loading={false} />);
    expect(markup).toContain("weather.stale");
  });

  it("labels a risky day as daily when no exact risk window is available", () => {
    const dailyOnly = { ...result, risk: { ...result.risk, window: null } };
    const markup = renderToStaticMarkup(<TripWeatherHint date="2026-09-15" anchorLabel="George Town" result={dailyOnly} loading={false} />);
    expect(markup).toContain("weather.dailyRisk");
    expect(markup).not.toContain("weather.viewOnMap");
  });
});

describe("TripWeatherItemMarker", () => {
  it("renders only caution and high item effects", () => {
    expect(renderToStaticMarkup(<TripWeatherItemMarker result={result} />)).toContain("weather.mayAffectOutdoorPlans");
    expect(renderToStaticMarkup(<TripWeatherItemMarker result={{ ...result, risk: { ...result.risk, level: "none" } }} />)).toBe("");
  });
});
