import type { Booking } from "@/backend/core/types";

export const CALENDAR_VISIBLE_BOOKINGS = 3;

export function calendarDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
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
  return bookings.filter((booking) => {
    if (!booking.slotStartsAt) return false;
    const date = new Date(booking.slotStartsAt);
    return date.getMonth() === monthStart.getMonth() && date.getFullYear() === monthStart.getFullYear();
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
