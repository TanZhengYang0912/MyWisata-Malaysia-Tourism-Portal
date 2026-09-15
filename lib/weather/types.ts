import type { WeatherEffectCondition } from "@/lib/weather/conditions";

export type ForecastAvailability = "forecast" | "unavailable_yet" | "unavailable";

export type ForecastRiskLevel = "none" | "caution" | "high" | "unknown";

export type ForecastRiskReason = "thunderstorm" | "heavy_rain" | "rain" | "strong_wind" | "extreme_uv";

export type ForecastEvidence = {
  weatherCode: number;
  temperatureMaxC: number | null;
  temperatureMinC: number | null;
  apparentTemperatureMaxC: number | null;
  precipitationProbabilityMax: number | null;
  precipitationSumMm: number | null;
  windGustMaxKmh: number | null;
  uvIndexMax: number | null;
};

export type ForecastHourEvidence = {
  hour: number;
  weatherCode: number | null;
  precipitationProbability: number | null;
  precipitationMm: number | null;
};

export type ForecastRiskWindow = {
  startHour: number;
  endHour: number;
};

export type NormalizedForecast = {
  availability: ForecastAvailability;
  provider: "open_meteo";
  latitude: number;
  longitude: number;
  timezone: string;
  date: string;
  fetchedAt: string;
  stale: boolean;
  evidence: ForecastEvidence | null;
  hours: ForecastHourEvidence[];
};

export type ForecastRisk = {
  level: ForecastRiskLevel;
  reasons: ForecastRiskReason[];
  ruleVersion: "2026-09-v1";
  window: ForecastRiskWindow | null;
};

export type WeatherTarget = {
  key: string;
  date: string;
  latitude: number;
  longitude: number;
  label: string;
  kind: "day" | "item";
  itemId: string;
};

export type WeatherTargetResult = {
  target: WeatherTarget;
  forecast: NormalizedForecast;
  risk: ForecastRisk;
};

export type WeatherBatchResponse = {
  results: Record<string, WeatherTargetResult>;
};

export type WeatherOverlaySample = {
  latitude: number;
  longitude: number;
  precipitationMm: number;
  precipitationProbability: number | null;
  weatherCode: number | null;
  cloudCover: number | null;
  windSpeedKmh: number | null;
  windDirectionDeg: number | null;
};

export type RainBandLevel = "light" | "moderate" | "heavy";

export type WeatherMapMode = "now" | "forecast";

export type RadarOverlayResult = {
  availability: "radar" | "unavailable";
  provider: "rainviewer";
  observedAt: string | null;
  fetchedAt: string;
  stale: boolean;
  tileUrlTemplate: string | null;
  maxZoom: 7;
  attributionLabel: "RainViewer";
  attributionUrl: "https://www.rainviewer.com/";
};

export type WeatherContourProperties = {
  level: RainBandLevel;
  thresholdMm: number;
};

export type WeatherConditionContourProperties = {
  condition: WeatherEffectCondition;
};

export type WeatherEffectParticle = {
  coordinates: [number, number];
  condition: WeatherEffectCondition;
  phase: number;
};

export type WeatherOverlayResult = {
  availability: ForecastAvailability;
  provider: "open_meteo";
  date: string;
  hour: number;
  timezone: string;
  fetchedAt: string;
  stale: boolean;
  bounds: [number, number, number, number] | null;
  samples: WeatherOverlaySample[];
  contours: GeoJSON.FeatureCollection<GeoJSON.MultiPolygon, WeatherContourProperties>;
  conditionContours: GeoJSON.FeatureCollection<GeoJSON.MultiPolygon, WeatherConditionContourProperties>;
  rainBoundary: GeoJSON.FeatureCollection<GeoJSON.LineString, { kind: "rain_boundary" }>;
  dominantCenter: [number, number] | null;
};
