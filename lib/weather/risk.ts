import type { ComputedActivity } from "@/backend/core/types";
import type {
  ForecastHourEvidence,
  ForecastRisk,
  ForecastRiskWindow,
  NormalizedForecast,
} from "@/lib/weather/types";

export type WeatherSensitivity = "weather_sensitive" | "not_weather_sensitive" | "unknown";

const WEATHER_SENSITIVE_TYPES = new Set(["nature", "adventure", "water", "sightseeing"]);
const THUNDERSTORM_CODES = new Set([95, 96, 99]);
const HIGH_RAIN_CODES = new Set([65, 67, 82]);
const MIN_RAIN_MM = 0.1;
const MIN_RAIN_PROBABILITY = 40;

export function deriveForecastRiskWindow(hours: ForecastHourEvidence[]): ForecastRiskWindow | null {
  const qualifyingHours = hours
    .filter((hour) => THUNDERSTORM_CODES.has(hour.weatherCode ?? -1)
      || HIGH_RAIN_CODES.has(hour.weatherCode ?? -1)
      || ((hour.precipitationMm ?? 0) >= MIN_RAIN_MM
        && (hour.precipitationProbability ?? 0) >= MIN_RAIN_PROBABILITY))
    .map((hour) => hour.hour)
    .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23)
    .sort((first, second) => first - second);

  const startHour = qualifyingHours[0];
  if (startHour === undefined) return null;
  let endHour = startHour;
  for (const hour of qualifyingHours.slice(1)) {
    if (hour === endHour) continue;
    if (hour !== endHour + 1) break;
    endHour = hour;
  }
  return { startHour, endHour };
}

export function classifyWeatherSensitivity(
  activity: Pick<ComputedActivity, "typeSlugs" | "attributes"> | undefined,
): WeatherSensitivity {
  if (!activity) return "unknown";

  const indoorOutdoor = typeof activity.attributes?.indoorOutdoor === "string"
    ? activity.attributes.indoorOutdoor.trim().toLowerCase()
    : "";
  if (indoorOutdoor === "indoor") return "not_weather_sensitive";
  if (indoorOutdoor === "outdoor" || indoorOutdoor === "both") return "weather_sensitive";
  if (activity.typeSlugs?.some((slug) => WEATHER_SENSITIVE_TYPES.has(slug.toLowerCase()))) {
    return "weather_sensitive";
  }
  return "unknown";
}

export function evaluateForecastRisk(forecast: NormalizedForecast): ForecastRisk {
  if (forecast.availability !== "forecast" || !forecast.evidence) {
    return { level: "unknown", reasons: [], ruleVersion: "2026-09-v1", window: null };
  }

  const evidence = forecast.evidence;
  const reasons: ForecastRisk["reasons"] = [];
  let level: ForecastRisk["level"] = "none";

  if (THUNDERSTORM_CODES.has(evidence.weatherCode)) {
    reasons.push("thunderstorm");
    level = "high";
  }

  const highRainCode = HIGH_RAIN_CODES.has(evidence.weatherCode);
  const numericHeavyRain = evidence.precipitationProbabilityMax !== null
    && evidence.precipitationProbabilityMax >= 60
    && evidence.precipitationSumMm !== null
    && evidence.precipitationSumMm >= 10;
  if (highRainCode || numericHeavyRain) {
    reasons.push("heavy_rain");
    if (highRainCode) level = "high";
    else if (level === "none") level = "caution";
  }

  if (evidence.windGustMaxKmh !== null && evidence.windGustMaxKmh >= 40) {
    reasons.push("strong_wind");
    if (evidence.windGustMaxKmh >= 60) level = "high";
    else if (level === "none") level = "caution";
  }

  const ordinaryRain = !highRainCode
    && ((evidence.weatherCode >= 51 && evidence.weatherCode <= 67)
      || evidence.weatherCode === 80
      || evidence.weatherCode === 81);
  if (ordinaryRain && !reasons.includes("heavy_rain")) {
    reasons.push("rain");
    if (level === "none") level = "caution";
  }

  if (evidence.uvIndexMax !== null && evidence.uvIndexMax >= 8) {
    reasons.push("extreme_uv");
    if (level === "none") level = "caution";
  }

  const hasCompleteNeutralEvidence = evidence.precipitationProbabilityMax !== null
    && evidence.precipitationSumMm !== null
    && evidence.windGustMaxKmh !== null
    && evidence.uvIndexMax !== null;
  if (reasons.length === 0 && !hasCompleteNeutralEvidence) {
    return { level: "unknown", reasons: [], ruleVersion: "2026-09-v1", window: null };
  }

  return { level, reasons, ruleVersion: "2026-09-v1", window: deriveForecastRiskWindow(forecast.hours) };
}

export function evaluateForecastRiskAtHour(forecast: NormalizedForecast, hour: number): ForecastRisk {
  if (forecast.availability !== "forecast" || !Number.isInteger(hour) || hour < 0 || hour > 23) {
    return { level: "unknown", reasons: [], ruleVersion: "2026-09-v1", window: null };
  }

  const evidence = forecast.hours.find((entry) => entry.hour === hour);
  if (!evidence) return { level: "unknown", reasons: [], ruleVersion: "2026-09-v1", window: null };

  const reasons: ForecastRisk["reasons"] = [];
  let level: ForecastRisk["level"] = "none";
  const weatherCode = evidence.weatherCode;
  const rainfall = evidence.precipitationMm;
  const probability = evidence.precipitationProbability;

  if (weatherCode !== null && THUNDERSTORM_CODES.has(weatherCode)) {
    reasons.push("thunderstorm");
    level = "high";
  }

  if (weatherCode !== null && HIGH_RAIN_CODES.has(weatherCode)) {
    reasons.push("heavy_rain");
    level = "high";
  } else if (weatherCode !== null && !THUNDERSTORM_CODES.has(weatherCode)
    && rainfall !== null && rainfall >= 0.1 && probability !== null && probability >= 40) {
    reasons.push("rain");
    level = "caution";
  }

  if (reasons.length === 0 && weatherCode === null && (rainfall === null || probability === null)) {
    level = "unknown";
  }

  return { level, reasons, ruleVersion: "2026-09-v1", window: null };
}
