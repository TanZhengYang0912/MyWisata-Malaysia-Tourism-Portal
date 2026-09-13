import type { OperatingHours, OperatingHourWeekday } from "@/backend/core/types";
import {
  getOperatingHoursPeriods,
  isOperatingHoursAtAvailable,
  isOperatingHoursOpenNow,
  isOperatingHoursWindowAvailable as isWeeklyOperatingHoursWindowAvailable,
} from "@/lib/customer/operating-hours";

export {
  isOperatingHoursAtAvailable,
  isOperatingHoursOpenNow,
  isWeeklyOperatingHoursWindowAvailable as isOperatingHoursWindowAvailable,
};

const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";
const weekdayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: MALAYSIA_TIME_ZONE });
const dateFormatter = new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: MALAYSIA_TIME_ZONE });

export interface CustomerCalendarRecord {
  id: string;
  activityId: string;
  activityName: string;
  image?: string | null;
  outletId: string;
  outletName: string;
  vendorName?: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  booked: number;
  status?: string | null;
  requiresBooking?: boolean;
  operatingHours: OperatingHours | null;
}

export interface CustomerCalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  extendedProps: {
    activityId: string;
    outletId: string;
    outletName: string;
    vendorName?: string | null;
    image?: string | null;
    remainingCapacity: number;
    requiresBooking: boolean;
  };
}

function parseClock(value: string | undefined): number | null {
  if (!value || !/^(?:([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(value)) return null;
  if (value === "24:00") return 1440;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function dateKey(date: Date): string {
  return dateFormatter.format(date);
}

function weekdayKey(date: Date): OperatingHourWeekday {
  return weekdayFormatter.format(date).slice(0, 3).toLowerCase() as OperatingHourWeekday;
}

function localMinutes(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: MALAYSIA_TIME_ZONE,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

function localDateDistance(start: Date, end: Date): number {
  const startKey = dateKey(start);
  const endKey = dateKey(end);
  if (startKey === endKey) return 0;
  return end.getTime() >= start.getTime() ? 1 : -1;
}

function containsRange(open: number, close: number, start: Date, end: Date): boolean {
  const startMinute = localMinutes(start);
  let endMinute = localMinutes(end);
  if (localDateDistance(start, end) > 0 || endMinute < startMinute) endMinute += 1440;
  const adjustedClose = close <= open ? close + 1440 : close;
  if (endMinute < startMinute) return false;
  return startMinute >= open && endMinute <= adjustedClose;
}

export function isOperatingHoursRangeAvailable(startIso: string, endIso: string, operatingHours: OperatingHours | null): boolean {
  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start || !operatingHours) return false;
  const day = operatingHours[weekdayKey(start)];
  const periods = getOperatingHoursPeriods(day);
  if (periods.length === 0) return false;
  return periods.some((period) => {
    const open = parseClock(period.open);
    const close = parseClock(period.close);
    return open !== null && close !== null && containsRange(open, close, start, end);
  });
}

export function toCustomerCalendarEvents(records: CustomerCalendarRecord[], now = new Date()): CustomerCalendarEvent[] {
  return records
    .filter((record) => {
      const start = new Date(record.startsAt);
      const end = new Date(record.endsAt);
      return !Number.isNaN(start.getTime())
        && !Number.isNaN(end.getTime())
        && start > now
        && end > start
        && record.capacity > record.booked
        && (!record.status || record.status === "available")
        && isOperatingHoursRangeAvailable(record.startsAt, record.endsAt, record.operatingHours);
    })
    .map((record) => ({
      id: record.id,
      title: record.activityName,
      start: record.startsAt,
      end: record.endsAt,
      extendedProps: {
        activityId: record.activityId,
        outletId: record.outletId,
        outletName: record.outletName,
        vendorName: record.vendorName,
        image: record.image,
        remainingCapacity: Math.max(0, record.capacity - record.booked),
        requiresBooking: record.requiresBooking ?? true,
      },
    }));
}
