import type { Booking } from "@/backend/core/types";

export const CALENDAR_VISIBLE_BOOKINGS = 3;
const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";

export type ItineraryGroupStatus = Booking["status"] | "mixed";

export interface BookingItineraryGroup {
  key: string;
  activityId: string;
  activityName: string;
  outletId: string;
  slotStartsAt?: string;
  bookings: Booking[];
  totalQty: number;
  status: ItineraryGroupStatus;
}

const calendarDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: MALAYSIA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function calendarDateParts(date: Date) {
  const parts = calendarDateFormatter.formatToParts(date);
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function calendarDateKey(date: Date) {
  const { year, month, day } = calendarDateParts(date);
  return `${year}-${month}-${day}`;
}

function itineraryGroupKey(booking: Booking) {
  const slotKey = booking.slotStartsAt ? new Date(booking.slotStartsAt).getTime() : "unscheduled";
  return [booking.activityId, booking.outletId, slotKey].join("::");
}

export function groupBookings(bookings: Booking[]) {
  const groups = new Map<string, BookingItineraryGroup>();

  for (const booking of bookings) {
    const key = itineraryGroupKey(booking);
    const existing = groups.get(key);
    if (existing) {
      existing.bookings.push(booking);
      existing.totalQty += booking.qty;
      if (existing.status !== booking.status) existing.status = "mixed";
      continue;
    }

    groups.set(key, {
      key,
      activityId: booking.activityId,
      activityName: booking.activityName,
      outletId: booking.outletId,
      slotStartsAt: booking.slotStartsAt,
      bookings: [booking],
      totalQty: booking.qty,
      status: booking.status,
    });
  }

  return [...groups.values()];
}

export function groupBookingsByDay(bookings: Booking[]) {
  return groupBookings(bookings).reduce<Record<string, BookingItineraryGroup[]>>((result, group) => {
    if (!group.slotStartsAt) return result;
    (result[calendarDateKey(new Date(group.slotStartsAt))] ??= []).push(group);
    return result;
  }, {});
}

export function getHiddenItineraryGroupCount(groups: BookingItineraryGroup[], visibleLimit = CALENDAR_VISIBLE_BOOKINGS) {
  return Math.max(0, groups.length - visibleLimit);
}

export function countItineraryGroupsInMonth(bookings: Booking[], monthStart: Date) {
  const monthKey = calendarDateKey(monthStart).slice(0, 7);
  return groupBookings(bookings).filter((group) => {
    if (!group.slotStartsAt) return false;
    return calendarDateKey(new Date(group.slotStartsAt)).slice(0, 7) === monthKey;
  }).length;
}

export function formatCalendarDate(date: Date) {
  return date.toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

export function formatBookingTime(value?: string) {
  return value ? new Date(value).toLocaleTimeString("en-MY", { hour: "numeric", minute: "2-digit" }) : "Time pending";
}

export function formatBookingDate(value?: string) {
  return value ? new Date(value).toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "short", year: "numeric" }) : "Date to be confirmed";
}
