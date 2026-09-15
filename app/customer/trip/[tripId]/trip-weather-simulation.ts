import {
  buildPrecipitationContours,
  buildWeatherConditionContours,
  buildWeatherSampleGrid,
} from "@/lib/weather/overlay";
import type { ForecastEvidence, ForecastRisk, WeatherOverlayResult, WeatherOverlaySample, WeatherTargetResult } from "@/lib/weather/types";

export const SIMULATED_WEATHER_HOURS = [6, 8, 10, 12, 14, 16, 18, 20] as const;

const CODE_BY_HOUR: Record<number, number> = {
  6: 45,
  8: 53,
  10: 63,
  12: 81,
  14: 95,
  16: 75,
  18: 3,
  20: 0,
};

const CONDITION_KEY_BY_HOUR: Record<number, string> = {
  6: "fog",
  8: "drizzle",
  10: "rain",
  12: "showers",
  14: "thunderstorm",
  16: "snow",
  18: "overcast",
  20: "clear",
};

const ACTIVE_SAMPLE_INDEXES = new Set([10, 11, 12, 17, 18, 19, 20, 25, 26, 27, 28, 34, 35]);
const SIMULATION_GRID_SCALE = 0.42;

const EVIDENCE_BY_CODE: Record<number, ForecastEvidence> = {
  0: { weatherCode: 0, temperatureMaxC: 31, temperatureMinC: 25, apparentTemperatureMaxC: 34, precipitationProbabilityMax: 5, precipitationSumMm: 0, windGustMaxKmh: 12, uvIndexMax: 8 },
  3: { weatherCode: 3, temperatureMaxC: 29, temperatureMinC: 24, apparentTemperatureMaxC: 32, precipitationProbabilityMax: 20, precipitationSumMm: 0, windGustMaxKmh: 14, uvIndexMax: 3 },
  45: { weatherCode: 45, temperatureMaxC: 28, temperatureMinC: 24, apparentTemperatureMaxC: 30, precipitationProbabilityMax: 10, precipitationSumMm: 0, windGustMaxKmh: 8, uvIndexMax: 2 },
  53: { weatherCode: 53, temperatureMaxC: 29, temperatureMinC: 24, apparentTemperatureMaxC: 31, precipitationProbabilityMax: 55, precipitationSumMm: 0.4, windGustMaxKmh: 16, uvIndexMax: 3 },
  63: { weatherCode: 63, temperatureMaxC: 28, temperatureMinC: 24, apparentTemperatureMaxC: 31, precipitationProbabilityMax: 75, precipitationSumMm: 4.2, windGustMaxKmh: 24, uvIndexMax: 2 },
  75: { weatherCode: 75, temperatureMaxC: 2, temperatureMinC: -2, apparentTemperatureMaxC: -3, precipitationProbabilityMax: 80, precipitationSumMm: 5, windGustMaxKmh: 20, uvIndexMax: 1 },
  81: { weatherCode: 81, temperatureMaxC: 29, temperatureMinC: 25, apparentTemperatureMaxC: 33, precipitationProbabilityMax: 82, precipitationSumMm: 6.5, windGustMaxKmh: 30, uvIndexMax: 3 },
  95: { weatherCode: 95, temperatureMaxC: 30, temperatureMinC: 24, apparentTemperatureMaxC: 34, precipitationProbabilityMax: 90, precipitationSumMm: 12, windGustMaxKmh: 45, uvIndexMax: 2 },
};

function riskForCode(code: number, hour: number): ForecastRisk {
  if (code === 95) {
    return { level: "high", reasons: ["thunderstorm"], ruleVersion: "2026-09-v1", window: { startHour: hour, endHour: hour } };
  }
  if (code === 53 || code === 63 || code === 81) {
    return { level: "caution", reasons: ["rain"], ruleVersion: "2026-09-v1", window: { startHour: hour, endHour: hour } };
  }
  if (code === 75) {
    return { level: "caution", reasons: [], ruleVersion: "2026-09-v1", window: null };
  }
  return { level: "none", reasons: [], ruleVersion: "2026-09-v1", window: null };
}

export function simulatedWeatherCodeForHour(hour: number) {
  return CODE_BY_HOUR[hour] ?? 0;
}

export function simulatedWeatherConditionKeyForHour(hour: number) {
  return CONDITION_KEY_BY_HOUR[hour] ?? "clear";
}

export function buildSimulatedWeatherResult(date: string, hour: number): WeatherTargetResult {
  const weatherCode = simulatedWeatherCodeForHour(hour);
  const evidence = EVIDENCE_BY_CODE[weatherCode] ?? EVIDENCE_BY_CODE[0];

  return {
    target: {
      key: `simulation:${date}:${hour}`,
      date,
      latitude: 5.4141,
      longitude: 100.3288,
      label: "Simulated weather",
      kind: "day",
      itemId: "simulated-weather",
    },
    forecast: {
      availability: "forecast",
      provider: "open_meteo",
      latitude: 5.4141,
      longitude: 100.3288,
      timezone: "Asia/Kuala_Lumpur",
      date,
      fetchedAt: `${date}T00:00:00.000Z`,
      stale: false,
      evidence,
      hours: [{
        hour,
        weatherCode,
        precipitationProbability: evidence.precipitationProbabilityMax,
        precipitationMm: evidence.precipitationSumMm,
      }],
    },
    risk: riskForCode(weatherCode, hour),
  };
}

function simulatedPrecipitation(code: number) {
  if (code === 53) return 0.4;
  if (code === 63) return 4;
  if (code === 81) return 6;
  if (code === 95) return 9;
  return 0;
}

export function buildSimulatedWeatherOverlay(
  date: string,
  hour: number,
  anchor: { lat: number; lng: number },
): WeatherOverlayResult {
  const activeCode = simulatedWeatherCodeForHour(hour);
  const activePrecipitation = simulatedPrecipitation(activeCode);
  const samples: WeatherOverlaySample[] = buildWeatherSampleGrid([anchor]).map((coordinate, index) => {
    const active = ACTIVE_SAMPLE_INDEXES.has(index) && activeCode !== 0;
    const weatherCode = active ? activeCode : 0;
    const precipitationMm = active ? activePrecipitation : 0;
    return {
      latitude: anchor.lat + (coordinate.latitude - anchor.lat) * SIMULATION_GRID_SCALE,
      longitude: anchor.lng + (coordinate.longitude - anchor.lng) * SIMULATION_GRID_SCALE,
      precipitationMm,
      precipitationProbability: precipitationMm > 0 ? 90 : 5,
      weatherCode,
      cloudCover: active ? (activeCode === 3 ? 100 : 88) : 8,
      windSpeedKmh: active ? 18 : 8,
      windDirectionDeg: 240,
    };
  });
  const precipitationGeometry = buildPrecipitationContours(samples);
  return {
    availability: "forecast",
    provider: "open_meteo",
    date,
    hour,
    timezone: "Asia/Kuala_Lumpur",
    fetchedAt: `${date}T00:00:00.000Z`,
    stale: false,
    samples,
    ...precipitationGeometry,
    conditionContours: buildWeatherConditionContours(samples),
  };
}
