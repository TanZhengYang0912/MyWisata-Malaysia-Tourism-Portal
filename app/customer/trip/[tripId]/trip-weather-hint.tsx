"use client";

import {
  CircleHelp,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudRainWind,
  CloudSun,
  Clock,
  MapPin,
  Snowflake,
  Sun,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/utils";
import { weatherConditionForCode, type WeatherCondition } from "@/lib/weather/conditions";
import type { WeatherTargetResult } from "@/lib/weather/types";

export { weatherConditionForCode } from "@/lib/weather/conditions";

const REASON_KEYS = {
  thunderstorm: "thunderstorm",
  heavy_rain: "heavyRain",
  rain: "rain",
  strong_wind: "strongWind",
  extreme_uv: "extremeUv",
} as const;

const REASON_ICONS: Record<keyof typeof REASON_KEYS, LucideIcon> = {
  thunderstorm: CloudLightning,
  heavy_rain: CloudRainWind,
  rain: CloudRain,
  strong_wind: Wind,
  extreme_uv: Sun,
};

const CONDITION_ICONS: Record<WeatherCondition, LucideIcon> = {
  clear: Sun,
  "mainly-clear": CloudSun,
  "partly-cloudy": CloudSun,
  overcast: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  showers: CloudRainWind,
  snow: Snowflake,
  thunderstorm: CloudLightning,
  unknown: CircleHelp,
};

const CONDITION_KEYS: Record<WeatherCondition, string> = {
  clear: "clear",
  "mainly-clear": "mainlyClear",
  "partly-cloudy": "partlyCloudy",
  overcast: "overcast",
  fog: "fog",
  drizzle: "drizzle",
  rain: "rain",
  showers: "showers",
  snow: "snow",
  thunderstorm: "thunderstorm",
  unknown: "unknown",
};

function AnimatedWeatherIcon({ condition, label }: { condition: WeatherCondition; label: string }) {
  const Icon = CONDITION_ICONS[condition];
  const hasFallingWeather = condition === "drizzle"
    || condition === "rain"
    || condition === "showers"
    || condition === "thunderstorm";

  return (
    <span
      role="img"
      aria-label={label}
      data-weather-condition={condition}
      className={`trip-weather-icon trip-weather-condition-${condition}`}
    >
      <Icon size={11} aria-hidden="true" />
      {hasFallingWeather && <span aria-hidden="true" className="trip-weather-fall trip-weather-fall-a" />}
      {hasFallingWeather && <span aria-hidden="true" className="trip-weather-fall trip-weather-fall-b" />}
    </span>
  );
}

function WeatherReasonIcon({ reason }: { reason: keyof typeof REASON_KEYS }) {
  const Icon = REASON_ICONS[reason];
  return <Icon size={11} aria-hidden="true" data-weather-reason={reason} />;
}

function metric(value: number | null, suffix: string) {
  return value === null ? "—" : `${Math.round(value * 10) / 10}${suffix}`;
}

export function TripWeatherHint({ date, anchorLabel, result, loading, onSelectRiskHour, simulationLabel }: {
  date: string;
  anchorLabel: string;
  result: WeatherTargetResult | null;
  loading: boolean;
  onSelectRiskHour?: (hour: number) => void;
  simulationLabel?: string;
}) {
  const { t } = useTranslation("customer");
  const key = "strictMigration.tripPlanner.weather";

  if (loading) {
    return <p className="mt-1 text-[10px] font-medium text-muted-foreground" aria-live="polite">{t(`${key}.loading`)}</p>;
  }
  if (!result || result.forecast.availability !== "forecast" || !result.forecast.evidence) {
    const unavailableKey = result?.forecast.availability === "unavailable_yet"
      ? "forecastAvailableNearerDeparture"
      : "forecastUnavailable";
    return (
      <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground" aria-live="polite">
        <CloudRain size={11} aria-hidden="true" /> {t(`${key}.${unavailableKey}`)}
      </p>
    );
  }

  const { evidence } = result.forecast;
  const level = result.risk.level;
  const firstReason = result.risk.reasons[0];
  const summary = firstReason
    ? t(`${key}.reasons.${REASON_KEYS[firstReason]}`)
    : t(`${key}.levels.${level}`);
  const riskWindow = result.risk.window;
  const startTime = riskWindow ? `${String(riskWindow.startHour).padStart(2, "0")}:00` : null;
  const endTime = riskWindow ? `${String(riskWindow.endHour).padStart(2, "0")}:00` : null;
  const timedSummary = riskWindow && startTime && endTime
    ? `${t(`${key}.riskWindow`, { start: startTime, end: endTime })} ${summary}`
    : `${t(`${key}.dailyRisk`)} · ${summary}`;
  const temperature = `${metric(evidence.temperatureMinC, "°")}–${metric(evidence.temperatureMaxC, "°C")}`;
  const condition = weatherConditionForCode(evidence.weatherCode);
  const levelClass = level === "high"
    ? "border-destructive/30 bg-destructive/10 text-destructive"
    : level === "caution"
      ? "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
      : "border-border bg-background text-foreground";

  return (
    <details className="mt-1.5 text-[10px]">
      <summary
        className="flex cursor-pointer list-none items-center gap-1.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        aria-label={riskWindow && onSelectRiskHour ? `${timedSummary}. ${t(`${key}.viewOnMap`)}` : undefined}
        onClick={() => riskWindow && onSelectRiskHour?.(riskWindow.startHour)}
      >
        <Badge variant="outline" className={cn("max-w-[220px] gap-1 truncate px-1.5 py-0.5 text-[10px]", levelClass)}>
          <AnimatedWeatherIcon condition={condition} label={t(`${key}.conditions.${CONDITION_KEYS[condition]}`)} />
          {simulationLabel && <span className="shrink-0 rounded bg-primary/10 px-1 font-black text-primary">{simulationLabel}</span>}
          <span className="sr-only">{t(`${key}.levels.${level}`)}</span>
          <span className="truncate">{timedSummary}</span>
          <span aria-hidden="true">·</span>
          <span>{temperature}</span>
        </Badge>
      </summary>
      <div className="mt-2 space-y-1.5 rounded-xl border border-border bg-background p-2.5 text-muted-foreground">
        <p className="font-semibold text-foreground">{simulationLabel ?? t(`${key}.basedOnForecast`)}</p>
        <p className="flex items-center gap-1"><MapPin size={11} aria-hidden="true" /> {t(`${key}.location`, { location: anchorLabel })}</p>
        <p className="flex items-center gap-1"><Clock size={11} aria-hidden="true" /> {date}</p>
        {riskWindow && <p className="font-semibold text-primary">{t(`${key}.viewOnMap`)} · {startTime}–{endTime}</p>}
        {result.risk.reasons.map((reason) => (
          <p key={reason} className="flex items-center gap-1 font-medium text-foreground">
            <WeatherReasonIcon reason={reason} />
            {t(`${key}.reasons.${REASON_KEYS[reason]}`)}
          </p>
        ))}
        <p>{t(`${key}.metrics.temperatureRange`, { min: metric(evidence.temperatureMinC, "°C"), max: metric(evidence.temperatureMaxC, "°C") })}</p>
        <p className="flex items-center gap-1"><CloudRain size={11} aria-hidden="true" /> {t(`${key}.metrics.precipitation`, { probability: metric(evidence.precipitationProbabilityMax, "%"), amount: metric(evidence.precipitationSumMm, " mm") })}</p>
        <p className="flex items-center gap-1"><Wind size={11} aria-hidden="true" /> {t(`${key}.metrics.windGust`, { speed: metric(evidence.windGustMaxKmh, " km/h") })}</p>
        <p className="flex items-center gap-1"><Sun size={11} aria-hidden="true" /> {t(`${key}.metrics.uvIndex`, { value: metric(evidence.uvIndexMax, "") })}</p>
        {result.forecast.stale && <p className="font-medium text-amber-700 dark:text-amber-300">{t(`${key}.stale`)}</p>}
        {!simulationLabel && <p>{t(`${key}.lastRetrieved`, { date: result.forecast.fetchedAt })}</p>}
        <p>{t(`${key}.planningAdvice`)}</p>
        {!simulationLabel && (
          <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline-offset-2 hover:underline">
            {t(`${key}.providerAttribution`)}
          </a>
        )}
      </div>
      <style>{`
        .trip-weather-icon { position:relative; display:inline-grid; width:14px; height:14px; flex:0 0 14px; place-items:center; overflow:hidden; }
        .trip-weather-icon > svg { position:relative; z-index:1; }
        .trip-weather-condition-clear > svg { animation:trip-weather-sun-breathe 3.2s ease-in-out infinite; }
        .trip-weather-condition-mainly-clear > svg,
        .trip-weather-condition-partly-cloudy > svg,
        .trip-weather-condition-overcast > svg,
        .trip-weather-condition-drizzle > svg,
        .trip-weather-condition-rain > svg,
        .trip-weather-condition-showers > svg { animation:trip-weather-cloud-drift 3.6s ease-in-out infinite; }
        .trip-weather-condition-fog > svg { animation:trip-weather-fog-slide 4s ease-in-out infinite; }
        .trip-weather-condition-snow > svg { animation:trip-weather-snow-turn 5s linear infinite; }
        .trip-weather-condition-thunderstorm > svg { animation:trip-weather-lightning-flash 2.8s ease-in-out infinite; }
        .trip-weather-fall { position:absolute; top:9px; width:1px; height:3px; border-radius:999px; background:currentColor; opacity:.7; animation:trip-weather-rain-fall 1s linear infinite; }
        .trip-weather-fall-a { left:4px; }
        .trip-weather-fall-b { right:4px; animation-delay:.45s; }
        @keyframes trip-weather-sun-breathe { 0%,100% { transform:scale(.92) rotate(0deg); opacity:.82; } 50% { transform:scale(1.08) rotate(12deg); opacity:1; } }
        @keyframes trip-weather-cloud-drift { 0%,100% { transform:translateX(-1px); } 50% { transform:translateX(1px); } }
        @keyframes trip-weather-fog-slide { 0%,100% { transform:translateX(-1.5px); opacity:.72; } 50% { transform:translateX(1.5px); opacity:1; } }
        @keyframes trip-weather-rain-fall { 0% { transform:translateY(-2px); opacity:0; } 35% { opacity:.78; } 100% { transform:translateY(4px); opacity:0; } }
        @keyframes trip-weather-snow-turn { to { transform:rotate(360deg); } }
        @keyframes trip-weather-lightning-flash { 0%,42%,48%,100% { transform:scale(1); opacity:.78; } 44%,46% { transform:scale(1.12); opacity:1; } }
        @media (prefers-reduced-motion: reduce) {
          .trip-weather-icon,
          .trip-weather-icon * { animation:none !important; }
        }
      `}</style>
    </details>
  );
}

export function TripWeatherItemMarker({ result }: { result: WeatherTargetResult | null }) {
  const { t } = useTranslation("customer");
  if (!result || (result.risk.level !== "caution" && result.risk.level !== "high")) return null;
  return (
    <Badge
      variant={result.risk.level === "high" ? "destructive" : "outline"}
      className={cn(
        "mt-1 px-1.5 py-0.5 text-[9px]",
        result.risk.level === "caution" && "border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
      )}
    >
      <CloudRain size={10} aria-hidden="true" />
      {t("strictMigration.tripPlanner.weather.mayAffectOutdoorPlans")}
    </Badge>
  );
}
