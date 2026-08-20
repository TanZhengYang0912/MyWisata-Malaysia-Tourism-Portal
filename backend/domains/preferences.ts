// §11.1 preference vocabulary — the single source of truth shared by the
// Preferences UI and the ranking engine. These are the four assignable,
// canonical category slugs. Hidden Gem is an editorial listing flag, not a
// preference category.

import { DISCOVERY_CATEGORIES, REAL_CATEGORY_SLUGS } from "@/lib/customer/discovery-categories";

export const INTEREST_OPTIONS = DISCOVERY_CATEGORIES
  .filter((category): category is (typeof DISCOVERY_CATEGORIES)[number] & { kind: "category" } => category.kind === "category")
  .map(({ slug, label, labelKey }) => ({ slug, label, labelKey })) as ReadonlyArray<{ slug: (typeof REAL_CATEGORY_SLUGS)[number]; label: string; labelKey: string }>;

export type InterestSlug = (typeof REAL_CATEGORY_SLUGS)[number];
export const INTEREST_SLUGS = INTEREST_OPTIONS.map((o) => o.slug) as InterestSlug[];

export const BUDGET_RANGES = [
  { value: "budget",    label: "Budget (< RM 100/day)", labelKey: "preferences.budgetRanges.budget" },
  { value: "mid_range", label: "Mid-range (RM 100–500/day)", labelKey: "preferences.budgetRanges.mid_range" },
  { value: "luxury",    label: "Luxury (> RM 500/day)", labelKey: "preferences.budgetRanges.luxury" },
] as const;

export const MOBILITY_NEEDS = [
  { value: "none",       label: "No restrictions", labelKey: "preferences.mobilityNeeds.none" },
  { value: "limited",    label: "Limited walking", labelKey: "preferences.mobilityNeeds.limited" },
  { value: "wheelchair", label: "Wheelchair access", labelKey: "preferences.mobilityNeeds.wheelchair" },
] as const;

// Preferred-distance slider stops → radius in km (Any = no cap).
export const DISTANCE_OPTIONS = [
  { value: 1,   label: "Within 1 km", labelKey: "preferences.distance.within1Km" },
  { value: 5,   label: "Within 5 km", labelKey: "preferences.distance.within5Km" },
  { value: 20,  label: "Within 20 km", labelKey: "preferences.distance.within20Km" },
  { value: 0,   label: "Any distance", labelKey: "preferences.distance.any" },
] as const;

export type BudgetRange = (typeof BUDGET_RANGES)[number]["value"];
export type MobilityNeed = (typeof MOBILITY_NEEDS)[number]["value"];
