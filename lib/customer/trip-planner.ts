import type { Trip, TripItem } from "@/backend/domains/trips";

export interface TripDayGroup {
  date: string;
  items: TripItem[];
}

export interface GroupedTripItems {
  days: TripDayGroup[];
  unscheduled: TripItem[];
}

export interface TripItemTimeBounds {
  min?: string;
  max?: string;
  disabled?: boolean;
}

export type TripDayWeatherAnchor = Pick<
  TripItem,
  "id" | "experience_id" | "lat" | "lng" | "label" | "scheduled_date"
>;

export function isValidTripCoordinate(lat: number, lng: number): boolean {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export function selectTripDayWeatherAnchor(items: TripItem[]): TripDayWeatherAnchor | null {
  const item = [...items]
    .sort((a, b) => a.sequence - b.sequence)
    .find((candidate) => isValidTripCoordinate(candidate.lat, candidate.lng));

  if (!item) return null;
  return {
    id: item.id,
    experience_id: item.experience_id,
    lat: item.lat,
    lng: item.lng,
    label: item.label,
    scheduled_date: item.scheduled_date,
  };
}

export function getTripDayDates(trip: Pick<Trip, "start_date" | "end_date">): string[] {
  if (!trip.start_date || !trip.end_date) return [];

  const start = new Date(`${trip.start_date}T00:00:00Z`);
  const end = new Date(`${trip.end_date}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];

  const dates: string[] = [];
  for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    dates.push(cursor.toISOString().slice(0, 10));
  }
  return dates;
}

export function groupTripItemsByDay(trip: Pick<Trip, "start_date" | "end_date">, items: TripItem[]): GroupedTripItems {
  const dayDates = getTripDayDates(trip);
  const daySet = new Set(dayDates);
  const days = dayDates.map((date) => ({
    date,
    items: items.filter((item) => item.scheduled_date === date).sort((a, b) => a.sequence - b.sequence),
  }));

  return {
    days,
    unscheduled: items
      .filter((item) => !item.scheduled_date || !daySet.has(item.scheduled_date))
      .sort((a, b) => a.sequence - b.sequence),
  };
}

function tripTimeToMinutes(time: string | null): number | null {
  if (time === null) return null;
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return Number.NaN;
  return hours * 60 + minutes;
}

function minutesToTripTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function hasChronologicalTripTimes(items: TripItem[]): boolean {
  const scheduledDates = new Set(items.flatMap((item) => item.scheduled_date ? [item.scheduled_date] : []));

  for (const date of scheduledDates) {
    let previousMinutes: number | null = null;
    const dayItems = items
      .filter((item) => item.scheduled_date === date)
      .sort((a, b) => a.sequence - b.sequence);

    for (const item of dayItems) {
      const minutes = tripTimeToMinutes(item.scheduled_time);
      if (Number.isNaN(minutes)) return false;
      if (minutes === null) continue;
      if (previousMinutes !== null && minutes <= previousMinutes) return false;
      previousMinutes = minutes;
    }
  }

  return true;
}

export function getTripItemTimeBounds(items: TripItem[], itemId: string): TripItemTimeBounds {
  const target = items.find((item) => item.id === itemId);
  if (!target?.scheduled_date) return {};

  const dayItems = items
    .filter((item) => item.scheduled_date === target.scheduled_date)
    .sort((a, b) => a.sequence - b.sequence);
  const targetIndex = dayItems.findIndex((item) => item.id === itemId);
  if (targetIndex < 0) return {};

  let previousMinutes: number | null = null;
  for (let index = targetIndex - 1; index >= 0; index -= 1) {
    const minutes = tripTimeToMinutes(dayItems[index].scheduled_time);
    if (minutes !== null && !Number.isNaN(minutes)) {
      previousMinutes = minutes;
      break;
    }
  }

  let nextMinutes: number | null = null;
  for (let index = targetIndex + 1; index < dayItems.length; index += 1) {
    const minutes = tripTimeToMinutes(dayItems[index].scheduled_time);
    if (minutes !== null && !Number.isNaN(minutes)) {
      nextMinutes = minutes;
      break;
    }
  }

  const minimum = previousMinutes === null ? null : previousMinutes + 1;
  const maximum = nextMinutes === null ? null : nextMinutes - 1;
  if ((minimum !== null && minimum > 23 * 60 + 59)
    || (maximum !== null && maximum < 0)
    || (minimum !== null && maximum !== null && minimum > maximum)) {
    return { disabled: true };
  }

  return {
    ...(minimum === null ? {} : { min: minutesToTripTime(minimum) }),
    ...(maximum === null ? {} : { max: minutesToTripTime(maximum) }),
  };
}

/**
 * Given the trip's full item list, the id of an item being replaced (e.g. a
 * Budget Guard swap), and the new item's id, returns the real day-relative
 * item order with the replacement substituted in place — the target order
 * to pass to a reorder call so the new item lands in the exact slot the old
 * one held. Returns null when the item being replaced isn't found or was
 * never scheduled — nothing to preserve in that case, the caller should
 * just add the new item without a follow-up reorder.
 */
export function computeSwapTargetOrder(items: TripItem[], existingId: string, newId: string): string[] | null {
  const existing = items.find((item) => item.id === existingId);
  if (!existing?.scheduled_date) return null;

  return items
    .filter((item) => item.scheduled_date === existing.scheduled_date)
    .sort((a, b) => a.sequence - b.sequence)
    .map((item) => (item.id === existingId ? newId : item.id));
}

export function formatTripDay(date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-MY", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function formatTripTime(time: string | null) {
  if (!time) return "Add time";
  const [hours, minutes] = time.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return "Add time";
  return new Date(Date.UTC(2026, 0, 1, hours, minutes)).toLocaleTimeString("en-MY", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}
