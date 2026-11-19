"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, Cloud, CloudOff, CloudRain, Loader2, LocateFixed, Pause, Play } from "lucide-react";
// No maplibre-worker import here: it would pull maplibre-gl into the planner's
// first load. This overlay renders only inside MapView, whose lazy
// maplibre-map.tsx sets the worker URL before any map exists.
import { useMap } from "react-map-gl/maplibre";
import { useTranslation } from "react-i18next";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMalaysiaDateTime } from "@/lib/weather/overlay-time";
import { buildForecastIntensitySampler, hasBoundedForecastRain, isForecastRainSample, RADAR_ECHO_STRONG, RADAR_ECHO_WEAK, radarEchoShade, retainRainParticleCandidate, sampleRadarIntensityAt, tilePixelForCoordinate, weatherAtmosphereFade } from "@/lib/weather/rain-mask";
import type { RadarFrame, RadarOverlayResult, WeatherMapMode, WeatherOverlayResult } from "@/lib/weather/types";
import type { WeatherOverlayStatus } from "./use-weather-overlay";
import { SIMULATED_WEATHER_HOURS, simulatedWeatherConditionKeyForHour } from "./trip-weather-simulation";

type RadarMaskTile = { radar: ImageData; coverage: ImageData };
type RainDrop = { coordinates: [number, number]; phase: number; intensity: number; cellX: number; cellY: number };
type TripCamera = { date: string; center: [number, number]; zoom: number; pitch: number; bearing: number };

const MAX_RADAR_MASK_ZOOM = 7;
const MAX_VISIBLE_RADAR_TILES = 16;
const MAX_RAIN_DROPS = 76;
const WEATHER_ATMOSPHERE_ALPHA = 26;

function distanceFromGrayShadeCenterKm(latitude: number, longitude: number, centerLatitude: number | undefined, centerLongitude: number | undefined) {
  if (centerLatitude === undefined || centerLongitude === undefined) return Number.POSITIVE_INFINITY;
  const radians = Math.PI / 180;
  const latitudeDelta = (latitude - centerLatitude) * radians;
  const longitudeDelta = (longitude - centerLongitude) * radians;
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(centerLatitude * radians) * Math.cos(latitude * radians) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function radarTileUrl(template: string, zoom: number, x: number, y: number) {
  return template.replaceAll("{z}", String(zoom)).replaceAll("{x}", String(x)).replaceAll("{y}", String(y));
}

async function readRasterTile(url: string, signal: AbortSignal): Promise<ImageData | null> {
  try {
    const response = await fetch(url, {
      mode: "cors",
      credentials: "omit",
      cache: "default",
      signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]),
    });
    if (!response.ok) return null;
    const bitmap = await createImageBitmap(await response.blob());
    const surface = document.createElement("canvas");
    surface.width = 256;
    surface.height = 256;
    const context = surface.getContext("2d", { willReadFrequently: true });
    if (!context) {
      bitmap.close();
      return null;
    }
    context.drawImage(bitmap, 0, 0, 256, 256);
    bitmap.close();
    return context.getImageData(0, 0, 256, 256);
  } catch {
    return null;
  }
}

function seededRandom(seedText: string) {
  let seed = 2166136261;
  for (const character of seedText) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function visibleRadarTiles(map: NonNullable<ReturnType<typeof useMap>["current"]>, frame: RadarFrame) {
  const zoom = Math.min(MAX_RADAR_MASK_ZOOM, Math.floor(map.getZoom()));
  const bounds = map.getBounds();
  const northWest = tilePixelForCoordinate(bounds.getNorth(), bounds.getWest(), zoom);
  const southEast = tilePixelForCoordinate(bounds.getSouth(), bounds.getEast(), zoom);
  const candidates: Array<{ x: number; y: number }> = [];
  const world = 2 ** zoom;
  const xCount = (southEast.x - northWest.x + world) % world + 1;
  for (let offsetX = 0; offsetX < xCount; offsetX += 1) {
    const x = (northWest.x + offsetX) % world;
    for (let y = northWest.y; y <= southEast.y; y += 1) {
      if (x >= 0 && x < world && y >= 0 && y < world) candidates.push({ x, y });
    }
  }
  if (candidates.length > MAX_VISIBLE_RADAR_TILES) return null;
  return candidates.map(({ x, y }) => ({
    key: `${zoom}/${x}/${y}`,
    radarUrl: radarTileUrl(frame.intensityTileUrlTemplate, zoom, x, y),
    coverageUrl: radarTileUrl(frame.coverageTileUrlTemplate, zoom, x, y),
  }));
}

function WeatherMaskCanvas({
  mode,
  frame,
  result,
  active,
  paused,
  radarZoomSupported,
  grayShadeCenter,
  grayShadeRadiusKm,
  onMaskStatus,
}: {
  mode: WeatherMapMode;
  frame: RadarFrame | null;
  result: WeatherOverlayResult | null;
  active: boolean;
  paused: boolean;
  radarZoomSupported: boolean;
  grayShadeCenter?: [number, number];
  grayShadeRadiusKm?: number | null;
  onMaskStatus: (mode: WeatherMapMode, status: "idle" | "ready" | "dry" | "insufficient" | "error") => void;
}) {
  const { current: map } = useMap();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tilesRef = useRef(new Map<string, Promise<RadarMaskTile | null>>());
  const dropsRef = useRef<RainDrop[]>([]);
  const maskReadyRef = useRef(false);
  const maskImageRef = useRef<ImageData | null>(null);
  const pausedRef = useRef(paused);
  const resultRef = useRef(result);
  const startAnimationRef = useRef<() => void>(() => {});
  const grayShadeLatitude = grayShadeCenter?.[0];
  const grayShadeLongitude = grayShadeCenter?.[1];
  const forecastRevision = mode === "forecast" ? `${result?.date ?? ""}:${result?.hour ?? ""}:${result?.fetchedAt ?? ""}` : "";

  useEffect(() => {
    pausedRef.current = paused;
    resultRef.current = result;
    if (!paused) startAnimationRef.current();
  }, [paused, result]);

  useEffect(() => {
    const currentResult = resultRef.current;
    if (!map || !active || (mode === "now" && (!frame || !radarZoomSupported))
      || (mode === "forecast" && (!currentResult?.spatialCoverageComplete || !currentResult.samples.some(isForecastRainSample)))) {
      maskReadyRef.current = false;
      dropsRef.current = [];
      onMaskStatus(mode, "idle");
      return;
    }
    onMaskStatus(mode, "idle");

    let cancelled = false;
    let animationFrame = 0;
    let redrawFrame = 0;
    let retryTimer = 0;
    let lastMaskDraw = 0;
    let drawPromise: Promise<void> | null = null;
    let redrawAfterDrawing = false;
    let lastStatus: "ready" | "dry" | "insufficient" | "error" = "insufficient";
    if (mode === "now") tilesRef.current.clear();
    const tileController = new AbortController();
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d", { alpha: true });
    if (!canvas || !context) {
      onMaskStatus(mode, "error");
      return;
    }

    const loadVisibleTiles = async () => {
      if (mode !== "now" || !frame) return new Map<string, RadarMaskTile | null>();
      const visible = visibleRadarTiles(map, frame);
      if (!visible) return null;
      const entries = await Promise.all(visible.map(async (tile) => {
        let request = tilesRef.current.get(tile.key);
        if (!request) {
          request = Promise.all([
            readRasterTile(tile.radarUrl, tileController.signal),
            readRasterTile(tile.coverageUrl, tileController.signal),
          ])
            .then(([radar, coverage]) => radar && coverage ? { radar, coverage } : null);
          tilesRef.current.set(tile.key, request);
          while (tilesRef.current.size > MAX_VISIBLE_RADAR_TILES * 2) {
            const oldestKey = tilesRef.current.keys().next().value;
            if (!oldestKey) break;
            tilesRef.current.delete(oldestKey);
          }
        }
        return [tile.key, await request] as const;
      }));
      return new Map(entries);
    };

    const performMaskDraw = async () => {
      redrawFrame = 0;
      const now = performance.now();
      if (now - lastMaskDraw < 100) {
        if (!retryTimer) {
          retryTimer = window.setTimeout(() => {
            retryTimer = 0;
            void drawMask();
          }, 100 - (now - lastMaskDraw));
        }
        return;
      }
      lastMaskDraw = now;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (!width || !height) return;
      const scale = Math.min(1, 960 / width, 720 / height);
      const maskWidth = Math.max(1, Math.floor(width * scale));
      const maskHeight = Math.max(1, Math.floor(height * scale));
      canvas.width = maskWidth;
      canvas.height = maskHeight;
      const tileData = await loadVisibleTiles();
      if (cancelled) return;
      if (tileData === null) {
        dropsRef.current = [];
        maskReadyRef.current = false;
        lastStatus = "insufficient";
        onMaskStatus(mode, lastStatus);
        context.clearRect(0, 0, maskWidth, maskHeight);
        return;
      }

      const imageData = context.createImageData(maskWidth, maskHeight);
      const randomness = seededRandom(`${mode}:${frame?.frameTime ?? currentResult?.fetchedAt}:${currentResult?.hour ?? 0}`);
      const sampleForecast = mode === "forecast" && currentResult
        ? buildForecastIntensitySampler(currentResult.samples)
        : null;
      const radarZoom = Math.min(MAX_RADAR_MASK_ZOOM, Math.floor(map.getZoom()));
      const candidateDrops: RainDrop[] = [];
      const rainDropReservoir = { candidates: candidateDrops, seen: 0 };
      let coveredSamples = 0;
      let totalSamples = 0;
      let rainySamples = 0;
      const cellStep = 2;
      const cellColumns = Math.ceil(maskWidth / cellStep);
      const cellRows = Math.ceil(maskHeight / cellStep);
      const cellIntensities = new Float32Array(cellColumns * cellRows);
      const paintAtmosphere = (cellX: number, cellY: number, fade: number) => {
        const alpha = Math.round(WEATHER_ATMOSPHERE_ALPHA * fade);
        if (alpha === 0) return;
        for (let y = cellY * cellStep; y < Math.min(maskHeight, (cellY + 1) * cellStep); y += 1) {
          for (let x = cellX * cellStep; x < Math.min(maskWidth, (cellX + 1) * cellStep); x += 1) {
            const pixel = (y * maskWidth + x) * 4;
            imageData.data[pixel] = 112;
            imageData.data[pixel + 1] = 112;
            imageData.data[pixel + 2] = 112;
            imageData.data[pixel + 3] = alpha;
          }
        }
      };
      const forecastShade = sampleForecast ? new Float32Array(cellIntensities.length) : null;
      for (let y = 0; y < maskHeight; y += cellStep) {
        for (let x = 0; x < maskWidth; x += cellStep) {
          const coordinate = map.unproject([x / scale, y / scale]);
          const cellX = x / cellStep;
          const cellY = y / cellStep;
          let intensity: number | null = null;
          if (sampleForecast) {
            intensity = sampleForecast(coordinate.lat, coordinate.lng);
          } else if (mode === "now") {
            totalSamples += 1;
            const tilePixel = tilePixelForCoordinate(coordinate.lat, coordinate.lng, radarZoom);
            const tile = tileData.get(`${radarZoom}/${tilePixel.x}/${tilePixel.y}`);
            if (tile) {
              const pixelIndex = (tilePixel.pixelY * 256 + tilePixel.pixelX) * 4;
              const isCovered = tile.coverage.data[pixelIndex + 3] === 0;
              if (isCovered) coveredSamples += 1;
              intensity = sampleRadarIntensityAt(tile.radar.data, pixelIndex, isCovered);
            }
          }
          const cellIndex = cellY * cellColumns + cellX;
          if (mode === "forecast" && intensity !== null && intensity > 0) {
            const fade = sampleForecast && grayShadeRadiusKm == null ? 1 : weatherAtmosphereFade(
              distanceFromGrayShadeCenterKm(coordinate.lat, coordinate.lng, grayShadeLatitude, grayShadeLongitude),
              grayShadeRadiusKm,
            );
            if (forecastShade) forecastShade[cellIndex] = fade;
            else paintAtmosphere(cellX, cellY, fade);
          }
          if (intensity === null) continue;
          if (intensity > 0) rainySamples += 1;
          cellIntensities[cellIndex] = intensity;
          const visualIntensity = Math.pow(intensity, 0.35);
          if (intensity > 0 && randomness() < visualIntensity * 0.02) {
            retainRainParticleCandidate(rainDropReservoir, {
              coordinates: [coordinate.lng, coordinate.lat],
              phase: randomness(),
              intensity,
              cellX,
              cellY,
            }, MAX_RAIN_DROPS, randomness);
          }
        }
      }
      if (mode === "now" && coveredSamples < totalSamples * 0.8) {
        dropsRef.current = [];
        maskReadyRef.current = false;
        maskImageRef.current = null;
        lastStatus = "insufficient";
        onMaskStatus(mode, lastStatus);
        context.clearRect(0, 0, maskWidth, maskHeight);
        return;
      }
      const edgeFade = (cells: Float32Array, cellX: number, cellY: number) => {
        const featherCells = 5;
        let nearestDryCell = featherCells;
        for (let y = Math.max(0, cellY - featherCells); y <= Math.min(cellRows - 1, cellY + featherCells); y += 1) {
          for (let x = Math.max(0, cellX - featherCells); x <= Math.min(cellColumns - 1, cellX + featherCells); x += 1) {
            const distance = Math.hypot(x - cellX, y - cellY);
            if (distance < nearestDryCell && cells[y * cellColumns + x] <= 0) nearestDryCell = distance;
          }
        }
        const wetDepth = Math.max(0, nearestDryCell - 0.5);
        const progress = Math.min(1, wetDepth / featherCells);
        return progress * progress * (3 - 2 * progress);
      };
      if (rainySamples > 0 && (forecastShade || mode === "now")) {
        // Two passes measure distance to dry or unknown cells in linear time.
        const depth = Uint8Array.from(cellIntensities, (intensity) => intensity > 0 ? 6 : 0);
        for (let index = 0; index < depth.length; index += 1) {
          if (index % cellColumns > 0) depth[index] = Math.min(depth[index], depth[index - 1] + 1);
          if (index >= cellColumns) depth[index] = Math.min(depth[index], depth[index - cellColumns] + 1);
        }
        const edgeFadeByCell = new Float32Array(depth.length);
        for (let index = depth.length - 1; index >= 0; index -= 1) {
          if (index % cellColumns < cellColumns - 1) depth[index] = Math.min(depth[index], depth[index + 1] + 1);
          if (index + cellColumns < depth.length) depth[index] = Math.min(depth[index], depth[index + cellColumns] + 1);
          const progress = Math.max(0, Math.min(1, (depth[index] - 0.5) / 5));
          edgeFadeByCell[index] = progress * progress * (3 - 2 * progress);
          if (forecastShade) {
            paintAtmosphere(index % cellColumns, Math.floor(index / cellColumns), forecastShade[index] * edgeFadeByCell[index]);
          }
        }
        if (mode === "now") {
          for (let index = 0; index < cellIntensities.length; index += 1) {
            const shade = radarEchoShade(cellIntensities[index]);
            if (!shade) continue;
            const alpha = Math.round(shade[3] * edgeFadeByCell[index]);
            if (alpha === 0) continue;
            const cellX = index % cellColumns;
            const cellY = Math.floor(index / cellColumns);
            for (let y = cellY * cellStep; y < Math.min(maskHeight, (cellY + 1) * cellStep); y += 1) {
              for (let x = cellX * cellStep; x < Math.min(maskWidth, (cellX + 1) * cellStep); x += 1) {
                const pixel = (y * maskWidth + x) * 4;
                imageData.data[pixel] = shade[0];
                imageData.data[pixel + 1] = shade[1];
                imageData.data[pixel + 2] = shade[2];
                imageData.data[pixel + 3] = alpha;
              }
            }
          }
        }
      }
      if (rainySamples === 0) imageData.data.fill(0);
      context.putImageData(imageData, 0, 0);
      maskImageRef.current = imageData;
      dropsRef.current = candidateDrops
        .map((drop) => ({ ...drop, intensity: Math.pow(drop.intensity, 0.35) * edgeFade(cellIntensities, drop.cellX, drop.cellY) }))
        .filter((drop) => drop.intensity > 0)
        .slice(0, MAX_RAIN_DROPS);
      maskReadyRef.current = rainySamples > 0;
      lastStatus = rainySamples > 0 ? "ready" : "dry";
      onMaskStatus(mode, lastStatus);
      startAnimationRef.current();
    };

    const drawMask = () => {
      if (drawPromise) {
        redrawAfterDrawing = true;
        return;
      }
      drawPromise = performMaskDraw().catch(() => {
        if (!cancelled) {
          dropsRef.current = [];
          maskReadyRef.current = false;
          maskImageRef.current = null;
          lastStatus = "error";
          onMaskStatus(mode, lastStatus);
          context.clearRect(0, 0, canvas.width, canvas.height);
        }
      }).finally(() => {
        drawPromise = null;
        if (redrawAfterDrawing && !cancelled) {
          redrawAfterDrawing = false;
          scheduleMask();
        }
      });
    };

    const scheduleMask = () => {
      if (redrawFrame) return;
      redrawFrame = window.requestAnimationFrame(() => {
        redrawFrame = 0;
        drawMask();
      });
    };

    const animate = (timestamp: number) => {
      animationFrame = 0;
      if (cancelled) return;
      if (!pausedRef.current && maskReadyRef.current) {
        const width = canvas.clientWidth;
        const scale = canvas.width / Math.max(width, 1);
        if (maskImageRef.current) context.putImageData(maskImageRef.current, 0, 0);
        for (const [index, drop] of dropsRef.current.entries()) {
          const point = map.project(drop.coordinates);
          const offset = ((timestamp / 900 + drop.phase) % 1) * 10;
          const alpha = Math.min(0.72, drop.intensity * 0.72) * (1 - Math.abs(drop.intensity - 0.04) * 0.12);
          context.beginPath();
          context.moveTo((point.x + 2 - offset * 0.45) * scale, (point.y - 4 + offset) * scale);
          context.lineTo((point.x - 2 - offset * 0.45) * scale, (point.y + 5 + offset) * scale);
          context.strokeStyle = `rgba(42, 50, 58, ${Math.max(0, alpha)})`;
          context.lineWidth = 0.9;
          context.lineCap = "round";
          context.stroke();
          if (index >= MAX_RAIN_DROPS - 1) break;
        }
      }
      if (!pausedRef.current && maskReadyRef.current) animationFrame = window.requestAnimationFrame(animate);
    };

    startAnimationRef.current = () => {
      if (!pausedRef.current && maskReadyRef.current && !animationFrame) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    };

    const update = () => scheduleMask();
    map.on("move", update);
    map.on("moveend", update);
    map.on("zoomend", update);
    map.on("resize", update);
    scheduleMask();

    return () => {
      cancelled = true;
      startAnimationRef.current = () => {};
      tileController.abort();
      window.cancelAnimationFrame(animationFrame);
      window.cancelAnimationFrame(redrawFrame);
      window.clearTimeout(retryTimer);
      map.off("move", update);
      map.off("moveend", update);
      map.off("zoomend", update);
      map.off("resize", update);
      context.clearRect(0, 0, canvas.width, canvas.height);
      maskImageRef.current = null;
    };
  }, [active, frame, forecastRevision, grayShadeLatitude, grayShadeLongitude, grayShadeRadiusKm, map, mode, onMaskStatus, radarZoomSupported]);

  return <canvas ref={canvasRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-[1] h-full w-full" data-weather-rain-mask />;
}

function useMotionPreference() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

export function TripWeatherMapOverlay({
  result,
  status,
  radarResult,
  radarStatus,
  mode,
  date,
  liveRadarAvailable,
  tripCoordinates,
  grayShadeCenter,
  grayShadeRadiusKm,
  enabled,
  hour,
  onHourChange,
  onModeChange,
  onEnabledChange,
  simulationAvailable,
  simulationEnabled,
  onSimulationEnabledChange,
  mapMoving,
}: {
  result: WeatherOverlayResult | null;
  status: WeatherOverlayStatus;
  radarResult: RadarOverlayResult | null;
  radarStatus: "idle" | "loading" | "ready" | "error";
  mode: WeatherMapMode;
  date: string | null;
  liveRadarAvailable: boolean;
  tripCoordinates: ReadonlyArray<readonly [latitude: number, longitude: number]>;
  grayShadeCenter?: [number, number];
  grayShadeRadiusKm?: number | null;
  enabled: boolean;
  hour: number;
  onHourChange: (hour: number) => void;
  onModeChange: (mode: WeatherMapMode) => void;
  onEnabledChange: (enabled: boolean) => void;
  simulationAvailable: boolean;
  simulationEnabled: boolean;
  onSimulationEnabledChange: (enabled: boolean) => void;
  mapMoving: boolean;
}) {
  const { t } = useTranslation("customer");
  const { current: map } = useMap();
  const reducedMotion = useMotionPreference();
  const tripCameraRef = useRef<TripCamera | null>(null);
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);
  const [maskStatusByMode, setMaskStatusByMode] = useState<Record<WeatherMapMode, "idle" | "ready" | "dry" | "insufficient" | "error">>({ now: "idle", forecast: "idle" });
  const [radarMaskFrameTime, setRadarMaskFrameTime] = useState<string | null>(null);
  const [rainPlaying, setRainPlaying] = useState(true);
  const [radarFrameSelection, setRadarFrameSelection] = useState<{ fetchedAt: string; index: number } | null>(null);
  const [radarPlaying, setRadarPlaying] = useState(false);
  const radarFrames = radarResult?.frames ?? [];
  const latestRadarFrameIndex = Math.max(radarFrames.length - 1, 0);
  const selectedRadarFrameIndex = radarResult && radarFrameSelection?.fetchedAt === radarResult.fetchedAt
    ? Math.min(radarFrameSelection.index, latestRadarFrameIndex)
    : latestRadarFrameIndex;
  const selectedRadarFrame = radarFrames[selectedRadarFrameIndex] ?? null;
  const showingLatestRadarFrame = selectedRadarFrameIndex === radarFrames.length - 1;
  const maskStatus = mode === "now" && radarMaskFrameTime !== selectedRadarFrame?.frameTime
    ? "idle"
    : maskStatusByMode[mode];
  const reportMaskStatus = useCallback((sourceMode: WeatherMapMode, next: "idle" | "ready" | "dry" | "insufficient" | "error", frameTime?: string) => {
    setMaskStatusByMode((current) => current[sourceMode] === next ? current : { ...current, [sourceMode]: next });
    if (sourceMode === "now") setRadarMaskFrameTime(frameTime ?? null);
  }, []);
  const reportCurrentMaskStatus = useCallback(
    (sourceMode: WeatherMapMode, next: "idle" | "ready" | "dry" | "insufficient" | "error") => reportMaskStatus(sourceMode, next, selectedRadarFrame?.frameTime),
    [reportMaskStatus, selectedRadarFrame?.frameTime],
  );
  const canOpenNearbyRadar = Boolean(date && liveRadarAvailable && !simulationEnabled && tripCoordinates.length > 0);
  const cameraDuration = reducedMotion ? 0 : 450;

  function openNearbyRadar() {
    if (!map || !date || !canOpenNearbyRadar) return;
    if (tripCameraRef.current?.date !== date) {
      const { lng, lat } = map.getCenter();
      tripCameraRef.current = {
        date, center: [lng, lat], zoom: map.getZoom(), pitch: map.getPitch(), bearing: map.getBearing(),
      };
    }
    setRadarPlaying(false);
    setRadarFrameSelection(null);
    onModeChange("now");
    const lats = tripCoordinates.map(([latitude]) => latitude);
    const lngs = tripCoordinates.map(([, longitude]) => longitude);
    const west = Math.min(...lngs), south = Math.min(...lats);
    const east = Math.max(...lngs), north = Math.max(...lats);
    if (east - west < 0.00001 && north - south < 0.00001) {
      map.easeTo({ center: [west, south], zoom: MAX_RADAR_MASK_ZOOM, duration: cameraDuration });
    } else {
      map.fitBounds([[west, south], [east, north]], {
        padding: 42, maxZoom: MAX_RADAR_MASK_ZOOM, duration: cameraDuration,
      });
    }
  }

  function returnToTripMap() {
    const camera = tripCameraRef.current;
    tripCameraRef.current = null;
    setRadarPlaying(false);
    onModeChange("forecast");
    if (camera?.date === date) {
      const { center, zoom, pitch, bearing } = camera;
      map?.easeTo({ center, zoom, pitch, bearing, duration: cameraDuration });
    }
  }

  useEffect(() => {
    if (tripCameraRef.current?.date !== date) tripCameraRef.current = null;
  }, [date]);
  const hasRadar = enabled && mode === "now" && radarResult?.availability === "radar" && Boolean(selectedRadarFrame);
  const setRadarFrameIndex = useCallback((index: number) => setRadarFrameSelection({
    fetchedAt: radarResult?.fetchedAt ?? "",
    index,
  }), [radarResult?.fetchedAt]);

  useEffect(() => {
    const update = () => {
      const hidden = document.visibilityState !== "visible";
      setPageHidden(hidden);
      if (hidden) setRadarPlaying(false);
    };
    document.addEventListener("visibilitychange", update);
    update();
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      setRadarFrameIndex(Math.max((radarResult?.frames.length ?? 1) - 1, 0));
      setRadarPlaying(false);
    }, 0);
    return () => window.clearTimeout(resetTimer);
  }, [radarResult?.fetchedAt, radarResult?.frames.length, setRadarFrameIndex]);

  useEffect(() => {
    if (!enabled || !hasRadar || pageHidden || mapMoving || reducedMotion) {
      if (radarPlaying) {
        const stopTimer = window.setTimeout(() => setRadarPlaying(false), 0);
        return () => window.clearTimeout(stopTimer);
      }
      return;
    }
    if (!radarPlaying || radarFrames.length < 2) return;
    const timer = window.setTimeout(() => {
      if (selectedRadarFrameIndex >= radarFrames.length - 1) {
        setRadarPlaying(false);
        return;
      }
      setRadarFrameIndex(selectedRadarFrameIndex + 1);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [enabled, hasRadar, mapMoving, pageHidden, radarFrames.length, radarPlaying, reducedMotion, selectedRadarFrameIndex, setRadarFrameIndex]);

  const simulationMinHour = SIMULATED_WEATHER_HOURS[0];
  const simulationMaxHour = SIMULATED_WEATHER_HOURS.at(-1)!;
  const simulatedCondition = simulatedWeatherConditionKeyForHour(hour);
  const simulationConditionKey = ["drizzle", "rain", "showers", "thunderstorm"].includes(simulatedCondition)
    ? "rain"
    : simulatedCondition;
  const hasCurrentResult = Boolean(result && result.date === date && result.hour === hour);
  const hasCurrentForecast = hasCurrentResult && result?.availability === "forecast";
  const hasForecast = enabled && mode === "forecast" && hasCurrentForecast;
  const hasForecastRain = Boolean(result?.samples.some(isForecastRainSample));
  const hasUnboundedForecastRain = Boolean(hasCurrentForecast && result.spatialCoverageComplete
    && hasForecastRain && !hasBoundedForecastRain(result.samples));
  const activeStatus = mode === "now" ? radarStatus : status;
  const rainAnimationAvailable = Boolean(hasForecast && result.spatialCoverageComplete && hasForecastRain);
  const radarZoomSupported = Boolean(!map || map.getZoom() <= MAX_RADAR_MASK_ZOOM);
  const weatherStatusReady = mode === "now"
    ? Boolean(hasRadar && !radarResult?.stale && (maskStatus === "ready" || maskStatus === "dry"))
    : Boolean(hasForecast && result?.spatialCoverageComplete && (maskStatus === "ready" || maskStatus === "dry") && !result?.stale);
  const hasRainVisual = maskStatus === "ready" && (mode === "now"
    ? hasRadar && !radarResult?.stale
    : hasForecast && !result?.stale);
  const showProgressRing = mode === "now"
    ? Boolean(hasRadar && radarFrames.length > 1)
    : rainAnimationAvailable;
  const forecastMinHour = simulationEnabled ? simulationMinHour : 6;
  const forecastMaxHour = simulationEnabled ? simulationMaxHour : 23;
  const ringProgress = mode === "now" && radarFrames.length > 1
    ? selectedRadarFrameIndex / (radarFrames.length - 1)
    : Math.max(0, Math.min(1, (hour - forecastMinHour) / (forecastMaxHour - forecastMinHour)));
  const isProgressRingPlaying = mode === "now"
    ? enabled && radarPlaying && radarFrames.length > 1 && !pageHidden && !mapMoving
    : enabled && rainPlaying && rainAnimationAvailable && !pageHidden && !mapMoving;
  const cardTitle = mode === "now"
    ? radarStatus === "loading"
      ? t("strictMigration.tripPlanner.weather.loading")
      : radarStatus === "error" || radarResult?.availability === "unavailable"
        ? t("strictMigration.tripPlanner.weather.radarUnavailable")
        : !radarZoomSupported
          ? t("strictMigration.tripPlanner.weather.radarZoomTooClose")
          : selectedRadarFrame && !showingLatestRadarFrame
            ? t("strictMigration.tripPlanner.weather.historicalRadar")
            : maskStatus === "insufficient" || maskStatus === "error"
            ? t("strictMigration.tripPlanner.weather.coverageInsufficient")
            : maskStatus === "dry"
              ? t("strictMigration.tripPlanner.weather.noRainAtHour", { time: t("strictMigration.tripPlanner.weather.now") })
          : t("strictMigration.tripPlanner.weather.liveRadar")
    : activeStatus === "loading"
      ? t("strictMigration.tripPlanner.weather.loading")
      : status === "error"
        ? t("strictMigration.tripPlanner.weather.mapUnavailable")
        : status === "missing_coordinates"
          ? t(simulationEnabled ? "strictMigration.tripPlanner.weather.simulation.missingAnchor" : "strictMigration.tripPlanner.weather.missingCoordinates")
          : !hasCurrentResult
            ? t("strictMigration.tripPlanner.weather.loading")
            : result?.availability === "forecast" && !result.spatialCoverageComplete
            ? t("strictMigration.tripPlanner.weather.coverageInsufficient")
            : result?.availability === "forecast" && hasUnboundedForecastRain
              ? t("strictMigration.tripPlanner.weather.rainBeyondCoverage")
            : result?.availability === "forecast" && hasForecastRain
            ? t("strictMigration.tripPlanner.weather.rainOnRoute")
            : result?.availability === "forecast"
              ? t("strictMigration.tripPlanner.weather.noRainAtHour", { time: `${String(hour).padStart(2, "0")}:00` })
              : result?.availability === "unavailable_yet"
                ? t("strictMigration.tripPlanner.weather.forecastAvailableNearerDeparture")
                : result?.availability === "unavailable"
                  ? t("strictMigration.tripPlanner.weather.forecastUnavailable")
                  : t("strictMigration.tripPlanner.weather.mapLayer");
  function toggleSimulation() {
    const next = !simulationEnabled;
    if (next) {
      if (mode === "now") returnToTripMap();
      else onModeChange("forecast");
      onHourChange(simulationMinHour);
    }
    onSimulationEnabledChange(next);
  }

  return (
    <>
      {(hasRadar || hasForecast) && (
        <WeatherMaskCanvas
          mode={mode}
          frame={selectedRadarFrame}
          result={result}
          active={hasRadar || hasForecast}
          radarZoomSupported={radarZoomSupported}
          grayShadeCenter={grayShadeCenter}
          grayShadeRadiusKm={grayShadeRadiusKm}
          paused={!enabled || (mode === "forecast" && !rainPlaying) || reducedMotion || pageHidden || mapMoving}
          onMaskStatus={reportCurrentMaskStatus}
        />
      )}

      <div className="pointer-events-none absolute inset-0 z-10" data-weather-overlay-ready={activeStatus === "ready" ? "true" : "false"}>
        <div className="pointer-events-none absolute left-4 top-4 flex max-w-[min(420px,calc(100%-120px))] items-center gap-2 rounded-full border border-white/70 bg-white/90 px-3 py-2 text-[11px] font-bold text-slate-700 shadow-[0_10px_35px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:bg-card/90 dark:text-foreground">
          <span className={"relative grid size-2 shrink-0 place-items-center rounded-full " + (weatherStatusReady ? "bg-emerald-600" : "bg-slate-400")}>
            {weatherStatusReady && <span className="absolute size-2 motion-safe:animate-ping rounded-full bg-emerald-600/60" />}
          </span>
          <span className="truncate" data-weather-live-status>{cardTitle}</span>
        </div>

        <div className="pointer-events-auto absolute right-4 top-4 flex items-center gap-1 rounded-full border border-white/70 bg-white/90 p-1.5 shadow-[0_10px_35px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:bg-card/90">
          <button type="button" aria-label={t("strictMigration.tripPlanner.weather.mapLayer")} aria-pressed={enabled} onClick={() => onEnabledChange(!enabled)} className={"grid h-9 w-9 place-items-center rounded-full transition " + (enabled ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
            {activeStatus === "loading" && enabled ? <Loader2 size={17} className="animate-spin" /> : <CloudRain size={17} />}
          </button>
          <button type="button" aria-label={t(controlsExpanded ? "strictMigration.tripPlanner.weather.hideControls" : "strictMigration.tripPlanner.weather.showControls")} aria-expanded={controlsExpanded} onClick={() => setControlsExpanded((expanded) => !expanded)} className="grid h-9 w-9 place-items-center rounded-full text-foreground transition hover:bg-muted">
            <ChevronDown size={15} className={controlsExpanded ? "rotate-180 transition-transform" : "transition-transform"} />
          </button>
          <button type="button" disabled={mode === "forecast" && hasCurrentForecast && !result?.spatialCoverageComplete} aria-label={t("strictMigration.tripPlanner.weather.centerWeather")} onClick={() => mode === "now" ? openNearbyRadar() : map?.easeTo({ center: result?.dominantCenter ?? map.getCenter(), zoom: result?.dominantCenter ? Math.max(map.getZoom(), 9) : map.getZoom(), duration: 450 })} className="grid h-9 w-9 place-items-center rounded-full text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">
            <LocateFixed size={17} />
          </button>
        </div>

        {enabled && !controlsExpanded && mode === "forecast" && rainAnimationAvailable && (
          <div data-weather-rain-legend className="pointer-events-none absolute right-4 top-[4.5rem] flex items-center gap-2 rounded-xl border border-white/80 bg-white/92 px-3 py-2 text-[10px] font-semibold text-slate-600 shadow-[0_8px_24px_rgba(15,23,42,0.14)] backdrop-blur-xl dark:bg-card/90 dark:text-muted-foreground">
            <span className="size-2.5 rounded-full bg-slate-500 shadow-[0_0_0_4px_rgba(100,116,139,0.12)]" />
            {t("strictMigration.tripPlanner.weather.rainAreaLegend")}
          </div>
        )}

        {controlsExpanded && enabled && (
          <div className="pointer-events-auto absolute right-4 top-16 w-[min(360px,calc(100%-32px))] max-h-[calc(100%-5rem)] overflow-y-auto overscroll-contain rounded-2xl border border-white/70 bg-white/92 dark:bg-card/92 px-4 py-3 shadow-[0_14px_45px_rgba(15,23,42,0.18)] backdrop-blur-xl">
            <div className="mb-3 flex gap-1 rounded-xl bg-muted p-1 text-[11px] font-bold">
              <button type="button" disabled={!canOpenNearbyRadar} aria-describedby={tripCoordinates.length === 0 && liveRadarAvailable && !simulationEnabled ? "weather-nearby-radar-no-stops" : undefined} aria-pressed={mode === "now"} onClick={openNearbyRadar} className={"flex-1 rounded-lg px-3 py-1.5 transition disabled:cursor-not-allowed disabled:opacity-40 " + (mode === "now" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-card")}>{t("strictMigration.tripPlanner.weather.now")}</button>
              <button type="button" aria-pressed={mode === "forecast"} onClick={returnToTripMap} className={"flex-1 rounded-lg px-3 py-1.5 transition " + (mode === "forecast" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-card")}>{t("strictMigration.tripPlanner.weather.forecast")}</button>
            </div>

            {simulationAvailable && (
              <div data-weather-simulation-control className="mb-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-foreground">{t("strictMigration.tripPlanner.weather.simulation.label")}</p>
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">{t("strictMigration.tripPlanner.weather.simulation.testData")}</p>
                  </div>
                  <button type="button" aria-pressed={simulationEnabled} onClick={toggleSimulation} className={"relative h-6 w-11 shrink-0 rounded-full transition " + (simulationEnabled ? "bg-primary" : "bg-muted-foreground/30")}>
                    <span className={"absolute top-1 h-4 w-4 rounded-full bg-white dark:bg-card shadow-sm transition-all " + (simulationEnabled ? "left-6" : "left-1")} />
                    <span className="sr-only">{t("strictMigration.tripPlanner.weather.simulation.label")}</span>
                  </button>
                </div>
                {simulationEnabled && (
                  <p className="mt-1.5 text-[10px] leading-4 text-muted-foreground">
                    <strong className="text-primary">{t(`strictMigration.tripPlanner.weather.conditions.${simulationConditionKey}`)}</strong>
                    {" · "}{t("strictMigration.tripPlanner.weather.simulation.hint")}
                  </p>
                )}
              </div>
            )}

            {mode === "forecast" && (
              <>
                {activeStatus === "missing_coordinates" && <p className="mt-2 text-[10px] font-semibold text-muted-foreground">{t(simulationEnabled ? "strictMigration.tripPlanner.weather.simulation.missingAnchor" : "strictMigration.tripPlanner.weather.missingCoordinates")}</p>}
                {status === "error" && <p className="mt-2 text-[10px] font-semibold text-destructive">{t("strictMigration.tripPlanner.weather.mapUnavailable")}</p>}
                {status === "ready" && hasCurrentResult && result?.availability === "unavailable_yet" && <p className="mt-2 text-[10px] font-semibold text-muted-foreground">{t("strictMigration.tripPlanner.weather.forecastAvailableNearerDeparture")}</p>}
                {status === "ready" && hasCurrentResult && result?.availability === "unavailable" && <p className="mt-2 text-[10px] font-semibold text-muted-foreground">{t("strictMigration.tripPlanner.weather.forecastUnavailable")}</p>}
                {status === "ready" && hasCurrentForecast && !result.spatialCoverageComplete && <p className="mt-2 text-[10px] font-semibold text-muted-foreground">{t("strictMigration.tripPlanner.weather.coverageInsufficient")}</p>}
                {status === "ready" && hasCurrentForecast && result.spatialCoverageComplete && hasUnboundedForecastRain && <p className="mt-2 text-[10px] font-semibold text-muted-foreground">{t("strictMigration.tripPlanner.weather.rainBeyondCoverage")}</p>}
                {status === "ready" && hasCurrentForecast && result.spatialCoverageComplete && !hasForecastRain && <p className="mt-2 text-[10px] font-semibold text-muted-foreground">{t("strictMigration.tripPlanner.weather.noRainAtHour", { time: `${String(hour).padStart(2, "0")}:00` })}</p>}
                {hasCurrentResult && result?.stale && <p className="mt-2 text-[10px] font-semibold text-amber-700 dark:text-amber-200">{t("strictMigration.tripPlanner.weather.stale")}</p>}
                {!simulationEnabled && <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="mt-1 block text-[9px] text-muted-foreground underline-offset-2 hover:underline">{t("strictMigration.tripPlanner.weather.providerAttribution")}</a>}
              </>
            )}

            {mode === "now" && (
              <>
                <div className="flex items-center justify-between gap-3 text-[11px]"><span className="font-bold text-foreground">{t(showingLatestRadarFrame ? "strictMigration.tripPlanner.weather.liveRadar" : "strictMigration.tripPlanner.weather.historicalRadar")}</span>{selectedRadarFrame && <time className="text-muted-foreground">{t("strictMigration.tripPlanner.weather.radarFrameTime", { time: formatMalaysiaDateTime(selectedRadarFrame.frameTime) })}</time>}</div>
                {(radarStatus === "error" || radarResult?.availability === "unavailable") && <p className="mt-2 text-[10px] font-semibold text-destructive">{t("strictMigration.tripPlanner.weather.radarUnavailable")}</p>}
                {radarResult?.stale && <p className="mt-2 text-[10px] font-semibold text-amber-700 dark:text-amber-200">{t("strictMigration.tripPlanner.weather.radarStale")}</p>}
                <a href={radarResult?.attributionUrl ?? "https://www.rainviewer.com/"} target="_blank" rel="noreferrer" className="mt-1 block text-[9px] text-muted-foreground underline-offset-2 hover:underline">{t("strictMigration.tripPlanner.weather.rainViewerAttribution")}</a>
              </>
            )}
          </div>
        )}

        {enabled && (
          <Card
            data-weather-status-card
            role="status"
            aria-live="polite"
            className="pointer-events-auto absolute bottom-[max(0.75rem,env(safe-area-inset-bottom))] left-1/2 w-[min(620px,calc(100%-24px))] -translate-x-1/2 gap-0 overflow-hidden rounded-[26px] border-white/80 bg-white/95 text-slate-900 shadow-[0_22px_70px_rgba(12,21,43,0.28)] backdrop-blur-xl"
          >
            <div className="grid grid-cols-[minmax(0,1fr)_92px] items-center gap-3 px-4 py-3 sm:px-5 sm:py-4">
              <div className="min-w-0">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-slate-500">
                  {t(mode === "now"
                    ? selectedRadarFrame && !showingLatestRadarFrame
                      ? "strictMigration.tripPlanner.weather.historicalRadar"
                      : "strictMigration.tripPlanner.weather.liveRadar"
                    : "strictMigration.tripPlanner.weather.forecast")}
                </p>
                <h2 className="mt-1 break-words text-[20px] font-black leading-tight tracking-tight sm:text-[22px]" data-weather-status-title>
                  {cardTitle}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {mode === "now"
                    ? selectedRadarFrame
                      ? t("strictMigration.tripPlanner.weather.radarFrameTime", { time: formatMalaysiaDateTime(selectedRadarFrame.frameTime) })
                      : t("strictMigration.tripPlanner.weather.radarUnavailable")
                    : `${t("strictMigration.tripPlanner.weather.forecastHour")} · ${t("strictMigration.tripPlanner.weather.timeLabel", { hour: String(hour).padStart(2, "0") })}`}
                </p>
                {mode === "now" && maskStatus === "ready" && hasRadar && radarZoomSupported && (
                  <div data-radar-echo-legend className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] font-semibold text-slate-600">
                    <span>{t("strictMigration.tripPlanner.weather.radarEchoStrength")}</span>
                    <span>{t("strictMigration.tripPlanner.weather.radarEchoWeak")}</span>
                    <span aria-hidden="true" className="h-2 w-24 rounded-full" style={{ background: `linear-gradient(90deg, rgb(${RADAR_ECHO_WEAK.join(",")}), rgb(${RADAR_ECHO_STRONG.join(",")}))` }} />
                    <span>{t("strictMigration.tripPlanner.weather.radarEchoStrong")}</span>
                  </div>
                )}
              </div>
              <div className="relative grid size-[92px] place-items-center justify-self-end" aria-hidden="true" data-weather-progress={showProgressRing ? ringProgress.toFixed(3) : "unavailable"}>
                {showProgressRing && (
                  <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                    <circle className={isProgressRingPlaying && !reducedMotion ? "weather-progress-ring is-playing" : "weather-progress-ring"} cx="50" cy="50" r="44" fill="none" stroke="#3d936e" strokeWidth="8" strokeLinecap="round" strokeDasharray="276" strokeDashoffset={276 * (1 - ringProgress)} />
                  </svg>
                )}
                {hasRainVisual ? <CloudRain size={30} strokeWidth={1.8} className="text-emerald-700" /> : result?.availability === "forecast" ? <Cloud size={30} strokeWidth={1.8} className="text-slate-500" /> : <CloudOff size={30} strokeWidth={1.8} className="text-slate-500" />}
              </div>
            </div>

            {mode === "forecast" && liveRadarAvailable && !simulationEnabled && (
              <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-5">
                <Button
                  type="button"
                  variant="outline"
                  data-weather-nearby-radar
                  aria-describedby={tripCoordinates.length === 0 ? "weather-nearby-radar-no-stops" : undefined}
                  disabled={!canOpenNearbyRadar}
                  onClick={openNearbyRadar}
                  className="min-h-10 px-3 text-xs"
                >
                  {t("strictMigration.tripPlanner.weather.viewNearbyRadar")}
                </Button>
                {tripCoordinates.length === 0 && <span id="weather-nearby-radar-no-stops" className="text-[10px] text-slate-500">{t("strictMigration.tripPlanner.weather.nearbyRadarNeedsStop")}</span>}
              </div>
            )}
            {mode === "now" && (
              <div className="flex flex-wrap items-center gap-2 px-4 pb-3 sm:px-5">
                <Button type="button" variant="outline" data-weather-return-to-trip onClick={returnToTripMap} className="min-h-10 px-3 text-xs">
                  {t("strictMigration.tripPlanner.weather.backToTripMap")}
                </Button>
                {!radarZoomSupported && (
                  <Button type="button" variant="outline" data-weather-nearby-radar onClick={openNearbyRadar} className="min-h-10 px-3 text-xs">
                    {t("strictMigration.tripPlanner.weather.viewNearbyRadar")}
                  </Button>
                )}
              </div>
            )}

            <div className="grid grid-cols-[38px_minmax(0,1fr)] items-center gap-3 border-t border-slate-200/80 px-4 py-3 sm:grid-cols-[38px_minmax(0,1fr)_auto] sm:px-5" data-weather-timeline>
              {mode === "now" && radarFrames.length > 1 ? (
                <>
                  <Button
                    type="button"
                    variant="default"
                    size="icon"
                    aria-label={t(radarPlaying ? "strictMigration.tripPlanner.weather.pauseRadar" : "strictMigration.tripPlanner.weather.playRadar")}
                    aria-pressed={radarPlaying}
                    disabled={reducedMotion || !radarZoomSupported || radarStatus !== "ready"}
                    onClick={() => {
                      if (radarPlaying) setRadarPlaying(false);
                      else {
                        if (selectedRadarFrameIndex >= radarFrames.length - 1) setRadarFrameIndex(0);
                        setRadarPlaying(true);
                      }
                    }}
                    className="size-9 rounded-full bg-slate-900 text-white hover:bg-slate-800"
                  >
                    {radarPlaying ? <Pause /> : <Play />}
                  </Button>
                  <div className="min-w-0">
                    <div className="mb-1 flex justify-between gap-2 text-[10px] text-slate-500">
                      <span>{t("strictMigration.tripPlanner.weather.historicalRadar")}</span>
                      {selectedRadarFrame && <time>{t("strictMigration.tripPlanner.weather.radarFrameTime", { time: formatMalaysiaDateTime(selectedRadarFrame.frameTime) })}</time>}
                    </div>
                    <input aria-label={t("strictMigration.tripPlanner.weather.historicalRadar")} type="range" min={0} max={radarFrames.length - 1} step={1} value={selectedRadarFrameIndex} disabled={!radarZoomSupported || radarStatus !== "ready"} onChange={(event) => { setRadarPlaying(false); setRadarFrameIndex(Number(event.target.value)); }} className="h-1.5 w-full cursor-pointer accent-emerald-700 disabled:cursor-not-allowed disabled:opacity-40" />
                  </div>
                  <a href={radarResult?.attributionUrl ?? "https://www.rainviewer.com/"} target="_blank" rel="noreferrer" className="col-span-2 max-w-28 justify-self-end text-right text-[10px] leading-tight font-semibold text-slate-500 underline-offset-2 hover:underline sm:col-span-1">{t("strictMigration.tripPlanner.weather.rainViewerAttribution")}</a>
                </>
              ) : mode === "forecast" ? (
                <>
                  <Button
                    type="button"
                    variant="default"
                    size="icon"
                    aria-label={t(rainPlaying ? "strictMigration.tripPlanner.weather.pauseRainAnimation" : "strictMigration.tripPlanner.weather.playRainAnimation")}
                    aria-pressed={rainPlaying}
                    disabled={reducedMotion || !rainAnimationAvailable}
                    onClick={() => setRainPlaying((playing) => !playing)}
                    className="size-9 rounded-full bg-slate-900 text-white hover:bg-slate-800"
                  >
                    {rainPlaying ? <Pause /> : <Play />}
                  </Button>
                  <div className="min-w-0">
                    <div className="mb-1 flex justify-between gap-2 text-[10px] text-slate-500">
                      <span>{t("strictMigration.tripPlanner.weather.forecastHour")}</span>
                      <time>{t("strictMigration.tripPlanner.weather.timeLabel", { hour: String(hour).padStart(2, "0") })}</time>
                    </div>
                    <input aria-label={t("strictMigration.tripPlanner.weather.forecastHour")} type="range" min={simulationEnabled ? simulationMinHour : 6} max={simulationEnabled ? simulationMaxHour : 23} step={simulationEnabled ? 2 : 1} value={hour} onChange={(event) => { onModeChange("forecast"); onHourChange(Number(event.target.value)); }} className="h-1.5 w-full cursor-pointer accent-emerald-700" />
                  </div>
                  {!simulationEnabled && <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="col-span-2 max-w-28 justify-self-end text-right text-[10px] leading-tight font-semibold text-slate-500 underline-offset-2 hover:underline sm:col-span-1">{t("strictMigration.tripPlanner.weather.providerAttribution")}</a>}
                </>
              ) : (
                <div className="col-span-3 flex items-center gap-2 text-xs text-slate-500">
                  {activeStatus === "loading" && <Loader2 size={15} className="animate-spin" />}
                  <span>{mode === "now" ? t("strictMigration.tripPlanner.weather.rainViewerAttribution") : t("strictMigration.tripPlanner.weather.providerAttribution")}</span>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>

      <style>{`
        .weather-progress-ring { transition:stroke-dashoffset .4s ease; }
        .weather-progress-ring.is-playing { animation:weather-progress-ring 2.4s linear infinite; }
        @keyframes weather-progress-ring { to { stroke-dashoffset:0; } }
         @media (prefers-reduced-motion: reduce) { .weather-progress-ring { transition:none; } .weather-progress-ring.is-playing { animation:none; } }
      `}</style>
    </>
  );
}
