import type {Activity} from "@/backend/core/types";
import {resolveCartLinePrice} from "@/backend/core/helpers";
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

export function getTripActivitySublabel(
  activity: { price: number; outlet: { city: string } } | undefined,
  savedSublabel: string | null | undefined,
  formatPrice: (price: number) => string,
  fallback: string,
): string {
  if (activity) return `${formatPrice(Number(activity.price))} · ${activity.outlet.city}`;
  return savedSublabel || fallback;
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
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!match) return Number.NaN;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] === undefined ? 0 : Number(match[3]);
  if (hours > 23 || minutes > 59 || seconds > 59) return Number.NaN;
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

/** Complete-list ordering keeps the displayed order identical to persisted sequence. */
export function applyTripOrder(items: TripItem[], orderedIds: string[]): TripItem[] {
  const byId = new Map(items.map(item => [item.id, item]));
  if (orderedIds.length !== items.length || new Set(orderedIds).size !== items.length || orderedIds.some(id => !byId.has(id))) {
    throw new Error("Trip items changed; refresh and try again");
  }
  return orderedIds.map((id, sequence) => ({ ...byId.get(id)!, sequence }));
}

export function getTripScheduleIssue(trip: Pick<Trip, "start_date" | "end_date">, items: TripItem[]): "date_outside_trip" | "invalid_time" | "time_without_date" | "daily_origin_order" | "non_chronological" | null {
  const dates = new Set(getTripDayDates(trip));
  for (const item of items) {
    if (item.scheduled_date !== null && !dates.has(item.scheduled_date)) return "date_outside_trip";
    if (item.scheduled_time !== null && Number.isNaN(tripTimeToMinutes(item.scheduled_time))) return "invalid_time";
    if (item.scheduled_time !== null && item.scheduled_date === null) return "time_without_date";
  }
  const datesWithDailyOrigins = new Set(items.flatMap(item => item.is_day_origin && item.scheduled_date ? [item.scheduled_date] : []));
  for (const date of datesWithDailyOrigins) {
    const firstForDay = items.filter(item => item.scheduled_date === date).sort((a, b) => a.sequence - b.sequence)[0];
    if (!firstForDay?.is_day_origin) return "daily_origin_order";
  }
  return hasChronologicalTripTimes(items) ? null : "non_chronological";
}

export function getTripLegFeasibility(input: { previousStart: number | null; previousEnd: number | null; nextStart: number | null; travelMinutes: number | null }): {status: "conflict" | "fits_estimate" | "unknown"; slackMinutes: number | null} {
  const { previousStart, previousEnd, nextStart, travelMinutes } = input;
  const validTime = (value: number | null): value is number => value !== null && Number.isFinite(value) && value >= 0 && value < 1440;
  if (!validTime(previousStart) || !validTime(nextStart) || travelMinutes === null || !Number.isFinite(travelMinutes) || travelMinutes < 0 || (previousEnd !== null && (!validTime(previousEnd) || previousEnd < previousStart))) return {status: "unknown", slackMinutes: null};
  const slackMinutes = nextStart - (previousEnd ?? previousStart) - travelMinutes;
  if (slackMinutes < 0) return {status: "conflict", slackMinutes};
  return previousEnd === null ? {status: "unknown", slackMinutes: null} : {status: "fits_estimate", slackMinutes};
}

export function resolveTripOrigin(items: TripItem[], date: string | null): TripItem | null {
  const ordered=[...items].sort((a,b)=>a.sequence-b.sequence);
  return ordered.find(item=>item.is_day_origin && item.scheduled_date === date) ?? ordered.find(item=>item.source === "location" && !item.is_day_origin) ?? null;
}

export function hasDistinctTripRoutePoints(points: readonly (readonly [number, number])[]): boolean {
  if (points.length < 2) return false;
  const [latitude, longitude] = points[0];
  return points.some(([nextLatitude, nextLongitude]) => nextLatitude !== latitude || nextLongitude !== longitude);
}

export function getTripDiscoveryAnchor(items: TripItem[], date: string | null): { lat: number; lng: number } | undefined {
  const origin = resolveTripOrigin(items, date);
  if (origin && isValidTripCoordinate(origin.lat, origin.lng)) return { lat: origin.lat, lng: origin.lng };
  const lastStop = [...items]
    .filter((item) => item.scheduled_date === date && !item.is_day_origin && isValidTripCoordinate(item.lat, item.lng))
    .sort((a, b) => a.sequence - b.sequence)
    .at(-1);
  return lastStop ? { lat: lastStop.lat, lng: lastStop.lng } : undefined;
}

export function getTripDiscoveryFingerprint(items: TripItem[], date: string | null): string {
  const anchor = getTripDiscoveryAnchor(items, date);
  const productIds = [...new Set(items.flatMap((item) => item.experience_id ? [item.experience_id] : []))].sort();
  return JSON.stringify({ date, anchor: anchor ?? null, productIds });
}

export function getTripBudgetEstimate(items:TripItem[], activities:Map<string, Pick<Activity,"id"|"outletId"|"price"|"variants"> & Partial<Activity>>) {
  let total=0;let unknownCount=0;
  for (const item of items) {
    if (!item.experience_id) continue;
    const activity=activities.get(item.experience_id);
    if (!activity || activity.variants.length > 1) {unknownCount++;continue;}
    const resolved=resolveCartLinePrice(activity as Activity,{activityId:activity.id,variantId:activity.variants.length === 1 ? activity.variants[0].id : "",outletId:item.outlet_id ?? activity.outletId,qty:1},{now:new Date(),productIds:items.flatMap(row=>row.experience_id ? [row.experience_id] : [])});
    if (resolved.available) total+=resolved.unitPrice;else unknownCount++;
  }
  return {total,unknownCount};
}
