export type WeatherCondition =
  | "clear"
  | "mainly-clear"
  | "partly-cloudy"
  | "overcast"
  | "fog"
  | "drizzle"
  | "rain"
  | "showers"
  | "snow"
  | "thunderstorm"
  | "unknown";

export type WeatherEffectCondition = Exclude<
  WeatherCondition,
  "clear" | "mainly-clear" | "partly-cloudy" | "unknown"
>;

export function weatherConditionForCode(code: number | null): WeatherCondition {
  if (code === 0) return "clear";
  if (code === 1) return "mainly-clear";
  if (code === 2) return "partly-cloudy";
  if (code === 3) return "overcast";
  if (code === 45 || code === 48) return "fog";
  if (code !== null && code >= 51 && code <= 57) return "drizzle";
  if (code !== null && code >= 61 && code <= 67) return "rain";
  if (code !== null && ((code >= 71 && code <= 77) || code === 85 || code === 86)) return "snow";
  if (code !== null && code >= 80 && code <= 82) return "showers";
  if (code !== null && code >= 95 && code <= 99) return "thunderstorm";
  return "unknown";
}

export function weatherEffectConditionForCode(code: number | null): WeatherEffectCondition | null {
  const condition = weatherConditionForCode(code);
  return condition === "overcast"
    || condition === "fog"
    || condition === "drizzle"
    || condition === "rain"
    || condition === "showers"
    || condition === "snow"
    || condition === "thunderstorm"
    ? condition
    : null;
}
