"use client";

import { useEffect, useMemo, useState } from "react";
import { CloudRain, Loader2 } from "lucide-react";
import { Layer, Marker, Source } from "react-map-gl/maplibre";
import type { FeatureCollection, Point } from "geojson";
import type { FilterSpecification } from "maplibre-gl";
import { useTranslation } from "react-i18next";
import type { WeatherEffectCondition } from "@/lib/weather/conditions";
import { advanceWeatherEffectParticles, seedWeatherEffectParticles } from "@/lib/weather/overlay-particles";
import type { RadarOverlayResult, WeatherEffectParticle, WeatherMapMode, WeatherOverlayResult } from "@/lib/weather/types";
import type { WeatherOverlayStatus } from "./use-weather-overlay";
import { SIMULATED_WEATHER_HOURS, simulatedWeatherConditionKeyForHour } from "./trip-weather-simulation";

const BAND_COLORS = {
  light: "#60A5FA",
  moderate: "#2563EB",
  heavy: "#1E3A8A",
} as const;

function particlesGeoJson(particles: WeatherEffectParticle[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: particles.map((particle, index) => ({
      type: "Feature",
      id: index,
      properties: { condition: particle.condition, phase: particle.phase },
      geometry: { type: "Point", coordinates: particle.coordinates },
    })),
  };
}

function conditionFilter(condition: WeatherEffectCondition): FilterSpecification {
  return ["==", ["get", "condition"], condition];
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
  liveRadarAvailable,
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
  liveRadarAvailable: boolean;
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
  const reducedMotion = useMotionPreference();
  const [pageHidden, setPageHidden] = useState(false);
  const [particles, setParticles] = useState<WeatherEffectParticle[]>([]);
  const [animationTick, setAnimationTick] = useState(0);

  useEffect(() => {
    const update = () => setPageHidden(document.visibilityState !== "visible");
    document.addEventListener("visibilitychange", update);
    update();
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    const resetTimer = window.setTimeout(() => {
      setAnimationTick(0);
      setParticles(mode === "forecast" && result?.availability === "forecast"
        ? seedWeatherEffectParticles(result.conditionContours)
        : []);
    }, 0);
    return () => window.clearTimeout(resetTimer);
  }, [mode, result]);

  useEffect(() => {
    if (!enabled || !result || reducedMotion || pageHidden || mapMoving || particles.length === 0) return;
    const timer = window.setInterval(() => {
      setAnimationTick((currentTick) => {
        const nextTick = currentTick + 1;
        setParticles((current) => advanceWeatherEffectParticles(current, result.conditionContours, nextTick));
        return nextTick;
      });
    }, 90);
    return () => window.clearInterval(timer);
  }, [enabled, mapMoving, pageHidden, particles.length, reducedMotion, result]);

  const particleData = useMemo(() => particlesGeoJson(particles), [particles]);
  const hasForecast = enabled && mode === "forecast" && result?.availability === "forecast";
  const hasRadar = enabled && mode === "now" && radarResult?.availability === "radar" && Boolean(radarResult.tileUrlTemplate);
  const showersVisible = animationTick % 34 < 22;
  const thunderFlashVisible = !reducedMotion && !pageHidden && !mapMoving && animationTick % 52 < 3;
  const activeStatus = mode === "now" ? radarStatus : status;
  const simulationMinHour = SIMULATED_WEATHER_HOURS[0];
  const simulationMaxHour = SIMULATED_WEATHER_HOURS.at(-1)!;
  const simulationConditionKey = simulatedWeatherConditionKeyForHour(hour);

  function toggleSimulation() {
    const next = !simulationEnabled;
    if (next) {
      onModeChange("forecast");
      onHourChange(simulationMinHour);
    }
    onSimulationEnabledChange(next);
  }

  return (
    <>
      {hasRadar && radarResult.tileUrlTemplate && (
        <Source id="trip-weather-radar" type="raster" tiles={[radarResult.tileUrlTemplate]} tileSize={256} maxzoom={7}>
          <Layer id="trip-weather-radar-layer" type="raster" paint={{ "raster-opacity": 0.62 }} />
        </Source>
      )}

      {hasForecast && result.contours.features.length > 0 && (
        <Source id="trip-weather-contours" type="geojson" data={result.contours}>
          <Layer id="trip-weather-light-fill" type="fill" filter={["==", ["get", "level"], "light"]} paint={{ "fill-color": BAND_COLORS.light, "fill-opacity": 0.2 }} />
          <Layer id="trip-weather-moderate-fill" type="fill" filter={["==", ["get", "level"], "moderate"]} paint={{ "fill-color": BAND_COLORS.moderate, "fill-opacity": 0.38 }} />
          <Layer id="trip-weather-heavy-fill" type="fill" filter={["==", ["get", "level"], "heavy"]} paint={{ "fill-color": BAND_COLORS.heavy, "fill-opacity": 0.58 }} />
        </Source>
      )}

      {hasForecast && result.rainBoundary.features.length > 0 && (
        <Source id="trip-weather-rain-boundary" type="geojson" data={result.rainBoundary}>
          <Layer id="trip-weather-boundary" type="line" paint={{ "line-color": "#2563EB", "line-opacity": 0.78, "line-width": 1.8, "line-dasharray": [2, 2] }} />
        </Source>
      )}

      {hasForecast && result.conditionContours.features.length > 0 && (
        <Source id="trip-weather-condition-contours" type="geojson" data={result.conditionContours}>
          <Layer
            id="trip-weather-condition-base"
            type="fill"
            paint={{
              "fill-color": ["match", ["get", "condition"], "fog", "#CBD5E1", "overcast", "#94A3B8", "drizzle", "#93C5FD", "rain", "#60A5FA", "showers", "#3B82F6", "thunderstorm", "#4338CA", "snow", "#F8FAFC", "transparent"],
              "fill-opacity": ["match", ["get", "condition"], "fog", 0.14, "overcast", 0.12, "snow", 0.16, 0.08],
            }}
          />
          <Layer id="trip-weather-condition-outline" type="line" paint={{ "line-color": "#475569", "line-opacity": 0.34, "line-width": 1.2, "line-dasharray": [2, 2] }} />
          <Layer id="trip-weather-effect-thunder-flash" type="fill" filter={conditionFilter("thunderstorm")} paint={{ "fill-color": "#FDE68A", "fill-opacity": thunderFlashVisible ? 0.3 : 0 }} />
        </Source>
      )}

      {hasForecast && particles.length > 0 && (
        <Source id="trip-weather-effect-particles" type="geojson" data={particleData}>
          <Layer id="trip-weather-effect-fog" type="circle" filter={conditionFilter("fog")} paint={{ "circle-color": "#F1F5F9", "circle-radius": 17, "circle-blur": 0.82, "circle-opacity": 0.46 }} />
          <Layer id="trip-weather-effect-overcast" type="circle" filter={conditionFilter("overcast")} paint={{ "circle-color": "#64748B", "circle-radius": 20, "circle-blur": 0.86, "circle-opacity": 0.3 }} />
          <Layer id="trip-weather-effect-drizzle" type="circle" filter={conditionFilter("drizzle")} paint={{ "circle-color": "#93C5FD", "circle-radius": 1.55, "circle-blur": 0.2, "circle-opacity": 0.72 }} />
          <Layer id="trip-weather-effect-rain" type="circle" filter={conditionFilter("rain")} paint={{ "circle-color": "#2563EB", "circle-radius": 2.15, "circle-blur": 0.18, "circle-opacity": 0.84 }} />
          <Layer id="trip-weather-effect-showers" type="circle" filter={conditionFilter("showers")} paint={{ "circle-color": "#1D4ED8", "circle-radius": 2.5, "circle-blur": 0.12, "circle-opacity": showersVisible ? 0.9 : 0.08 }} />
          <Layer id="trip-weather-effect-thunderstorm" type="circle" filter={conditionFilter("thunderstorm")} paint={{ "circle-color": "#312E81", "circle-radius": 2.7, "circle-blur": 0.1, "circle-opacity": 0.92 }} />
          <Layer id="trip-weather-effect-snow" type="circle" filter={conditionFilter("snow")} paint={{ "circle-color": "#FFFFFF", "circle-stroke-color": "#BFDBFE", "circle-stroke-width": 0.7, "circle-radius": 3.2, "circle-blur": 0.08, "circle-opacity": 0.92 }} />
        </Source>
      )}

      {hasForecast && result.dominantCenter && (
        <Marker longitude={result.dominantCenter[0]} latitude={result.dominantCenter[1]} anchor="center">
          <div className="weather-cloud-anchor pointer-events-none" aria-hidden="true">
            <span className="weather-cloud-orb weather-cloud-orb-a" />
            <span className="weather-cloud-orb weather-cloud-orb-b" />
            <span className="weather-cloud-orb weather-cloud-orb-c" />
            <span className="weather-cloud-base" />
          </div>
        </Marker>
      )}

      <div className="pointer-events-none absolute inset-0 z-10" data-weather-overlay-ready={activeStatus === "ready" ? "true" : "false"}>
        <div className="pointer-events-auto absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/70 bg-white/90 p-1.5 pr-3 shadow-[0_10px_35px_rgba(15,23,42,0.16)] backdrop-blur-xl">
          <button type="button" aria-label={t("strictMigration.tripPlanner.weather.mapLayer")} aria-pressed={enabled} onClick={() => onEnabledChange(!enabled)} className={"grid h-9 w-9 place-items-center rounded-full transition " + (enabled ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
            {activeStatus === "loading" && enabled ? <Loader2 size={17} className="animate-spin" /> : <CloudRain size={17} />}
          </button>
          <span className="text-xs font-bold text-foreground">{t("strictMigration.tripPlanner.weather.mapLayer")}</span>
        </div>

        {hasForecast && (
          <div className="pointer-events-auto absolute right-4 top-4 rounded-2xl border border-white/70 bg-white/90 px-3 py-2 shadow-[0_10px_35px_rgba(15,23,42,0.14)] backdrop-blur-xl">
            <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-600">
              {(["light", "moderate", "heavy"] as const).map((level) => <span key={level} data-weather-band={level} className="flex items-center gap-1"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: BAND_COLORS[level] }} />{t(`strictMigration.tripPlanner.weather.bands.${level}`)}</span>)}
            </div>
          </div>
        )}

        {enabled && (
          <div className="pointer-events-auto absolute bottom-5 left-1/2 w-[min(520px,calc(100%-32px))] -translate-x-1/2 rounded-2xl border border-white/70 bg-white/92 px-4 py-3 shadow-[0_14px_45px_rgba(15,23,42,0.18)] backdrop-blur-xl">
            <div className="mb-3 flex gap-1 rounded-xl bg-muted p-1 text-[11px] font-bold">
              <button type="button" disabled={!liveRadarAvailable || simulationEnabled} aria-pressed={mode === "now"} onClick={() => onModeChange("now")} className={"flex-1 rounded-lg px-3 py-1.5 transition disabled:cursor-not-allowed disabled:opacity-40 " + (mode === "now" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-card")}>{t("strictMigration.tripPlanner.weather.now")}</button>
              <button type="button" aria-pressed={mode === "forecast"} onClick={() => onModeChange("forecast")} className={"flex-1 rounded-lg px-3 py-1.5 transition " + (mode === "forecast" ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-card")}>{t("strictMigration.tripPlanner.weather.forecast")}</button>
            </div>

            {simulationAvailable && (
              <div data-weather-simulation-control className="mb-3 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-3 py-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-foreground">{t("strictMigration.tripPlanner.weather.simulation.label")}</p>
                    <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-primary">{t("strictMigration.tripPlanner.weather.simulation.testData")}</p>
                  </div>
                  <button type="button" aria-pressed={simulationEnabled} onClick={toggleSimulation} className={"relative h-6 w-11 shrink-0 rounded-full transition " + (simulationEnabled ? "bg-primary" : "bg-muted-foreground/30")}>
                    <span className={"absolute top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-all " + (simulationEnabled ? "left-6" : "left-1")} />
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
                <div className="mb-2 flex items-center justify-between text-[11px]"><span className="font-bold text-foreground">{t("strictMigration.tripPlanner.weather.forecastHour")}</span><span className="rounded-full bg-primary px-2 py-1 font-black text-white">{t("strictMigration.tripPlanner.weather.timeLabel", { hour: String(hour).padStart(2, "0") })}</span></div>
                <input aria-label={t("strictMigration.tripPlanner.weather.forecastHour")} type="range" min={simulationEnabled ? simulationMinHour : 6} max={simulationEnabled ? simulationMaxHour : 23} step={simulationEnabled ? 2 : 1} value={hour} onChange={(event) => { onModeChange("forecast"); onHourChange(Number(event.target.value)); }} className="h-1.5 w-full cursor-pointer accent-primary" />
                {activeStatus === "missing_coordinates" && <p className="mt-2 text-[10px] font-semibold text-muted-foreground">{t(simulationEnabled ? "strictMigration.tripPlanner.weather.simulation.missingAnchor" : "strictMigration.tripPlanner.weather.missingCoordinates")}</p>}
                {status === "error" && <p className="mt-2 text-[10px] font-semibold text-destructive">{t("strictMigration.tripPlanner.weather.mapUnavailable")}</p>}
                {status === "ready" && result?.availability === "unavailable_yet" && <p className="mt-2 text-[10px] font-semibold text-muted-foreground">{t("strictMigration.tripPlanner.weather.forecastAvailableNearerDeparture")}</p>}
                {status === "ready" && result?.availability === "unavailable" && <p className="mt-2 text-[10px] font-semibold text-muted-foreground">{t("strictMigration.tripPlanner.weather.forecastUnavailable")}</p>}
                {status === "ready" && result?.availability === "forecast" && result.contours.features.length === 0 && <p className="mt-2 text-[10px] font-semibold text-muted-foreground">{t("strictMigration.tripPlanner.weather.noRainAtHour", { time: `${String(hour).padStart(2, "0")}:00` })}</p>}
                {result?.stale && <p className="mt-2 text-[10px] font-semibold text-amber-700">{t("strictMigration.tripPlanner.weather.stale")}</p>}
                {!simulationEnabled && <a href="https://open-meteo.com/" target="_blank" rel="noreferrer" className="mt-1 block text-[9px] text-muted-foreground underline-offset-2 hover:underline">{t("strictMigration.tripPlanner.weather.providerAttribution")}</a>}
              </>
            )}

            {mode === "now" && (
              <>
                <div className="flex items-center justify-between gap-3 text-[11px]"><span className="font-bold text-foreground">{t("strictMigration.tripPlanner.weather.liveRadar")}</span>{radarResult?.observedAt && <span className="text-muted-foreground">{t("strictMigration.tripPlanner.weather.radarUpdated", { time: new Date(radarResult.observedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) })}</span>}</div>
                {(radarStatus === "error" || radarResult?.availability === "unavailable") && <p className="mt-2 text-[10px] font-semibold text-destructive">{t("strictMigration.tripPlanner.weather.radarUnavailable")}</p>}
                {radarResult?.stale && <p className="mt-2 text-[10px] font-semibold text-amber-700">{t("strictMigration.tripPlanner.weather.radarStale")}</p>}
                <a href={radarResult?.attributionUrl ?? "https://www.rainviewer.com/"} target="_blank" rel="noreferrer" className="mt-1 block text-[9px] text-muted-foreground underline-offset-2 hover:underline">{t("strictMigration.tripPlanner.weather.rainViewerAttribution")}</a>
              </>
            )}
          </div>
        )}
      </div>

      <style>{`
        .weather-cloud-anchor { position: relative; width: 92px; height: 48px; filter: drop-shadow(0 12px 13px rgba(30,64,175,.22)); animation: weather-cloud-drift 5s ease-in-out infinite; }
        .weather-cloud-orb,.weather-cloud-base { position:absolute; display:block; background:linear-gradient(145deg,#fff 15%,#dbeafe 72%,#bfdbfe); box-shadow:inset -5px -7px 12px rgba(59,130,246,.12),inset 5px 5px 12px rgba(255,255,255,.9); }
        .weather-cloud-orb { border-radius:999px; }
        .weather-cloud-orb-a { width:42px;height:42px;left:10px;top:2px; }
        .weather-cloud-orb-b { width:50px;height:50px;left:31px;top:-7px; }
        .weather-cloud-orb-c { width:34px;height:34px;right:0;top:10px; }
        .weather-cloud-base { width:78px;height:27px;left:7px;bottom:0;border-radius:999px; }
        @keyframes weather-cloud-drift { 0%,100% { transform:translate3d(-3px,0,0) scale(.98); } 50% { transform:translate3d(3px,-3px,0) scale(1.02); } }
        @media (prefers-reduced-motion: reduce) { .weather-cloud-anchor { animation:none; } }
      `}</style>
    </>
  );
}
