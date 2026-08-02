import type { BookingSlot } from "@/backend/core/types";

const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";

const dateLabelFormatter = new Intl.DateTimeFormat("en-MY", {
  timeZone: MALAYSIA_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const timeLabelFormatter = new Intl.DateTimeFormat("en-MY", {
  timeZone: MALAYSIA_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const calendarDateLabelFormatter = new Intl.DateTimeFormat("en-MY", {
  timeZone: MALAYSIA_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const calendarMonthLabelFormatter = new Intl.DateTimeFormat("en-MY", {
  timeZone: MALAYSIA_TIME_ZONE,
  month: "long",
  year: "numeric",
});

export type BookingDateAvailability = "available" | "full" | "unavailable";

export interface BookingDateGroup {
  key: string;
  label: string;
  slots: BookingSlot[];
}

export interface BookingCalendarDay {
  key: string;
  monthKey: string;
  day: number;
  isCurrentMonth: boolean;
  label: string;
  status: BookingDateAvailability;
  availableSlotCount: number;
  totalSlotCount: number;
}

const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: MALAYSIA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function dateKey(startsAt: string): string {
  const parts = dateKeyFormatter.formatToParts(new Date(startsAt));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isValidDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

function getMonthKeyFromDateKey(key: string): string {
  return key.slice(0, 7);
}

function getDateKeyFromUtcDate(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function getMonthParts(monthKey: string): { year: number; month: number } {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return { year: 1970, month: 1 };
  return { year, month };
}

export function getBookingSlotAvailability(slot: BookingSlot, now = new Date()): BookingDateAvailability {
  if (!isValidDate(slot.startsAt) || new Date(slot.startsAt).getTime() <= now.getTime()) return "unavailable";
  if (slot.status === "expired") return "unavailable";
  if (slot.status === "full" || slot.booked >= slot.capacity) return "full";
  if (slot.status && slot.status !== "available") return "unavailable";
  return "available";
}

export function isBookingSlotAvailable(slot: BookingSlot, now = new Date()): boolean {
  return getBookingSlotAvailability(slot, now) === "available";
}

export function formatBookingSlotDate(startsAt: string): string {
  return dateLabelFormatter.format(new Date(startsAt));
}

export function formatBookingSlotTime(startsAt: string): string {
  return timeLabelFormatter.format(new Date(startsAt)).toLowerCase();
}

export function groupBookingSlotsByDate(slots: BookingSlot[]): BookingDateGroup[] {
  const groups = new Map<string, BookingDateGroup>();

  for (const slot of slots) {
    const key = dateKey(slot.startsAt);
    const group = groups.get(key);
    if (group) {
      group.slots.push(slot);
    } else {
      groups.set(key, { key, label: formatBookingSlotDate(slot.startsAt), slots: [slot] });
    }
  }

  return [...groups.values()];
}

export function groupBookableBookingSlotsByDate(slots: BookingSlot[], now = new Date()): BookingDateGroup[] {
  return groupBookingSlotsByDate(slots.filter((slot) => isBookingSlotAvailable(slot, now)));
}

export function getBookingCalendarDays(slots: BookingSlot[], monthKey: string, now = new Date()): BookingCalendarDay[] {
  const { year, month } = getMonthParts(monthKey);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const firstGridDay = new Date(Date.UTC(year, month - 1, 1 - firstDay.getUTCDay()));
  const groups = new Map(groupBookingSlotsByDate(slots).map((group) => [group.key, group]));

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstGridDay);
    date.setUTCDate(firstGridDay.getUTCDate() + index);
    const key = getDateKeyFromUtcDate(date);
    const group = groups.get(key);
    const dateSlots = group?.slots ?? [];
    const availableSlotCount = dateSlots.filter((slot) => isBookingSlotAvailable(slot, now)).length;
    const futureSlots = dateSlots.filter((slot) => isValidDate(slot.startsAt) && new Date(slot.startsAt).getTime() > now.getTime());
    const status: BookingDateAvailability = availableSlotCount > 0
      ? "available"
      : futureSlots.length > 0 && futureSlots.every((slot) => getBookingSlotAvailability(slot, now) === "full")
        ? "full"
        : "unavailable";

    return {
      key,
      monthKey: getMonthKeyFromDateKey(key),
      day: date.getUTCDate(),
      isCurrentMonth: getMonthKeyFromDateKey(key) === monthKey,
      label: calendarDateLabelFormatter.format(new Date(`${key}T00:00:00+08:00`)),
      status,
      availableSlotCount,
      totalSlotCount: dateSlots.length,
    };
  });
}

export function formatBookingCalendarMonth(monthKey: string): string {
  return calendarMonthLabelFormatter.format(new Date(`${monthKey}-01T00:00:00+08:00`));
}

export function getAdjacentBookingMonth(monthKey: string, offset: number): string {
  const { year, month } = getMonthParts(monthKey);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function getTodayBookingDateKey(now = new Date()): string {
  return dateKey(now.toISOString());
}

export function getBookingDatePreview(
  groups: BookingDateGroup[],
  activeKey: string,
  limit = 3,
): BookingDateGroup[] {
  const preview = groups.slice(0, limit);
  if (!activeKey || preview.some((group) => group.key === activeKey)) return preview;

  const activeGroup = groups.find((group) => group.key === activeKey);
  return activeGroup ? [activeGroup, ...preview.slice(0, Math.max(0, limit - 1))] : preview;
}
