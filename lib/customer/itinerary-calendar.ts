import type { Booking } from "@/backend/core/types";

export const CALENDAR_VISIBLE_BOOKINGS = 3;
const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";

export type BookingCalendarScope = "upcoming" | "past" | "all";
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

export function getItineraryGroupsOutsideMonth(groups: BookingItineraryGroup[], monthStart: Date) {
  const monthKey = calendarDateKey(monthStart).slice(0, 7);
  return groups.filter((group) => {
    if (!group.slotStartsAt) return true;
    return calendarDateKey(new Date(group.slotStartsAt)).slice(0, 7) !== monthKey;
  });
}

export function getUniqueItineraryActivityNames(bookings: Pick<Booking, "activityName">[]) {
  return [...new Set(bookings.map((booking) => booking.activityName.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

export function sortBookingsForCalendar(bookings: Booking[], scope: BookingCalendarScope, now: number) {
  return bookings
    .map((booking, index) => ({
      booking,
      index,
      startsAt: booking.slotStartsAt ? new Date(booking.slotStartsAt).getTime() : Number.NaN,
    }))
    .sort((a, b) => {
      const aHasDate = Number.isFinite(a.startsAt);
      const bHasDate = Number.isFinite(b.startsAt);
      if (aHasDate !== bHasDate) return aHasDate ? -1 : 1;
      if (!aHasDate || !bHasDate) return a.index - b.index;

      if (scope === "upcoming") return a.startsAt - b.startsAt || a.index - b.index;
      if (scope === "past") return b.startsAt - a.startsAt || a.index - b.index;

      const distanceDifference = Math.abs(a.startsAt - now) - Math.abs(b.startsAt - now);
      if (distanceDifference !== 0) return distanceDifference;
      return b.startsAt - a.startsAt || a.index - b.index;
    })
    .map(({ booking }) => booking);
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
