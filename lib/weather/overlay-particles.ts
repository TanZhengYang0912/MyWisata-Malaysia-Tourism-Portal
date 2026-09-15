import type { WeatherEffectCondition } from "@/lib/weather/conditions";
import type { WeatherEffectParticle, WeatherOverlayResult } from "@/lib/weather/types";

export const WEATHER_EFFECT_PRESETS = {
  fog: { count: 34, verticalSpeed: 0, horizontalSpeed: 0.45, lateralDrift: 0, cadence: "continuous", flash: false },
  drizzle: { count: 24, verticalSpeed: 0.5, horizontalSpeed: 0.08, lateralDrift: 0, cadence: "continuous", flash: false },
  rain: { count: 54, verticalSpeed: 1, horizontalSpeed: 0.16, lateralDrift: 0, cadence: "continuous", flash: false },
  showers: { count: 64, verticalSpeed: 1.15, horizontalSpeed: 0.18, lateralDrift: 0, cadence: "burst", flash: false },
  thunderstorm: { count: 72, verticalSpeed: 1.3, horizontalSpeed: 0.22, lateralDrift: 0, cadence: "continuous", flash: true },
  snow: { count: 70, verticalSpeed: 0.32, horizontalSpeed: 0.04, lateralDrift: 0.55, cadence: "continuous", flash: false },
  overcast: { count: 20, verticalSpeed: 0, horizontalSpeed: 0.28, lateralDrift: 0, cadence: "continuous", flash: false },
} as const satisfies Record<WeatherEffectCondition, {
  count: number;
  verticalSpeed: number;
  horizontalSpeed: number;
  lateralDrift: number;
  cadence: "continuous" | "burst";
  flash: boolean;
}>;

function inRing(point: [number, number], ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersects = ((yi > point[1]) !== (yj > point[1]))
      && point[0] < ((xj - xi) * (point[1] - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function inMultiPolygon(point: [number, number], coordinates: number[][][][]) {
  return coordinates.some((polygon) => inRing(point, polygon[0]) && !polygon.slice(1).some((hole) => inRing(point, hole)));
}

export function pointInWeatherContours(point: [number, number], contours: WeatherOverlayResult["contours"]) {
  return contours.features.some((feature) => inMultiPolygon(point, feature.geometry.coordinates));
}

export function pointInWeatherConditionContours(
  point: [number, number],
  contours: WeatherOverlayResult["conditionContours"],
  condition: WeatherEffectCondition,
) {
  return contours.features.some((feature) => feature.properties.condition === condition
    && inMultiPolygon(point, feature.geometry.coordinates));
}

function contourPoints(contours: { features: Array<{ geometry: { coordinates: number[][][][] } }> }) {
  return contours.features.flatMap((feature) => feature.geometry.coordinates.flat(2)) as Array<[number, number]>;
}

export function weatherEffectBounds(contours: WeatherOverlayResult["conditionContours"]): [number, number, number, number] | null {
  const points = contourPoints(contours);
  if (points.length === 0) return null;
  return [
    Math.min(...points.map(([lng]) => lng)),
    Math.min(...points.map(([, lat]) => lat)),
    Math.max(...points.map(([lng]) => lng)),
    Math.max(...points.map(([, lat]) => lat)),
  ];
}

function seedCoordinates(
  contours: { features: Array<{ geometry: { coordinates: number[][][][] } }> },
  contains: (point: [number, number]) => boolean,
  count: number,
  random: () => number,
) {
  if (count <= 0) return [];
  const points = contourPoints(contours);
  if (points.length === 0) return [];
  const minLng = Math.min(...points.map(([lng]) => lng));
  const maxLng = Math.max(...points.map(([lng]) => lng));
  const minLat = Math.min(...points.map(([, lat]) => lat));
  const maxLat = Math.max(...points.map(([, lat]) => lat));
  const seeded: Array<[number, number]> = [];
  for (let attempts = 0; attempts < count * 100 && seeded.length < count; attempts += 1) {
    const candidate: [number, number] = [
      minLng + random() * (maxLng - minLng),
      minLat + random() * (maxLat - minLat),
    ];
    if (contains(candidate)) seeded.push(candidate);
  }
  return seeded;
}

export function seedWeatherEffectParticles(
  contours: WeatherOverlayResult["conditionContours"],
  random: () => number = Math.random,
): WeatherEffectParticle[] {
  return (Object.keys(WEATHER_EFFECT_PRESETS) as WeatherEffectCondition[]).flatMap((condition) => {
    const features = contours.features.filter((feature) => feature.properties.condition === condition);
    const subset = { type: "FeatureCollection" as const, features };
    return seedCoordinates(
      subset,
      (point) => pointInWeatherConditionContours(point, contours, condition),
      WEATHER_EFFECT_PRESETS[condition].count,
      random,
    ).map((coordinates) => ({ coordinates, condition, phase: random() }));
  });
}

export function advanceWeatherEffectParticles(
  particles: WeatherEffectParticle[],
  contours: WeatherOverlayResult["conditionContours"],
  tick: number,
  random: () => number = Math.random,
): WeatherEffectParticle[] {
  const bounds = weatherEffectBounds(contours);
  if (!bounds) return [];
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const lngSpan = Math.max(maxLng - minLng, 0.0001);
  const latSpan = Math.max(maxLat - minLat, 0.0001);
  return particles.map((particle) => {
    const preset = WEATHER_EFFECT_PRESETS[particle.condition];
    const snowDrift = Math.sin(tick * 0.32 + particle.phase * Math.PI * 2)
      * preset.lateralDrift * lngSpan / 520;
    const candidate: [number, number] = [
      particle.coordinates[0] + preset.horizontalSpeed * lngSpan / 420 + snowDrift,
      particle.coordinates[1] - preset.verticalSpeed * latSpan / 90,
    ];
    if (pointInWeatherConditionContours(candidate, contours, particle.condition)) {
      return { ...particle, coordinates: candidate };
    }
    const features = contours.features.filter((feature) => feature.properties.condition === particle.condition);
    const subset = { type: "FeatureCollection" as const, features };
    const replacement = seedCoordinates(
      subset,
      (point) => pointInWeatherConditionContours(point, contours, particle.condition),
      1,
      random,
    )[0];
    return replacement ? { ...particle, coordinates: replacement, phase: random() } : particle;
  });
}

export function seedRainParticles(
  contours: WeatherOverlayResult["contours"],
  count: number,
  random: () => number = Math.random,
) {
  return seedCoordinates(contours, (point) => pointInWeatherContours(point, contours), count, random);
}
