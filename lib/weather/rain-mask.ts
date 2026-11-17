import type { WeatherOverlaySample } from "@/lib/weather/types";
import { buildScatteredWeatherGrid, distanceToWeatherGridBoundary, maximumWeatherGridTriangleEdge, nearestWeatherCellSpacing } from "@/lib/weather/scattered-grid";

const RAINVIEWER_UNIVERSAL_BLUE = "63615966635a69665c6c685d6f6b5f726e617570627873647c75657f7867827b69857d6a88806c8b826d8e856f9288719e9375aa9e79b6a97ec2b482cec087d2c48bd6c88fdacc93ded09788ddee6cd1eb51c5e836bae51baee200a3e0009ad50091ca0088bf007fb40077aa0070a300699c006295005b8e005588005180004e78004a70004768ffee00ffe000ffd200ffc500ffb700ffaa00ff9f00ff9500ff8b00ff8100ff4400f23600e62800d91b00cd0d00c10000a800008f00007600005d0000ffaaffff9fffff95ffff8bffff81ffff77ffff6cffff62ffff58ffff4effffffffffffffffffffffffffffffffffffff";
const FIRST_RAIN_DBZ = -10;
const MIN_RAIN_DBZ = 10;
const DBZ_RANGE = 60;
export const RADAR_ECHO_WEAK = [104, 185, 214] as const;
export const RADAR_ECHO_STRONG = [36, 80, 158] as const;

const rainPalette = Array.from({ length: 81 }, (_, index) => {
  const offset = index * 6;
  const red = Number.parseInt(RAINVIEWER_UNIVERSAL_BLUE.slice(offset, offset + 2), 16);
  const green = Number.parseInt(RAINVIEWER_UNIVERSAL_BLUE.slice(offset + 2, offset + 4), 16);
  const blue = Number.parseInt(RAINVIEWER_UNIVERSAL_BLUE.slice(offset + 4, offset + 6), 16);
  return { dbz: FIRST_RAIN_DBZ + index, red, green, blue, key: (red << 16) | (green << 8) | blue };
});
const exactRainPalette = new Map(rainPalette.map(({ key, dbz }) => [key, dbz]));
const approximateRainPalette = new Map<number, number | null>();

export function weatherAtmosphereFade(distanceKm: number, radiusKm: number | null | undefined) {
  if (!Number.isFinite(distanceKm) || distanceKm < 0 || radiusKm === null || radiusKm === undefined
    || !Number.isFinite(radiusKm) || radiusKm <= 0) return 0;

  const fadeWidthKm = Math.min(radiusKm * 0.15, 2);
  const fadeProgress = Math.max(0, Math.min(1, (radiusKm - distanceKm) / fadeWidthKm));
  return fadeProgress * fadeProgress * (3 - 2 * fadeProgress);
}

export function retainRainParticleCandidate<T>(
  reservoir: { candidates: T[]; seen: number },
  candidate: T,
  capacity: number,
  random: () => number,
) {
  const limit = Math.max(0, Math.floor(capacity));
  if (limit === 0) return;

  reservoir.seen += 1;
  if (reservoir.candidates.length < limit) {
    reservoir.candidates.push(candidate);
    return;
  }

  const index = Math.floor(random() * reservoir.seen);
  if (index < limit) reservoir.candidates[index] = candidate;
}

export function hasCompleteForecastGrid(samples: WeatherOverlaySample[]) {
  if (samples.length < 4 || samples.some((sample) => sample.precipitationProbability === null)) return false;
  const coordinates = new Set(samples.map((sample) => `${sample.latitude}:${sample.longitude}`));
  if (coordinates.size !== samples.length) return false;
  const grid = buildScatteredWeatherGrid(samples);
  const typicalCellSpacing = nearestWeatherCellSpacing(grid);
  return grid.hull.length >= 3 && grid.triangles.length >= 2 && typicalCellSpacing > 0
    && maximumWeatherGridTriangleEdge(grid) <= typicalCellSpacing * 4;
}

export function hasBoundedForecastRain(samples: WeatherOverlaySample[]) {
  if (!hasCompleteForecastGrid(samples)) return false;
  const grid = buildScatteredWeatherGrid(samples);
  const interiorClearance = nearestWeatherCellSpacing(grid) * 0.55;
  let hasInteriorRain = false;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (!isForecastRainSample(sample)) continue;
    if (distanceToWeatherGridBoundary(grid, index) <= interiorClearance) return false;
    hasInteriorRain = true;
  }
  return hasInteriorRain;
}

export function isForecastRainSample(sample: WeatherOverlaySample) {
  return sample.precipitationProbability !== null && sample.precipitationProbability >= 40 && sample.precipitationMm >= 0.1;
}

function rainViewerDbzForRgb(red: number, green: number, blue: number) {
  const key = (red << 16) | (green << 8) | blue;
  const exact = exactRainPalette.get(key);
  if (exact !== undefined) return exact;
  if (approximateRainPalette.has(key)) return approximateRainPalette.get(key) ?? null;

  let closest: { dbz: number; distance: number } | null = null;
  for (const { dbz, red: expectedRed, green: expectedGreen, blue: expectedBlue } of rainPalette) {
    const distance = (red - expectedRed) ** 2 + (green - expectedGreen) ** 2 + (blue - expectedBlue) ** 2;
    if (!closest || distance < closest.distance) closest = { dbz, distance };
  }
  const result = closest && closest.distance <= 18 ** 2 ? closest.dbz : null;
  if (approximateRainPalette.size >= 256) approximateRainPalette.clear();
  approximateRainPalette.set(key, result);
  return result;
}

export function rainViewerDbzForPixel(pixel: ArrayLike<number>) {
  if (pixel[3] === 0) return null;
  return rainViewerDbzForRgb(pixel[0], pixel[1], pixel[2]);
}

export function isRadarCoverageAvailable(pixel: ArrayLike<number>) {
  return pixel[3] === 0;
}

export function sampleRadarIntensity(pixel: ArrayLike<number>, isCovered: boolean): number | null {
  if (!isCovered) return null;
  if (pixel[3] === 0) return 0;
  const dbz = rainViewerDbzForPixel(pixel);
  return radarIntensityForDbz(dbz);
}

function radarIntensityForDbz(dbz: number | null) {
  if (dbz === null) return null;
  if (dbz < MIN_RAIN_DBZ) return 0;
  return Math.min(1, (dbz - MIN_RAIN_DBZ + 1) / DBZ_RANGE);
}

export function sampleRadarIntensityAt(rgba: Uint8ClampedArray, pixelIndex: number, isCovered: boolean) {
  if (!isCovered) return null;
  if (rgba[pixelIndex + 3] === 0) return 0;
  const dbz = rainViewerDbzForRgb(rgba[pixelIndex], rgba[pixelIndex + 1], rgba[pixelIndex + 2]);
  return radarIntensityForDbz(dbz);
}

export function radarEchoShade(intensity: number | null): readonly [number, number, number, number] | null {
  if (intensity === null || !Number.isFinite(intensity) || intensity <= 0) return null;
  const blend = Math.sqrt(Math.min(intensity, 1));
  const mix = (index: 0 | 1 | 2) => Math.round(
    RADAR_ECHO_WEAK[index] + (RADAR_ECHO_STRONG[index] - RADAR_ECHO_WEAK[index]) * blend,
  );
  return [mix(0), mix(1), mix(2), Math.round(46 + blend * 112)];
}

export function tilePixelForCoordinate(latitude: number, longitude: number, zoom: number) {
  const tileCount = 2 ** Math.max(0, Math.min(22, Math.floor(zoom)));
  const longitudeWrapped = ((longitude + 180) % 360 + 360) % 360;
  const latitudeClamped = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const radians = (latitudeClamped * Math.PI) / 180;
  const pixelXGlobal = ((longitudeWrapped / 360) * tileCount) * 256;
  const pixelYGlobal = Math.max(0, Math.min(tileCount * 256 - 1,
    ((1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2 * tileCount) * 256,
  ));
  const globalX = Math.floor(pixelXGlobal);
  const globalY = Math.floor(pixelYGlobal);
  const x = Math.floor(globalX / 256);
  const y = Math.floor(globalY / 256);
  return { x, y, pixelX: globalX - x * 256, pixelY: globalY - y * 256 };
}

export function buildForecastIntensitySampler(samples: WeatherOverlaySample[]) {
  const grid = buildScatteredWeatherGrid(samples);
  return (latitude: number, longitude: number) => grid.interpolate(latitude, longitude, (sample) => {
    if (sample.precipitationProbability === null) return null;
    if (sample.precipitationProbability < 40 || sample.precipitationMm < 0.1) return 0;
    const amount = Math.min(1, (sample.precipitationMm - 0.1 + 0.02) / 2.4);
    return amount * sample.precipitationProbability / 100;
  });
}

export function forecastIntensityAt(samples: WeatherOverlaySample[], latitude: number, longitude: number) {
  return buildForecastIntensitySampler(samples)(latitude, longitude);
}
