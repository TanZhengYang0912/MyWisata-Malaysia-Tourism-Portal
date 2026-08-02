import type { Booking } from "@/backend/core/types";

export const CALENDAR_VISIBLE_BOOKINGS = 3;
const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";

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

export function groupBookingsByDay(bookings: Booking[]) {
  return bookings.reduce<Record<string, Booking[]>>((result, booking) => {
    if (!booking.slotStartsAt) return result;
    (result[calendarDateKey(new Date(booking.slotStartsAt))] ??= []).push(booking);
    return result;
  }, {});
}

export function getHiddenBookingCount(bookings: Booking[], visibleLimit = CALENDAR_VISIBLE_BOOKINGS) {
  return Math.max(0, bookings.length - visibleLimit);
}

export function countBookingsInMonth(bookings: Booking[], monthStart: Date) {
  const monthKey = calendarDateKey(monthStart).slice(0, 7);
  return bookings.filter((booking) => {
    if (!booking.slotStartsAt) return false;
    return calendarDateKey(new Date(booking.slotStartsAt)).slice(0, 7) === monthKey;
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
