import { contours as createContours } from "d3-contour";
import { weatherEffectConditionForCode, type WeatherEffectCondition } from "@/lib/weather/conditions";
import type {
  RainBandLevel,
  WeatherContourProperties,
  WeatherOverlayResult,
  WeatherOverlaySample,
} from "@/lib/weather/types";

export const OVERLAY_RULE_VERSION = "2026-09-v1" as const;
export const OVERLAY_MIN_PROBABILITY = 40;
export const RAIN_THRESHOLDS_MM = { light: 0.1, moderate: 2.5, heavy: 7.5 } as const;
export const MAX_OVERLAY_SAMPLES = 48;

const GRID_WIDTH = 8;
const GRID_HEIGHT = 6;
const SURFACE_WIDTH = 40;
const SURFACE_HEIGHT = 30;
const SINGLE_POINT_LAT_PAD = 0.09;
const SINGLE_POINT_LNG_PAD = 0.12;
const MIN_LAT_PAD = 0.04;
const MIN_LNG_PAD = 0.05;
const MAX_LAT_SPAN = 0.36;
const MAX_LNG_SPAN = 0.48;
const EFFECT_CONDITIONS: WeatherEffectCondition[] = [
  "thunderstorm",
  "snow",
  "showers",
  "rain",
  "drizzle",
  "fog",
  "overcast",
];

function finiteCoordinate(point: { lat: number; lng: number }) {
  return Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && point.lat >= -90 && point.lat <= 90 && point.lng >= -180 && point.lng <= 180;
}

function round4(value: number) {
  return Number(value.toFixed(4));
}

export function buildWeatherSampleGrid(points: Array<{ lat: number; lng: number }>) {
  const valid = points.filter(finiteCoordinate);
  if (valid.length === 0) return [];

  const latitudes = valid.map((point) => point.lat);
  const longitudes = valid.map((point) => point.lng);
  const centreLat = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  const centreLng = (Math.min(...longitudes) + Math.max(...longitudes)) / 2;
  const latSpan = Math.min(MAX_LAT_SPAN, Math.max(SINGLE_POINT_LAT_PAD, Math.max(...latitudes) - Math.min(...latitudes) + MIN_LAT_PAD * 2));
  const lngSpan = Math.min(MAX_LNG_SPAN, Math.max(SINGLE_POINT_LNG_PAD, Math.max(...longitudes) - Math.min(...longitudes) + MIN_LNG_PAD * 2));
  const minLat = centreLat - latSpan / 2;
  const minLng = centreLng - lngSpan / 2;

  return Array.from({ length: GRID_WIDTH * GRID_HEIGHT }, (_, index) => {
    const x = index % GRID_WIDTH;
    const y = Math.floor(index / GRID_WIDTH);
    return {
      latitude: round4(minLat + (latSpan * y) / (GRID_HEIGHT - 1)),
      longitude: round4(minLng + (lngSpan * x) / (GRID_WIDTH - 1)),
    };
  });
}

function emptyContours(): WeatherOverlayResult["contours"] {
  return { type: "FeatureCollection", features: [] };
}

function emptyBoundary(): WeatherOverlayResult["rainBoundary"] {
  return { type: "FeatureCollection", features: [] };
}

function emptyConditionContours(): WeatherOverlayResult["conditionContours"] {
  return { type: "FeatureCollection", features: [] };
}

function orderedGrid(samples: WeatherOverlaySample[]) {
  const latitudes = [...new Set(samples.map((sample) => sample.latitude))].sort((a, b) => a - b);
  const longitudes = [...new Set(samples.map((sample) => sample.longitude))].sort((a, b) => a - b);
  if (latitudes.length < 2 || longitudes.length < 2 || latitudes.length * longitudes.length !== samples.length) return null;
  const byCoordinate = new Map(samples.map((sample) => [`${sample.latitude}:${sample.longitude}`, sample]));
  const values = latitudes.flatMap((latitude) => longitudes.map((longitude) => {
    const sample = byCoordinate.get(`${latitude}:${longitude}`);
    if (!sample || sample.precipitationProbability === null || sample.precipitationProbability < OVERLAY_MIN_PROBABILITY) return 0;
    return Math.max(0, sample.precipitationMm);
  }));
  const orderedSamples = latitudes.flatMap((latitude) => longitudes.map((longitude) => (
    byCoordinate.get(`${latitude}:${longitude}`) ?? null
  )));
  return { latitudes, longitudes, values, orderedSamples };
}

function interpolateValues(sourceWidth: number, sourceHeight: number, sourceValues: number[]) {
  const values = Array.from({ length: SURFACE_WIDTH * SURFACE_HEIGHT }, (_, index) => {
    const surfaceX = index % SURFACE_WIDTH;
    const surfaceY = Math.floor(index / SURFACE_WIDTH);
    const sourceX = (surfaceX / (SURFACE_WIDTH - 1)) * (sourceWidth - 1);
    const sourceY = (surfaceY / (SURFACE_HEIGHT - 1)) * (sourceHeight - 1);
    const x0 = Math.floor(sourceX);
    const y0 = Math.floor(sourceY);
    const x1 = Math.min(sourceWidth - 1, x0 + 1);
    const y1 = Math.min(sourceHeight - 1, y0 + 1);
    const tx = sourceX - x0;
    const ty = sourceY - y0;
    const top = sourceValues[y0 * sourceWidth + x0] * (1 - tx) + sourceValues[y0 * sourceWidth + x1] * tx;
    const bottom = sourceValues[y1 * sourceWidth + x0] * (1 - tx) + sourceValues[y1 * sourceWidth + x1] * tx;
    return top * (1 - ty) + bottom * ty;
  });
  return { width: SURFACE_WIDTH, height: SURFACE_HEIGHT, values };
}

function interpolateSurface(grid: NonNullable<ReturnType<typeof orderedGrid>>) {
  return interpolateValues(grid.longitudes.length, grid.latitudes.length, grid.values);
}

function convertCoordinate(
  coordinate: [number, number],
  width: number,
  height: number,
  bounds: [number, number, number, number],
): [number, number] {
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const x = Math.max(0, Math.min(width - 1, coordinate[0] - 0.5));
  const y = Math.max(0, Math.min(height - 1, coordinate[1] - 0.5));
  return [
    minLng + (x / Math.max(1, width - 1)) * (maxLng - minLng),
    minLat + (y / Math.max(1, height - 1)) * (maxLat - minLat),
  ];
}

function samePoint(first: [number, number], second: [number, number]) {
  return first[0] === second[0] && first[1] === second[1];
}

function liesAlongSamplingEdge(
  first: [number, number],
  second: [number, number],
  bounds: [number, number, number, number],
) {
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const epsilon = 1e-10;
  return (Math.abs(first[0] - minLng) < epsilon && Math.abs(second[0] - minLng) < epsilon)
    || (Math.abs(first[0] - maxLng) < epsilon && Math.abs(second[0] - maxLng) < epsilon)
    || (Math.abs(first[1] - minLat) < epsilon && Math.abs(second[1] - minLat) < epsilon)
    || (Math.abs(first[1] - maxLat) < epsilon && Math.abs(second[1] - maxLat) < epsilon);
}

function boundaryFeatures(
  surface: ReturnType<typeof interpolateSurface>,
  bounds: [number, number, number, number],
): WeatherOverlayResult["rainBoundary"]["features"] {
  const wetMask = surface.values.map((value) => value >= RAIN_THRESHOLDS_MM.light ? 1 : 0);
  const contour = createContours().size([surface.width, surface.height]).thresholds([0.5])(wetMask)[0];
  if (!contour) return [];

  const features: WeatherOverlayResult["rainBoundary"]["features"] = [];
  for (const polygon of contour.coordinates) {
    for (const ring of polygon) {
      const points = ring.map((coordinate) => convertCoordinate(
        coordinate as [number, number], surface.width, surface.height, bounds,
      ));
      let line: Array<[number, number]> = [];
      const flush = () => {
        if (line.length >= 2) {
          features.push({
            type: "Feature",
            properties: { kind: "rain_boundary" },
            geometry: { type: "LineString", coordinates: line },
          });
        }
        line = [];
      };
      for (let index = 0; index < points.length - 1; index += 1) {
        const first = points[index];
        const second = points[index + 1];
        if (samePoint(first, second) || liesAlongSamplingEdge(first, second, bounds)) {
          flush();
          continue;
        }
        if (line.length === 0) line.push(first);
        else if (!samePoint(line.at(-1)!, first)) {
          flush();
          line.push(first);
        }
        line.push(second);
      }
      flush();
    }
  }
  return features;
}

function squaredDistanceToSegment(
  point: [number, number],
  start: [number, number],
  end: [number, number],
) {
  const deltaX = end[0] - start[0];
  const deltaY = end[1] - start[1];
  const denominator = deltaX * deltaX + deltaY * deltaY;
  const projection = denominator === 0 ? 0 : Math.max(0, Math.min(1,
    ((point[0] - start[0]) * deltaX + (point[1] - start[1]) * deltaY) / denominator,
  ));
  const differenceX = point[0] - (start[0] + projection * deltaX);
  const differenceY = point[1] - (start[1] + projection * deltaY);
  return differenceX * differenceX + differenceY * differenceY;
}

function dominantSample(
  samples: WeatherOverlaySample[],
  bounds: [number, number, number, number],
  boundary: WeatherOverlayResult["rainBoundary"],
) {
  const trusted = samples.filter((sample) => sample.precipitationProbability !== null
    && sample.precipitationProbability >= OVERLAY_MIN_PROBABILITY
    && sample.precipitationMm >= RAIN_THRESHOLDS_MM.light);
  if (trusted.length === 0) return null;
  const wettestMm = Math.max(...trusted.map((sample) => sample.precipitationMm));
  const dominantLevel: RainBandLevel = wettestMm >= RAIN_THRESHOLDS_MM.heavy
    ? "heavy"
    : wettestMm >= RAIN_THRESHOLDS_MM.moderate ? "moderate" : "light";
  const [lower, upper] = dominantLevel === "heavy"
    ? [RAIN_THRESHOLDS_MM.heavy, Number.POSITIVE_INFINITY]
    : dominantLevel === "moderate"
      ? [RAIN_THRESHOLDS_MM.moderate, RAIN_THRESHOLDS_MM.heavy]
      : [RAIN_THRESHOLDS_MM.light, RAIN_THRESHOLDS_MM.moderate];
  const [minLng, minLat, maxLng, maxLat] = bounds;
  const candidates = trusted.filter((sample) => sample.precipitationMm >= lower && sample.precipitationMm < upper);
  const centroid = candidates.reduce<[number, number]>(
    (total, sample) => [total[0] + sample.longitude / candidates.length, total[1] + sample.latitude / candidates.length],
    [0, 0],
  );
  const boundarySegments = boundary.features.flatMap((feature) => feature.geometry.coordinates.slice(0, -1).map((start, index) => (
    [start, feature.geometry.coordinates[index + 1]] as [[number, number], [number, number]]
  )));
  return candidates
    .map((sample, index) => {
      const point: [number, number] = [sample.longitude, sample.latitude];
      const envelopeClearance = Math.min(
        sample.longitude - minLng, maxLng - sample.longitude, sample.latitude - minLat, maxLat - sample.latitude,
      );
      const boundaryClearance = boundarySegments.length > 0
        ? Math.min(...boundarySegments.map(([start, end]) => squaredDistanceToSegment(point, start, end)))
        : envelopeClearance * envelopeClearance;
      const centroidDistance = (point[0] - centroid[0]) ** 2 + (point[1] - centroid[1]) ** 2;
      return { sample, index, boundaryClearance, centroidDistance };
    })
    .sort((first, second) => second.boundaryClearance - first.boundaryClearance
      || first.centroidDistance - second.centroidDistance
      || second.sample.precipitationMm - first.sample.precipitationMm
      || first.index - second.index)[0]?.sample ?? null;
}

export function buildPrecipitationContours(samples: WeatherOverlaySample[]): Pick<WeatherOverlayResult, "bounds" | "contours" | "rainBoundary" | "dominantCenter"> {
  const grid = orderedGrid(samples);
  if (!grid || Math.max(...grid.values) < RAIN_THRESHOLDS_MM.light) {
    return { bounds: null, contours: emptyContours(), rainBoundary: emptyBoundary(), dominantCenter: null };
  }
  const bounds: [number, number, number, number] = [
    grid.longitudes[0],
    grid.latitudes[0],
    grid.longitudes.at(-1)!,
    grid.latitudes.at(-1)!,
  ];
  const surface = interpolateSurface(grid);
  const levels = Object.entries(RAIN_THRESHOLDS_MM) as Array<[RainBandLevel, number]>;
  const features = levels.flatMap(([level, thresholdMm], index) => {
    const upperBound = levels[index + 1]?.[1] ?? Number.POSITIVE_INFINITY;
    const mask = surface.values.map((value) => value >= thresholdMm && value < upperBound ? 1 : 0);
    const contour = createContours()
      .size([surface.width, surface.height])
      .thresholds([0.5])(mask)[0];
    if (!contour || contour.coordinates.length === 0) return [];
    const coordinates = contour.coordinates.map((polygon) => polygon.map((ring) => ring.map((coordinate) => (
      convertCoordinate(coordinate as [number, number], surface.width, surface.height, bounds)
    ))));
    return [{
      type: "Feature" as const,
      properties: { level, thresholdMm } satisfies WeatherContourProperties,
      geometry: { type: "MultiPolygon" as const, coordinates },
    }];
  });
  const contours: WeatherOverlayResult["contours"] = { type: "FeatureCollection", features };
  const rainBoundary: WeatherOverlayResult["rainBoundary"] = {
    type: "FeatureCollection",
    features: boundaryFeatures(surface, bounds),
  };
  const dominant = dominantSample(samples, bounds, rainBoundary);
  return {
    bounds,
    contours,
    rainBoundary,
    dominantCenter: dominant ? [dominant.longitude, dominant.latitude] : null,
  };
}

export function buildWeatherConditionContours(samples: WeatherOverlaySample[]): WeatherOverlayResult["conditionContours"] {
  const grid = orderedGrid(samples);
  if (!grid) return emptyConditionContours();

  const width = grid.longitudes.length;
  const height = grid.latitudes.length;
  const bounds: [number, number, number, number] = [
    grid.longitudes[0],
    grid.latitudes[0],
    grid.longitudes.at(-1)!,
    grid.latitudes.at(-1)!,
  ];
  const scores = new Map(EFFECT_CONDITIONS.map((condition) => [
    condition,
    interpolateValues(width, height, grid.orderedSamples.map((sample) => (
      weatherEffectConditionForCode(sample?.weatherCode ?? null) === condition ? 1 : 0
    ))).values,
  ]));
  const winners = Array.from({ length: SURFACE_WIDTH * SURFACE_HEIGHT }, (_, index) => {
    let winner: WeatherEffectCondition | null = null;
    let winningScore = 0.5;
    for (const condition of EFFECT_CONDITIONS) {
      const score = scores.get(condition)?.[index] ?? 0;
      if (score > winningScore) {
        winner = condition;
        winningScore = score;
      }
    }
    return winner;
  });
  const features: WeatherOverlayResult["conditionContours"]["features"] = EFFECT_CONDITIONS.flatMap((condition) => {
    const mask = winners.map((winner) => winner === condition ? 1 : 0);
    const contour = createContours().size([SURFACE_WIDTH, SURFACE_HEIGHT]).thresholds([0.5])(mask)[0];
    if (!contour || contour.coordinates.length === 0) return [];
    return [{
      type: "Feature" as const,
      properties: { condition },
      geometry: {
        type: "MultiPolygon" as const,
        coordinates: contour.coordinates.map((polygon) => polygon.map((ring) => ring.map((coordinate) => (
          convertCoordinate(coordinate as [number, number], SURFACE_WIDTH, SURFACE_HEIGHT, bounds)
        )))),
      },
    }];
  });
  return { type: "FeatureCollection", features };
}
