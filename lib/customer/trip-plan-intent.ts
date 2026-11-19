import { getTripDayDates } from "@/lib/customer/trip-planner";

export type TripPlanCategory = "food" | "activity" | "accommodation" | "retail" | null;

export interface TripPlanIntent {
  directAdd: boolean;
  targetDate: string | null;
  requestedCount: number;
  requestedDay: number | null;
  categorySlug: TripPlanCategory;
  groups: Array<{ categorySlug: Exclude<TripPlanCategory, null>; requestedCount: number }>;
  requestedTotal: number;
  limitExceeded: boolean;
  needsDay: boolean;
  invalidDay: boolean;
  needsCategory: boolean;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1, first: 1, satu: 1, pertama: 1, 一: 1,
  two: 2, second: 2, dua: 2, kedua: 2, 二: 2,
  three: 3, third: 3, tiga: 3, ketiga: 3, 三: 3,
  four: 4, fourth: 4, empat: 4, keempat: 4, 四: 4,
  five: 5, fifth: 5, lima: 5, kelima: 5, 五: 5,
  six: 6, sixth: 6, enam: 6, keenam: 6, 六: 6,
  seven: 7, seventh: 7, tujuh: 7, ketujuh: 7, 七: 7,
  eight: 8, eighth: 8, lapan: 8, kelapan: 8, 八: 8,
  nine: 9, ninth: 9, sembilan: 9, kesembilan: 9, 九: 9,
  ten: 10, tenth: 10, sepuluh: 10, kesepuluh: 10, 十: 10,
  两: 2, 两个: 2,
};

function parseNumber(value: string): number | null {
  const normalized = value.toLocaleLowerCase();
  const numeric = Number(normalized);
  if (Number.isInteger(numeric) && numeric > 0) return numeric;
  return NUMBER_WORDS[normalized] ?? null;
}

function parseRequestedCount(preference: string): number | null {
  const number = "(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|satu|dua|tiga|empat|lima|enam|tujuh|lapan|sembilan|sepuluh|[一二两三四五六七八九十])";
  const countPattern = new RegExp(`${number}\\s*(?:个|家|间|places?|spots?|venues?|restaurants?|eateries|tempat|lokasi)|${number}\\s+(?:food|makan|美食)?\\s*(?:places?\\s+to\\s+eat|places?|spots?|venues?|restaurants?|eateries|tempat makan)`, "giu");
  for (const match of preference.matchAll(countPattern)) {
    const count = parseNumber(match[1] ?? match[2]);
    if (count !== null) return count;
  }
  return null;
}

const CATEGORY_PATTERNS: Array<{ categorySlug: Exclude<TripPlanCategory, null>; pattern: RegExp }> = [
  { categorySlug: "food", pattern: /(?:food|makanan|makan|kuliner|restaurant|restaurants|dining|eat|eating|eateries|美食|食物|吃|餐)/iu },
  { categorySlug: "activity", pattern: /(?:activity|activities|attraction|attractions|aktiviti|aktivitas|活动|景点)/iu },
  { categorySlug: "accommodation", pattern: /(?:accommodation|hotel|stay|penginapan|住宿|酒店)/iu },
  { categorySlug: "retail", pattern: /(?:retail|shopping|shop|kedai|souvenir|零售|购物|纪念品)/iu },
];

function parseGroupCount(preference: string, pattern: RegExp): number | null {
  const categoryIndex = preference.search(pattern);
  if (categoryIndex < 0) return null;
  const beforeCategory = preference.slice(Math.max(0, categoryIndex - 28), categoryIndex);
  const match = [...beforeCategory.matchAll(/(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|several|some|few|beberapa|satu|dua|tiga|empat|lima|enam|tujuh|lapan|sembilan|sepuluh|[一二两三四五六七八九十]+|几|幾)\s*(?:个|家|间|處|处|places?|spots?|venues?|restaurants?|eateries|tempat|lokasi)?/giu)].at(-1)?.[1];
  if (!match) return null;
  if (match === "几" || match === "幾") return 2;
  if (["several", "some", "few", "beberapa"].includes(match.toLocaleLowerCase())) return 2;
  return parseNumber(match);
}

function parseRequestedGroups(preference: string) {
  const found: Array<{ categorySlug: Exclude<TripPlanCategory, null>; requestedCount: number; index: number }> = [];
  for (const { categorySlug, pattern } of CATEGORY_PATTERNS) {
    const match = preference.match(pattern);
    if (!match || match.index === undefined) continue;
    const count = parseGroupCount(preference, pattern);
    if (count !== null) found.push({ categorySlug, requestedCount: count, index: match.index });
  }
  return found.sort((a, b) => a.index - b.index).map(({ categorySlug, requestedCount }) => ({ categorySlug, requestedCount }));
}

function parseRequestedDay(preference: string): number | null {
  const chinese = preference.match(/第\s*(\d+|[一二两三四五六七八九十])\s*天/u)?.[1];
  if (chinese) return parseNumber(chinese);

  const dayNumber = "(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|satu|dua|tiga|empat|lima|enam|tujuh|lapan|sembilan|sepuluh|pertama|kedua|ketiga|keempat|kelima|keenam|ketujuh|kelapan|kesembilan|kesepuluh)";
  const englishOrMalay = preference.match(new RegExp(`\\b(?:day|hari)\\s*${dayNumber}\\b`, "iu"))?.[1]
    ?? preference.match(new RegExp(`\\b${dayNumber}\\s+(?:day|hari)\\b`, "iu"))?.[1];
  return englishOrMalay ? parseNumber(englishOrMalay) : null;
}

function parseCategory(preference: string): TripPlanCategory {
  if (/\b(food|makanan|makan|kuliner|restaurant|restaurants|dining|eat|eating|eateries)\b|美食|吃|餐/iu.test(preference)) return "food";
  if (/\b(activity|activities|attraction|attractions|aktiviti|aktivitas)\b|活动|景点/iu.test(preference)) return "activity";
  if (/\b(accommodation|hotel|stay|penginapan)\b|住宿|酒店/iu.test(preference)) return "accommodation";
  if (/\b(retail|shopping|shop|kedai|souvenir)\b|零售|购物|纪念品/iu.test(preference)) return "retail";
  return null;
}

function hasExplicitAddIntent(preference: string): boolean {
  return /安排|加入|添加|放进|放入|加进|\b(add|put|include|plan|arrange|schedule|tambah|masukkan|atur|susun)\b/iu.test(preference);
}

export function parseTripPlanIntent(
  preference: string,
  trip: { start_date: string | null; end_date: string | null },
  selectedDate: string | null,
): TripPlanIntent {
  const dates = getTripDayDates(trip);
  const requestedDay = parseRequestedDay(preference);
  const explicitCount = parseRequestedCount(preference);
  const categorySlug = parseCategory(preference);
  const explicitAdd = hasExplicitAddIntent(preference);
  const requestedGroups = explicitAdd ? parseRequestedGroups(preference) : [];
  const groups = requestedGroups.length > 0
    ? requestedGroups
    : explicitCount !== null && categorySlug
      ? [{ categorySlug, requestedCount: explicitCount }]
      : [];
  const requestedTotal = groups.reduce((sum, group) => sum + group.requestedCount, 0);
  const directAdd = explicitAdd && groups.length > 0;
  const targetDate = requestedDay !== null
    ? dates[requestedDay - 1] ?? null
    : selectedDate && dates.includes(selectedDate) ? selectedDate : null;

  return {
    directAdd,
    targetDate,
    requestedCount: Math.max(1, Math.min(10, explicitCount ?? 5)),
    requestedDay,
    categorySlug: groups.length === 1 ? groups[0].categorySlug : categorySlug,
    groups,
    requestedTotal,
    limitExceeded: directAdd && requestedTotal > 10,
    needsDay: directAdd && !targetDate,
    invalidDay: directAdd && requestedDay !== null && !targetDate,
    needsCategory: explicitAdd && groups.length === 0,
  };
}
