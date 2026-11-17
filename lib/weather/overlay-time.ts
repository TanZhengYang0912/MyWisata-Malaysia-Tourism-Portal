export const TRIP_WEATHER_TIME_ZONE = "Asia/Kuala_Lumpur";

function localParts(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { date: `${values.year}-${values.month}-${values.day}`, hour: Number(values.hour) };
}

export function malaysiaDateHour(now: Date) {
  return localParts(now, TRIP_WEATHER_TIME_ZONE);
}

export function formatMalaysiaDateTime(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    timeZone: TRIP_WEATHER_TIME_ZONE,
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function canUseLiveRadar(selectedDate: string | null, now: Date) {
  return selectedDate !== null && malaysiaDateHour(now).date === selectedDate;
}

export function defaultOverlayHour(input: {
  date: string;
  scheduledTimes: Array<string | null>;
  now: Date;
  timeZone?: string;
}) {
  const local = localParts(input.now, input.timeZone ?? TRIP_WEATHER_TIME_ZONE);
  if (local.date === input.date && Number.isInteger(local.hour)) return local.hour;
  const hours = input.scheduledTimes
    .map((time) => time?.match(/^(\d{2}):[0-5]\d/)?.[1])
    .map((hour) => Number(hour))
    .filter((hour) => Number.isInteger(hour) && hour >= 0 && hour <= 23);
  return hours.length > 0 ? Math.min(...hours) : 12;
}
