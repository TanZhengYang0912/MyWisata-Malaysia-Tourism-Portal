import { describe, expect, it } from "vitest";
import {
  buildPrecipitationContours,
  buildWeatherConditionContours,
  buildWeatherSampleGrid,
} from "@/lib/weather/overlay";
import {
  advanceWeatherEffectParticles,
  pointInWeatherConditionContours,
  pointInWeatherContours,
  seedRainParticles,
  seedWeatherEffectParticles,
  WEATHER_EFFECT_PRESETS,
} from "@/lib/weather/overlay-particles";
import { canUseLiveRadar, defaultOverlayHour, malaysiaDateHour } from "@/lib/weather/overlay-time";
import type { WeatherOverlayResult, WeatherOverlaySample } from "@/lib/weather/types";

function pointInRing(point: [number, number], ring: number[][]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [x, y] = ring[index];
    const [previousX, previousY] = ring[previous];
    const intersects = ((y > point[1]) !== (previousY > point[1]))
      && point[0] < ((previousX - x) * (point[1] - y)) / ((previousY - y) || Number.EPSILON) + x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInFeature(
  point: [number, number],
  feature: GeoJSON.Feature<GeoJSON.MultiPolygon>,
) {
  return feature.geometry.coordinates.some((polygon) => (
    pointInRing(point, polygon[0])
    && !polygon.slice(1).some((hole) => pointInRing(point, hole))
  ));
}

function conditionGrid(): WeatherOverlaySample[] {
  const codes = [45, 45, 53, 63, 81, 95, 75, 3];
  return Array.from({ length: 48 }, (_, index) => {
    const x = index % 8;
    const y = Math.floor(index / 8);
    return {
      latitude: 5.3 + y * 0.02,
      longitude: 100.2 + x * 0.02,
      precipitationMm: [53, 63, 81, 95].includes(codes[x]) ? 4 : 0,
      precipitationProbability: [53, 63, 81, 95].includes(codes[x]) ? 80 : 10,
      weatherCode: codes[x],
      cloudCover: codes[x] === 3 ? 100 : 80,
      windSpeedKmh: 18,
      windDirectionDeg: 240,
    };
  });
}

function sampleGrid(): WeatherOverlaySample[] {
  return Array.from({ length: 20 }, (_, index) => {
    const x = index % 5;
    const y = Math.floor(index / 5);
    const distance = Math.hypot(x - 2, y - 1.5);
    return {
      latitude: 5.38 + y * 0.03,
      longitude: 100.25 + x * 0.04,
      precipitationMm: distance < 0.7 ? 9 : distance < 1.5 ? 4 : 1,
      precipitationProbability: 80,
      weatherCode: 63,
      cloudCover: 90,
      windSpeedKmh: 18,
      windDirectionDeg: 240,
    };
  });
}

describe("journey weather overlay domain", () => {
  it("derives a deterministic bounded twenty-point sampling grid", () => {
    const grid = buildWeatherSampleGrid([{ lat: 5.4141, lng: 100.3288 }]);
    expect(grid).toHaveLength(48);
    expect(grid).toEqual(buildWeatherSampleGrid([{ lat: 5.4141, lng: 100.3288 }]));
    expect(new Set(grid.map((point) => `${point.latitude},${point.longitude}`)).size).toBe(48);
    expect(buildWeatherSampleGrid([{ lat: Number.NaN, lng: 100 }])).toEqual([]);
  });

  it("chooses the current local hour, earliest schedule, then noon", () => {
    expect(defaultOverlayHour({
      date: "2026-09-15",
      scheduledTimes: ["15:30"],
      now: new Date("2026-09-15T03:20:00.000Z"),
    })).toBe(11);
    expect(defaultOverlayHour({
      date: "2026-09-16",
      scheduledTimes: ["15:30", "10:00", null],
      now: new Date("2026-09-15T03:20:00.000Z"),
    })).toBe(10);
    expect(defaultOverlayHour({
      date: "2026-09-16",
      scheduledTimes: [],
      now: new Date("2026-09-15T03:20:00.000Z"),
    })).toBe(12);
  });

  it("allows live radar only for today's Malaysia calendar date", () => {
    const now = new Date("2026-09-15T10:30:00.000Z");

    expect(malaysiaDateHour(now)).toEqual({ date: "2026-09-15", hour: 18 });
    expect(canUseLiveRadar("2026-09-15", now)).toBe(true);
    expect(canUseLiveRadar("2026-09-16", now)).toBe(false);
    expect(canUseLiveRadar(null, now)).toBe(false);
  });

  it("builds geographic rain bands and seeds particles only inside them", () => {
    const result = buildPrecipitationContours(sampleGrid());
    expect(result.bounds).not.toBeNull();
    expect(result.dominantCenter).not.toBeNull();
    expect(result.contours.features.map((feature) => feature.properties.level)).toEqual(
      expect.arrayContaining(["light", "moderate", "heavy"]),
    );

    const values = [0.13, 0.71, 0.42, 0.84, 0.27, 0.65];
    let cursor = 0;
    const particles = seedRainParticles(result.contours, 30, () => values[(cursor++) % values.length]);
    expect(particles).toHaveLength(30);
    for (const point of particles) expect(pointInWeatherContours(point, result.contours)).toBe(true);
  });

  it("builds mutually exclusive map regions for every animated weather condition", () => {
    const contours = buildWeatherConditionContours(conditionGrid());
    expect(new Set(contours.features.map((feature) => feature.properties.condition))).toEqual(new Set([
      "fog",
      "drizzle",
      "rain",
      "showers",
      "thunderstorm",
      "snow",
      "overcast",
    ]));

    for (let y = 1; y < 40; y += 1) {
      for (let x = 1; x < 50; x += 1) {
        const point: [number, number] = [
          100.2 + (0.14 * x) / 50,
          5.3 + (0.1 * y) / 40,
        ];
        expect(contours.features.filter((feature) => pointInFeature(point, feature)).length).toBeLessThanOrEqual(1);
      }
    }
  });

  it("does not create an animated map region for clear weather", () => {
    const clear = conditionGrid().map((sample) => ({ ...sample, weatherCode: 0 }));
    expect(buildWeatherConditionContours(clear).features).toEqual([]);
  });

  it("uses visibly distinct movement rules for every weather effect", () => {
    expect(WEATHER_EFFECT_PRESETS.drizzle.count).toBeLessThan(WEATHER_EFFECT_PRESETS.rain.count);
    expect(WEATHER_EFFECT_PRESETS.showers.cadence).toBe("burst");
    expect(WEATHER_EFFECT_PRESETS.thunderstorm.flash).toBe(true);
    expect(WEATHER_EFFECT_PRESETS.snow.lateralDrift).toBeGreaterThan(0);
    expect(WEATHER_EFFECT_PRESETS.fog.verticalSpeed).toBe(0);
    expect(WEATHER_EFFECT_PRESETS.overcast.verticalSpeed).toBe(0);
  });

  it("seeds and advances every effect only inside its own condition region", () => {
    const contours = buildWeatherConditionContours(conditionGrid());
    let state = 90210;
    const random = () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x100000000;
    };
    let particles = seedWeatherEffectParticles(contours, random);
    expect(particles.length).toBeGreaterThan(0);
    for (let tick = 0; tick < 24; tick += 1) {
      particles = advanceWeatherEffectParticles(particles, contours, tick, random);
      for (const particle of particles) {
        expect(pointInWeatherConditionContours(particle.coordinates, contours, particle.condition)).toBe(true);
      }
    }
  });

  it("keeps light, moderate, and heavy contour areas mutually exclusive", () => {
    const result = buildPrecipitationContours(sampleGrid());
    const [minLng, minLat, maxLng, maxLat] = result.bounds!;

    for (let y = 1; y < 40; y += 1) {
      for (let x = 1; x < 50; x += 1) {
        const point: [number, number] = [
          minLng + ((maxLng - minLng) * x) / 50,
          minLat + ((maxLat - minLat) * y) / 40,
        ];
        const containingBands = result.contours.features.filter((feature) => pointInFeature(point, feature));
        expect(containingBands.length).toBeLessThanOrEqual(1);
      }
    }
  });

  it("classifies an all-heavy grid as heavy only", () => {
    const heavy = sampleGrid().map((sample) => ({ ...sample, precipitationMm: 8 }));
    const result = buildPrecipitationContours(heavy);

    expect(result.contours.features.map((feature) => feature.properties.level)).toEqual(["heavy"]);
  });

  it.each([
    { precipitationMm: 0.1, expectedLevel: "light" },
    { precipitationMm: 2.5, expectedLevel: "moderate" },
    { precipitationMm: 7.5, expectedLevel: "heavy" },
  ] as const)("assigns the $precipitationMm mm boundary to $expectedLevel", ({ precipitationMm, expectedLevel }) => {
    const samples = sampleGrid().map((sample) => ({ ...sample, precipitationMm }));
    const result = buildPrecipitationContours(samples);

    expect(result.contours.features.map((feature) => feature.properties.level)).toEqual([expectedLevel]);
  });

  it("seeds particles when the rain footprint contains only a higher band", () => {
    const result = buildPrecipitationContours(sampleGrid());
    const heavyOnly = {
      ...result.contours,
      features: result.contours.features.filter((feature) => feature.properties.level === "heavy"),
    };

    expect(seedRainParticles(heavyOnly, 8, () => 0.5)).toHaveLength(8);
  });

  it("does not draw rain when probability or precipitation is untrustworthy", () => {
    const dry = sampleGrid().map((sample) => ({ ...sample, precipitationProbability: 20 }));
    expect(buildPrecipitationContours(dry).contours.features).toEqual([]);
    expect(buildPrecipitationContours([]).dominantCenter).toBeNull();
  });

  it("does not present an all-wet sampling envelope as a rain boundary", () => {
    const allWet = sampleGrid().map((sample) => ({ ...sample, precipitationMm: 1 }));
    const result = buildPrecipitationContours(allWet);

    expect(result.rainBoundary.features).toEqual([]);
  });

  it("draws only wet-dry transitions and never the sampling-box edges", () => {
    const samples = sampleGrid().map((sample, index) => ({
      ...sample,
      precipitationMm: index === 5 || index === 6 || index === 10 || index === 11 ? 4 : 0,
    }));
    const result = buildPrecipitationContours(samples);
    const [minLng, minLat, maxLng, maxLat] = result.bounds!;
    const lines = result.rainBoundary.features.map((feature) => feature.geometry.coordinates);

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.flat().some(([lng, lat], index, points) => {
      const next = points[index + 1];
      return Boolean(next && lng !== next[0] && lat !== next[1]);
    })).toBe(true);
    for (const points of lines) {
      for (let index = 0; index < points.length - 1; index += 1) {
        const current = points[index];
        const next = points[index + 1];
        expect(current[0] === minLng && next[0] === minLng).toBe(false);
        expect(current[0] === maxLng && next[0] === maxLng).toBe(false);
        expect(current[1] === minLat && next[1] === minLat).toBe(false);
        expect(current[1] === maxLat && next[1] === maxLat).toBe(false);
      }
    }
  });

  it("anchors the cloud at an interior dominant-band sample instead of the first edge maximum", () => {
    const samples = sampleGrid().map((sample, index) => ({
      ...sample,
      precipitationMm: index === 0 || index === 7 ? 8 : 1,
    }));
    const result = buildPrecipitationContours(samples);

    expect(result.dominantCenter).toEqual([samples[7].longitude, samples[7].latitude]);
    expect(pointInWeatherContours(result.dominantCenter!, result.contours)).toBe(true);
  });
});
