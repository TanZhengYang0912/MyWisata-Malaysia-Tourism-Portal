import type { OperatingHourWeekday } from "@/backend/core/types";

export type DiscoveryHoursMode = "any" | "at" | "during";

export type DiscoveryQuery = {
  q: string;
  state: string | null;
  categories: string[];
  /** `${categorySlug}:${typeSlug}` keeps multi-category type selections unambiguous. */
  types: string[];
  priceMax: number | null;
  operatingDays: OperatingHourWeekday[];
  hoursMode: DiscoveryHoursMode;
  timeAt: string | null;
  timeFrom: string | null;
  timeTo: string | null;
  overnight: boolean;
  openNow: boolean;
  freeOnly: boolean;
  bookableOnly: boolean;
  hiddenGemOnly: boolean;
  familyFriendlyOnly: boolean;
  coupleFriendlyOnly: boolean;
};

const PRICE_MAX = 10_000;

function readTrimmed(params: URLSearchParams, key: string): string | null {
  const value = params.get(key)?.trim() ?? "";
  return value || null;
}

function readTrimmedValues(params: URLSearchParams, key: string): string[] {
  const values: string[] = [];
  const seen = new Set<string>();
  for (const raw of params.getAll(key)) {
    const value = raw.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    values.push(value);
  }
  return values;
}

function readPriceMax(params: URLSearchParams): number | null {
  const raw = params.get("priceMax")?.trim() ?? "";
  if (!raw) return null;

  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= PRICE_MAX ? value : null;
}

function readTime(params: URLSearchParams, key: "timeAt" | "timeFrom" | "timeTo"): string | null {
  const value = params.get(key)?.trim() ?? "";
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

function readWeekdays(params: URLSearchParams): OperatingHourWeekday[] {
  const allowed = new Set<OperatingHourWeekday>(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
  return readTrimmedValues(params, "hoursDay").filter((value): value is OperatingHourWeekday => allowed.has(value as OperatingHourWeekday));
}

function readHoursMode(params: URLSearchParams): DiscoveryHoursMode {
  const mode = params.get("hoursMode");
  return mode === "any" || mode === "at" || mode === "during" ? mode : "during";
}

export function parseDiscoveryQuery(params: URLSearchParams): DiscoveryQuery {
  return {
    q: readTrimmed(params, "q") ?? "",
    state: readTrimmed(params, "state"),
    categories: readTrimmedValues(params, "category"),
    types: readTrimmedValues(params, "type"),
    priceMax: readPriceMax(params),
    operatingDays: readWeekdays(params),
    hoursMode: readHoursMode(params),
    timeAt: readTime(params, "timeAt"),
    timeFrom: readTime(params, "timeFrom"),
    timeTo: readTime(params, "timeTo"),
    overnight: params.get("overnight") === "1",
    openNow: params.get("openNow") === "1",
    freeOnly: params.get("free") === "1",
    bookableOnly: params.get("bookable") === "1",
    hiddenGemOnly: params.get("hiddenGem") === "1",
    familyFriendlyOnly: params.get("family") === "1",
    coupleFriendlyOnly: params.get("couple") === "1",
  };
}

export function serializeDiscoveryQuery(query: DiscoveryQuery): URLSearchParams {
  const params = new URLSearchParams();
  const q = query.q.trim();
  const state = query.state?.trim() ?? "";

  if (q) params.set("q", q);
  if (state) params.set("state", state);
  for (const category of uniqueTrimmed(query.categories)) params.append("category", category);
  for (const type of uniqueTrimmed(query.types)) params.append("type", type);
  if (query.priceMax !== null && Number.isFinite(query.priceMax) && query.priceMax >= 0 && query.priceMax <= PRICE_MAX) {
    params.set("priceMax", String(query.priceMax));
  }
  for (const day of uniqueTrimmed(query.operatingDays)) params.append("hoursDay", day);
  if (query.hoursMode !== "during") params.set("hoursMode", query.hoursMode);
  if (query.timeAt) params.set("timeAt", query.timeAt);
  if (query.timeFrom) params.set("timeFrom", query.timeFrom);
  if (query.timeTo) params.set("timeTo", query.timeTo);
  if (query.overnight) params.set("overnight", "1");
  if (query.openNow) params.set("openNow", "1");
  if (query.freeOnly) params.set("free", "1");
  if (query.bookableOnly) params.set("bookable", "1");
  if (query.hiddenGemOnly) params.set("hiddenGem", "1");
  if (query.familyFriendlyOnly) params.set("family", "1");
  if (query.coupleFriendlyOnly) params.set("couple", "1");

  return params;
}

function uniqueTrimmed(values: string[]): string[] {
  const seen = new Set<string>();
  return values.reduce<string[]>((result, raw) => {
    const value = raw.trim();
    if (!value || seen.has(value)) return result;
    seen.add(value);
    result.push(value);
    return result;
  }, []);
}
