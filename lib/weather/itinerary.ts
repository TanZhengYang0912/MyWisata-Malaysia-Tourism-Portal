import type { ComputedActivity } from "@/backend/core/types";
import {
  isValidTripCoordinate,
  selectTripDayWeatherAnchor,
  type TripDayGroup,
} from "@/lib/customer/trip-planner";
import { classifyWeatherSensitivity } from "@/lib/weather/risk";
import type { WeatherTarget } from "@/lib/weather/types";

export type ItineraryWeatherPlan = {
  targets: WeatherTarget[];
  dayTargetKeyByDate: Record<string, string>;
  itemTargetKeyById: Record<string, string>;
};

export function buildItineraryWeatherPlan(
  days: TripDayGroup[],
  activitiesById: ReadonlyMap<string, ComputedActivity>,
): ItineraryWeatherPlan {
  const targets: WeatherTarget[] = [];
  const dayTargetKeyByDate: Record<string, string> = {};
  const itemTargetKeyById: Record<string, string> = {};
  const identityToKey = new Map<string, string>();

  const addTarget = (input: Omit<WeatherTarget, "key">) => {
    const latitude = Number(input.latitude.toFixed(4));
    const longitude = Number(input.longitude.toFixed(4));
    const identity = `${input.date}:${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
    const existing = identityToKey.get(identity);
    if (existing) return existing;
    if (targets.length >= 20) return null;

    const key = `w:${identity}`;
    identityToKey.set(identity, key);
    targets.push({ ...input, key, latitude, longitude, label: input.label.slice(0, 240) });
    return key;
  };

  for (const day of days) {
    const anchor = selectTripDayWeatherAnchor(day.items);
    if (!anchor) continue;
    const key = addTarget({
      date: day.date,
      latitude: anchor.lat,
      longitude: anchor.lng,
      label: anchor.label,
      kind: "day",
      itemId: anchor.id,
    });
    if (key) dayTargetKeyByDate[day.date] = key;
  }

  for (const day of days) {
    for (const item of day.items) {
      if (!item.experience_id || !isValidTripCoordinate(item.lat, item.lng)) continue;
      if (classifyWeatherSensitivity(activitiesById.get(item.experience_id)) !== "weather_sensitive") continue;
      const key = addTarget({
        date: day.date,
        latitude: item.lat,
        longitude: item.lng,
        label: item.label,
        kind: "item",
        itemId: item.id,
      });
      if (key) itemTargetKeyById[item.id] = key;
    }
  }

  return { targets, dayTargetKeyByDate, itemTargetKeyById };
}
