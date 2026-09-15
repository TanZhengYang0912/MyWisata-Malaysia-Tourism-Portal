import { redactPII } from "@/lib/chatbot/pii";
import type { AppLocale } from "@/lib/i18n/locale";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DEFAULT_TRIP_NAME_PATTERN = /^Trip ([1-9]\d*)$/i;
const MAX_SUGGESTION_LENGTH = 60;
const UNSAFE_TEXT_PATTERN = /[<>\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
const HAN_SCRIPT_PATTERN = /\p{Script=Han}/u;

export type TripDuration = { days: number; nights: number };

function calendarTimestamp(value: string) {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) throw new RangeError("Invalid trip date");

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const date = new Date(timestamp);
  if (
    date.getUTCFullYear() !== year
    || date.getUTCMonth() !== month - 1
    || date.getUTCDate() !== day
  ) {
    throw new RangeError("Invalid trip date");
  }
  return timestamp;
}

function cleanPlainText(value: string, maxLength = MAX_SUGGESTION_LENGTH) {
  return redactPII(value).clean
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/[\u202a-\u202e\u2066-\u2069]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength)
    .trim();
}

function claimedDurations(value: string) {
  const claims: TripDuration[] = [];
  const patterns = [
    /(\d+)\s*d\s*(\d+)\s*n/gi,
    /(\d+)\s*days?\s*(?:and|\/|,|-)?\s*(\d+)\s*nights?/gi,
    /(\d+)\s*天\s*(\d+)\s*夜/g,
    /(\d+)\s*hari\s*(?:dan|\/|,|-)?\s*(\d+)\s*malam/gi,
  ];

  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      claims.push({ days: Number(match[1]), nights: Number(match[2]) });
    }
  }
  return claims;
}

function isGroundedDuration(value: string, duration: TripDuration) {
  return claimedDurations(value).every((claim) => (
    claim.days === duration.days && claim.nights === duration.nights
  ));
}

export function highestDefaultTripNumber(trips: Array<{ name: unknown }>) {
  return trips.reduce((current, trip) => {
    if (typeof trip.name !== "string") return current;
    const match = DEFAULT_TRIP_NAME_PATTERN.exec(trip.name.trim());
    const suffix = match ? Number(match[1]) : 0;
    if (!Number.isSafeInteger(suffix) || suffix >= Number.MAX_SAFE_INTEGER) return current;
    return Math.max(current, suffix);
  }, 0);
}

export function nextDefaultTripName(trips: Array<{ name: unknown }>, issuedThrough = 0) {
  const safeIssuedThrough = Number.isSafeInteger(issuedThrough) && issuedThrough >= 0
    ? issuedThrough
    : 0;
  const highest = Math.max(safeIssuedThrough, highestDefaultTripNumber(trips));
  return `Trip ${highest + 1}`;
}

export function isMeaningfulTripIdea(value: string, defaultName: string) {
  const idea = value.trim();
  return idea.length >= 2
    && idea.toLocaleLowerCase() !== defaultName.trim().toLocaleLowerCase()
    && !DEFAULT_TRIP_NAME_PATTERN.test(idea);
}

export function parseSubmittedTripName(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new RangeError("Trip name must be text");
  const name = value.trim();
  if (!name) return null;
  if (name.length > MAX_SUGGESTION_LENGTH || UNSAFE_TEXT_PATTERN.test(name)) {
    throw new RangeError("Trip name is invalid");
  }
  return name;
}

export function parseSubmittedTripDates(startValue: unknown, endValue: unknown) {
  if (startValue !== null && startValue !== undefined && typeof startValue !== "string") {
    throw new RangeError("Trip start date must be text");
  }
  if (endValue !== null && endValue !== undefined && typeof endValue !== "string") {
    throw new RangeError("Trip end date must be text");
  }

  const startDate = typeof startValue === "string" ? startValue.trim() : "";
  const endDate = typeof endValue === "string" ? endValue.trim() : "";
  if (!startDate && !endDate) return { startDate: undefined, endDate: undefined };
  if (!startDate || !endDate) throw new RangeError("Trip date range must be complete");
  tripDuration(startDate, endDate);
  return { startDate, endDate };
}

export function tripDuration(startDate: string, endDate: string): TripDuration {
  const start = calendarTimestamp(startDate);
  const end = calendarTimestamp(endDate);
  if (end < start) throw new RangeError("Trip end date must not be before its start date");

  const days = Math.floor((end - start) / 86_400_000) + 1;
  return { days, nights: Math.max(days - 1, 0) };
}

export function parseTripNameSuggestions(raw: string, duration: TripDuration, locale: AppLocale = "en") {
  const json = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? raw;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }

  if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as { suggestions?: unknown }).suggestions)) {
    return [];
  }

  const result: string[] = [];
  const normalized = new Set<string>();
  for (const candidate of (parsed as { suggestions: unknown[] }).suggestions) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed || trimmed.length > MAX_SUGGESTION_LENGTH || UNSAFE_TEXT_PATTERN.test(trimmed)) continue;
    if (redactPII(trimmed).found) continue;
    if (!isGroundedDuration(trimmed, duration)) continue;
    if (locale === "zh-CN" && !HAN_SCRIPT_PATTERN.test(trimmed)) continue;
    const key = trimmed.toLocaleLowerCase();
    if (normalized.has(key)) continue;
    normalized.add(key);
    result.push(trimmed);
    if (result.length === 3) break;
  }
  return result;
}

export function fallbackTripNameSuggestions(
  idea: string,
  duration: TripDuration,
  locale: AppLocale = "en",
) {
  const defaultBase = locale === "zh-CN" ? "行程" : locale === "ms" ? "Perjalanan" : "Trip";
  const base = cleanPlainText(idea, 42) || defaultBase;

  if (locale === "zh-CN") {
    return [
      `${base} ${duration.days}天${duration.nights}夜`,
      `漫游${base}`,
      `${base}探索之旅`,
    ].map((name) => cleanPlainText(name));
  }

  if (locale === "ms") {
    return [
      `${base} ${duration.days} Hari ${duration.nights} Malam`,
      `Percutian ${base}`,
      `Terokai ${base}`,
    ].map((name) => cleanPlainText(name));
  }

  return [
    `${base} ${duration.days}D${duration.nights}N`,
    `${base} Escape`,
    `${base} Getaway`,
  ].map((name) => cleanPlainText(name));
}
