import type { OperatingHourWeekday, OperatingHours, OperatingHoursDay, OperatingHoursPeriod } from "@/backend/core/types";

export const DISPLAY_OPERATING_HOUR_WEEKDAYS: OperatingHourWeekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const WEEKDAY_INDEX = new Map<OperatingHourWeekday, number>(["sun", "mon", "tue", "wed", "thu", "fri", "sat"].map((day, index) => [day as OperatingHourWeekday, index]));
const CLOCK_PATTERN = /^(?:([01]\d|2[0-3]):([0-5]\d)|24:00)$/;

export type OperatingHoursCopy = {
  day?: (day: OperatingHourWeekday) => string;
  closed?: string;
  allDay?: string;
  unavailable?: string;
};

export type OperatingHoursFilterOptions = {
  overnight?: boolean;
};

export function parseClockMinutes(value: string | undefined): number | null {
  if (!value || !CLOCK_PATTERN.test(value)) return null;
  if (value === "24:00") return 1440;
  const [, hour, minute] = value.match(CLOCK_PATTERN) ?? [];
  return hour && minute ? Number(hour) * 60 + Number(minute) : null;
}

export function getOperatingHoursPeriods(day: OperatingHoursDay | null | undefined): OperatingHoursPeriod[] {
  if (!day || day.closed) return [];
  if (day.allDay) return [{ open: "00:00", close: "24:00" }];

  const candidates = Array.isArray(day.periods) && day.periods.length > 0
    ? day.periods
    : [{ open: day.open, close: day.close }];
  return candidates.filter((period) => parseClockMinutes(period.open) !== null && parseClockMinutes(period.close) !== null);
}

function isAllDayPeriod(period: OperatingHoursPeriod): boolean {
  return period.open === "00:00" && period.close === "24:00";
}

function weekdayAt(index: number): OperatingHourWeekday {
  const normalized = ((index % 7) + 7) % 7;
  return ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][normalized] as OperatingHourWeekday;
}

function rangesAroundDay(hours: OperatingHours, day: OperatingHourWeekday) {
  const dayIndex = WEEKDAY_INDEX.get(day) ?? 0;
  return [-1, 0, 1].flatMap((offset) => {
    const sourceDay = weekdayAt(dayIndex + offset);
    return getOperatingHoursPeriods(hours[sourceDay]).flatMap((period) => {
      const open = parseClockMinutes(period.open);
      const close = parseClockMinutes(period.close);
      if (open === null || close === null) return [];
      const start = offset * 1440 + open;
      const end = offset * 1440 + close + (close <= open && !isAllDayPeriod(period) ? 1440 : 0);
      return [{ start, end }];
    });
  });
}

function selectedDays(days: OperatingHourWeekday[]): OperatingHourWeekday[] {
  return days.length > 0 ? days : DISPLAY_OPERATING_HOUR_WEEKDAYS;
}

export function formatOperatingHours(hours: OperatingHours | null | undefined, copy: OperatingHoursCopy = {}): string {
  const unavailable = copy.unavailable || "Hours unavailable";
  if (!hours || typeof hours !== "object") return unavailable;

  const rows = DISPLAY_OPERATING_HOUR_WEEKDAYS.map((day) => {
    const schedule = hours[day];
    if (!schedule) return `${copy.day?.(day) || day}: ${unavailable}`;
    if (schedule.closed) return `${copy.day?.(day) || day}: ${copy.closed || "Closed"}`;
    const periods = getOperatingHoursPeriods(schedule);
    if (periods.length === 0) return `${copy.day?.(day) || day}: ${unavailable}`;
    if (periods.some(isAllDayPeriod)) return `${copy.day?.(day) || day}: ${copy.allDay || "Open 24 hours"}`;
    return `${copy.day?.(day) || day}: ${periods.map((period) => `${period.open}–${period.close}`).join(", ")}`;
  });
  return rows.join(" · ");
}

export function getMalaysiaTodayKey(date: Date = new Date()): OperatingHourWeekday {
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "Asia/Kuala_Lumpur" }).format(date).toLowerCase().slice(0, 3);
  return weekday === "sun" || weekday === "mon" || weekday === "tue" || weekday === "wed" || weekday === "thu" || weekday === "fri" || weekday === "sat"
    ? weekday
    : "mon";
}

function getMalaysiaTime(date: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kuala_Lumpur" }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function isOperatingHoursMinuteAvailable(point: number, hours: OperatingHours | null | undefined, days: OperatingHourWeekday[] = []): boolean {
  if (!hours) return false;
  return selectedDays(days).some((day) => rangesAroundDay(hours, day).some((range) => point >= range.start && point < range.end));
}

export function isOperatingHoursAtAvailable(time: string, hours: OperatingHours | null | undefined, days: OperatingHourWeekday[] = []): boolean {
  const point = parseClockMinutes(time);
  if (point === null || !hours) return false;
  return isOperatingHoursMinuteAvailable(point, hours, days);
}

export function isOperatingHoursWindowAvailable(
  timeFrom: string,
  timeTo: string,
  hours: OperatingHours | null | undefined,
  days: OperatingHourWeekday[] = [],
  options: OperatingHoursFilterOptions = {},
): boolean {
  const from = parseClockMinutes(timeFrom);
  const to = parseClockMinutes(timeTo);
  if (from === null || to === null || !hours || from === to) return false;
  if (to < from && !options.overnight) return false;
  const end = to < from ? to + 1440 : to;
  return selectedDays(days).some((day) => rangesAroundDay(hours, day).some((range) => from >= range.start && end <= range.end));
}

export function isOperatingHoursOpenNow(hours: OperatingHours | null | undefined, date: Date = new Date()): boolean {
  return isOperatingHoursMinuteAvailable(getMalaysiaTime(date), hours, [getMalaysiaTodayKey(date)]);
}

export type OutletContentHoursCopy = {
  scheduleUnavailable?: string;
  closed?: string;
  allDay?: string;
  day?: (day: string) => string;
};

export function formatHours(hours: unknown, copy: OutletContentHoursCopy = {}): string {
  return formatOperatingHours(hours as OperatingHours | null, {
    unavailable: copy.scheduleUnavailable || "Check the outlet schedule before booking.",
    closed: copy.closed || "Closed",
    allDay: copy.allDay || "Open 24 hours",
    day: (day) => copy.day?.(day) || day.slice(0, 3).toUpperCase(),
  });
}
