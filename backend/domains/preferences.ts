// §11.1 preference vocabulary — the single source of truth shared by the
// Preferences UI (app/customer/profile/page.tsx) and the ranking engine
// (backend/domains/recommend.ts). Interest slugs are `categories.slug` values,
// so interest→listing matching is a plain join, no mapping table.

export const INTEREST_OPTIONS = [
  { slug: "food",       label: "Food & Dining" },
  { slug: "nature",     label: "Nature & Hiking" },
  { slug: "cultural",   label: "Cultural & Heritage" },
  { slug: "adventure",  label: "Adventure Sports" },
  { slug: "nightlife",  label: "Nightlife" },
  { slug: "wellness",   label: "Wellness & Spa" },
  { slug: "shopping",   label: "Shopping" },
  { slug: "family",     label: "Family Friendly" },
] as const;

export type InterestSlug = (typeof INTEREST_OPTIONS)[number]["slug"];
export const INTEREST_SLUGS = INTEREST_OPTIONS.map((o) => o.slug) as InterestSlug[];

export const TRAVEL_STYLES = [
  { value: "budget_backpacker", label: "Budget Backpacker" },
  { value: "mid_range",         label: "Mid-Range Explorer" },
  { value: "luxury",            label: "Luxury Traveller" },
  { value: "business",          label: "Business Traveller" },
  { value: "family_group",      label: "Family Group" },
] as const;

export const GROUP_COMPOSITIONS = [
  { value: "solo",    label: "Solo" },
  { value: "couple",  label: "Couple" },
  { value: "friends", label: "Friends Group" },
  { value: "family",  label: "Family with Kids" },
  { value: "senior",  label: "Senior Group" },
] as const;

export const BUDGET_RANGES = [
  { value: "budget",    label: "Budget (< RM 100/day)" },
  { value: "mid_range", label: "Mid-range (RM 100–500/day)" },
  { value: "luxury",    label: "Luxury (> RM 500/day)" },
] as const;

export const MOBILITY_NEEDS = [
  { value: "none",       label: "No restrictions" },
  { value: "limited",    label: "Limited walking" },
  { value: "wheelchair", label: "Wheelchair access" },
] as const;

// Preferred-distance slider stops → radius in km (Any = no cap).
export const DISTANCE_OPTIONS = [
  { value: 1,   label: "Within 1 km" },
  { value: 5,   label: "Within 5 km" },
  { value: 20,  label: "Within 20 km" },
  { value: 0,   label: "Any distance" },
] as const;

export type TravelStyle = (typeof TRAVEL_STYLES)[number]["value"];
export type BudgetRange = (typeof BUDGET_RANGES)[number]["value"];
export type MobilityNeed = (typeof MOBILITY_NEEDS)[number]["value"];
