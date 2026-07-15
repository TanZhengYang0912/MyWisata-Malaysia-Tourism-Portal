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

export function formatBookingSlotDate(startsAt: string): string {
  return dateLabelFormatter.format(new Date(startsAt));
}

export function formatBookingSlotTime(startsAt: string): string {
  return timeLabelFormatter.format(new Date(startsAt)).toLowerCase();
}

export function groupBookingSlotsByDate(slots: BookingSlot[]): Array<{ key: string; label: string; slots: BookingSlot[] }> {
  const groups = new Map<string, { key: string; label: string; slots: BookingSlot[] }>();

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

export function getBookingDatePreview(
  groups: Array<{ key: string; label: string; slots: BookingSlot[] }>,
  activeKey: string,
  limit = 3,
): Array<{ key: string; label: string; slots: BookingSlot[] }> {
  const preview = groups.slice(0, limit);
  if (!activeKey || preview.some((group) => group.key === activeKey)) return preview;

  const activeGroup = groups.find((group) => group.key === activeKey);
  return activeGroup ? [activeGroup, ...preview.slice(0, Math.max(0, limit - 1))] : preview;
}
