// §11.1 preference vocabulary — the single source of truth shared by the
// Preferences UI and the ranking engine. These are the four assignable,
// canonical category slugs. Hidden Gem is an editorial listing flag, not a
// preference category.

import { DISCOVERY_CATEGORIES, REAL_CATEGORY_SLUGS } from "@/lib/customer/discovery-categories";

export const INTEREST_OPTIONS = DISCOVERY_CATEGORIES
  .filter((category): category is (typeof DISCOVERY_CATEGORIES)[number] & { kind: "category" } => category.kind === "category")
  .map(({ slug, label }) => ({ slug, label })) as ReadonlyArray<{ slug: (typeof REAL_CATEGORY_SLUGS)[number]; label: string }>;

export type InterestSlug = (typeof REAL_CATEGORY_SLUGS)[number];
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
