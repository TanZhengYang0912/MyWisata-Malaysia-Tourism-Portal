import type { Trip, TripItem } from "@/backend/domains/trips";

export interface TripDayGroup {
  date: string;
  items: TripItem[];
}

export interface GroupedTripItems {
  days: TripDayGroup[];
  unscheduled: TripItem[];
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
