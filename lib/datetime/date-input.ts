const MALAYSIA_TIME_ZONE = "Asia/Kuala_Lumpur";
const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type MalaysiaDateShortcut = "today" | "tomorrow" | "weekend";

function malaysiaDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MALAYSIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: values.year, month: values.month, day: values.day };
}

function malaysiaDateTimeParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MALAYSIA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: values.year, month: values.month, day: values.day, hour: values.hour, minute: values.minute };
}

/** Returns an HTML date input value for the current Malaysia calendar day. */
export function getMalaysiaDateInputValue(now = new Date()) {
  const { year, month, day } = malaysiaDateParts(now);
  return `${year}-${month}-${day}`;
}

/** Returns an HTML datetime-local value representing a Malaysia wall-clock time. */
export function getMalaysiaDateTimeLocalValue(now = new Date()) {
  const { year, month, day, hour, minute } = malaysiaDateTimeParts(now);
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

/** Adds calendar days to an HTML date value without using the browser timezone. */
export function addMalaysiaCalendarDays(value: string, days: number) {
  if (!DATE_INPUT_PATTERN.test(value)) throw new RangeError("Invalid calendar date value");
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) throw new RangeError("Invalid calendar date value");
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Returns common date-exception shortcuts in Malaysia calendar dates. */
export function getMalaysiaDateShortcutDates(shortcut: MalaysiaDateShortcut, now = new Date()) {
  const today = getMalaysiaDateInputValue(now);
  if (shortcut === "today") return [today];
  if (shortcut === "tomorrow") return [addMalaysiaCalendarDays(today, 1)];

  const weekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  if (weekday === 0) return [today];
  const saturdayOffset = weekday === 6 ? 0 : 6 - weekday;
  const saturday = addMalaysiaCalendarDays(today, saturdayOffset);
  return [saturday, addMalaysiaCalendarDays(saturday, 1)];
}

export function getMalaysiaDateRangeDefaults(now = new Date()) {
  const from = getMalaysiaDateInputValue(now);
  return { from, to: addMalaysiaCalendarDays(from, 7) };
}

export function getMalaysiaDateTimeRangeDefaults(now = new Date()) {
  const from = getMalaysiaDateTimeLocalValue(now);
  const to = getMalaysiaDateTimeLocalValue(new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));
  return { from, to };
}
