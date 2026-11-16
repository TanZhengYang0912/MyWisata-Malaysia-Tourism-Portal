import { describe, expect, it } from "vitest";
import {
  buildForecastIntensitySampler,
  forecastIntensityAt,
  hasBoundedForecastRain,
  hasCompleteForecastGrid,
  isRadarCoverageAvailable,
  retainRainParticleCandidate,
  rainViewerDbzForPixel,
  sampleRadarIntensity,
  tilePixelForCoordinate,
  weatherAtmosphereFade,
} from "@/lib/weather/rain-mask";

describe("georeferenced weather mask helpers", () => {
  it("fades a fixed map atmosphere at the nearby-radius edge without using rain intensity", () => {
    expect(weatherAtmosphereFade(0, 10)).toBe(1);
    expect(weatherAtmosphereFade(8.5, 10)).toBe(1);
    expect(weatherAtmosphereFade(9.25, 10)).toBeCloseTo(0.5);
    expect(weatherAtmosphereFade(10, 10)).toBe(0);
    expect(weatherAtmosphereFade(10.1, 10)).toBe(0);
    expect(weatherAtmosphereFade(0, 0)).toBe(0);
    expect(weatherAtmosphereFade(0, null)).toBe(0);
  });

  it("keeps all rain particles when the cap is not reached", () => {
    const reservoir = { candidates: [] as number[], seen: 0 };
    retainRainParticleCandidate(reservoir, 1, 3, () => 0.5);
    retainRainParticleCandidate(reservoir, 2, 3, () => 0.5);

    expect(reservoir.candidates).toEqual([1, 2]);
    expect(reservoir.seen).toBe(2);
  });

  it("keeps no particles when the capacity is zero", () => {
    const reservoir = { candidates: [] as number[], seen: 0 };
    retainRainParticleCandidate(reservoir, 1, 0, () => 0.5);

    expect(reservoir.candidates).toEqual([]);
    expect(reservoir.seen).toBe(0);
  });

  it("samples rain particles across the full rainy region after reaching the cap", () => {
    const reservoir = { candidates: [] as Array<{ row: number }>, seen: 0 };
    for (let row = 0; row < 8; row += 1) {
      retainRainParticleCandidate(reservoir, { row }, 4, () => 0.1);
    }

    expect(reservoir.candidates).toHaveLength(4);
    expect(reservoir.candidates.some(({ row }) => row >= 4)).toBe(true);
  });

  it("uses RainViewer Universal Blue pixels and suppresses low reflectivity noise", () => {
    expect(rainViewerDbzForPixel([206, 192, 135, 150])).toBe(10);
    expect(sampleRadarIntensity([206, 192, 135, 150], true)).toBeGreaterThan(0);
    expect(sampleRadarIntensity([99, 97, 89, 20], true)).toBe(0);
    expect(sampleRadarIntensity([0, 0, 0, 0], true)).toBe(0);
  });

  it("keeps radar outside coverage unknown rather than dry", () => {
    expect(isRadarCoverageAvailable([0, 0, 0, 0])).toBe(true);
    expect(isRadarCoverageAvailable([0, 0, 0, 255])).toBe(false);
    expect(sampleRadarIntensity([206, 192, 135, 150], false)).toBeNull();
  });

  it("maps coordinates into the correct wrapped Web Mercator tile pixel", () => {
    expect(tilePixelForCoordinate(0, 0, 1)).toEqual({ x: 1, y: 1, pixelX: 0, pixelY: 0 });
    expect(tilePixelForCoordinate(0, 0, 2)).toEqual({ x: 2, y: 2, pixelX: 0, pixelY: 0 });
    expect(tilePixelForCoordinate(90, 180, 7)).toEqual({ x: 0, y: 0, pixelX: 0, pixelY: 0 });
  });

  it("interpolates only within four known forecast model cells", () => {
    const samples = [
      { latitude: 5, longitude: 100, precipitationMm: 2, precipitationProbability: 80, weatherCode: 61, cloudCover: 90, windSpeedKmh: 10, windDirectionDeg: 0 },
      { latitude: 5, longitude: 101, precipitationMm: 0, precipitationProbability: 80, weatherCode: 1, cloudCover: 10, windSpeedKmh: 10, windDirectionDeg: 0 },
      { latitude: 6, longitude: 100, precipitationMm: 0, precipitationProbability: 80, weatherCode: 1, cloudCover: 10, windSpeedKmh: 10, windDirectionDeg: 0 },
      { latitude: 6, longitude: 101, precipitationMm: 0, precipitationProbability: 80, weatherCode: 1, cloudCover: 10, windSpeedKmh: 10, windDirectionDeg: 0 },
    ];
    expect(hasCompleteForecastGrid(samples)).toBe(true);
    expect(forecastIntensityAt(samples, 5.5, 100.5)).toBeGreaterThan(0);
    expect(buildForecastIntensitySampler(samples)(5.5, 100.5)).toBe(forecastIntensityAt(samples, 5.5, 100.5));
    expect(forecastIntensityAt(samples, 4.9, 100.5)).toBeNull();
    expect(forecastIntensityAt(samples.map((sample, index) => index === 3
      ? { ...sample, precipitationProbability: null }
      : sample), 5.5, 100.5)).toBeNull();
  });


  it("accepts complete staggered Open-Meteo model cells and bounds rain by their actual footprint", () => {
    const samples = Array.from({ length: 24 }, (_, index) => {
      const row = Math.floor(index / 6);
      const column = index % 6;
      const isInteriorRain = row === 1 && column === 2;
      return {
        latitude: 5.3 + row * 0.07,
        longitude: 100.13 + column * 0.074 + row * 0.008,
        precipitationMm: isInteriorRain ? 2.5 : 0,
        precipitationProbability: isInteriorRain ? 80 : 20,
        weatherCode: isInteriorRain ? 61 : 0,
        cloudCover: 20,
        windSpeedKmh: 10,
        windDirectionDeg: 0,
      };
    });

    expect(hasCompleteForecastGrid(samples)).toBe(true);
    expect(hasBoundedForecastRain(samples)).toBe(true);
    expect(forecastIntensityAt(samples, samples[8].latitude, samples[8].longitude)).toBeGreaterThan(0);
    expect(forecastIntensityAt(samples, 5.2, 100.1)).toBeNull();
  });

  it("rejects a triangulatable but geographically sparse mesh", () => {
    const samples = [
      [5.4, 100.3], [5.405, 100.3], [5.4, 100.305], [5.405, 100.305], [6.2, 101.2],
    ].map(([latitude, longitude]) => ({
      latitude,
      longitude,
      precipitationMm: 2,
      precipitationProbability: 80,
      weatherCode: 61,
      cloudCover: 90,
      windSpeedKmh: 10,
      windDirectionDeg: 0,
    }));

    expect(hasCompleteForecastGrid(samples)).toBe(false);
    expect(hasBoundedForecastRain(samples)).toBe(false);
  });

  it("rejects forecast rain reaching the sampled grid edge instead of closing a rectangle", () => {
    const grid = Array.from({ length: 9 }, (_, index) => {
      const latitude = 5 + Math.floor(index / 3);
      const longitude = 100 + index % 3;
      const isCenter = latitude === 6 && longitude === 101;
      return {
        latitude,
        longitude,
        precipitationMm: isCenter ? 2 : 0,
        precipitationProbability: isCenter ? 80 : 5,
        weatherCode: isCenter ? 61 : 0,
        cloudCover: 10,
        windSpeedKmh: 10,
        windDirectionDeg: 0,
      };
    });
    expect(hasBoundedForecastRain(grid)).toBe(true);
    expect(hasBoundedForecastRain(grid.map((sample) => ({
      ...sample,
      precipitationMm: 2,
      precipitationProbability: 80,
    })))).toBe(false);
  });
});
