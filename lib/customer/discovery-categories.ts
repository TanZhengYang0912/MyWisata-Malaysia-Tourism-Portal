/**
 * Canonical customer discovery taxonomy.
 *
 * The four real slugs map to rows in `categories`. Hidden Gem is intentionally
 * a collection backed by `products.is_hidden_gem`, so it must not be passed to
 * a category-id selector or category detail page.
 */
export const REAL_CATEGORY_SLUGS = ["food", "activity", "accommodation", "retail"] as const;
export type RealCategorySlug = (typeof REAL_CATEGORY_SLUGS)[number];

export const DISCOVERY_CATEGORIES = [
  { slug: "food", label: "Food", labelKey: "categories.food", icon: "utensils", kind: "category" },
  { slug: "activity", label: "Activity", labelKey: "categories.activity", icon: "compass", kind: "category" },
  { slug: "accommodation", label: "Accommodation", labelKey: "categories.accommodation", icon: "bed-double", kind: "category" },
  { slug: "retail", label: "Retail", labelKey: "categories.retail", icon: "shopping-bag", kind: "category" },
  { slug: "hidden_gem", label: "Hidden Gem", labelKey: "categories.hiddenGem", icon: "gem", kind: "collection" },
] as const;

export type DiscoveryCategorySlug = (typeof DISCOVERY_CATEGORIES)[number]["slug"];

export type CategoryRecord = { id: string; name: string; slug: string | null };
export type CanonicalCategoryOption = { id: string; name: string; slug: RealCategorySlug };

/** Legacy category rows kept only so existing records can be read safely. */
const LEGACY_CATEGORY_MAP: Record<string, RealCategorySlug> = {
  food: "food",
  nature: "activity",
  cultural: "activity",
  adventure: "activity",
  nightlife: "activity",
  wellness: "activity",
  family: "activity",
  shopping: "retail",
  accommodation: "accommodation",
  activity: "activity",
  retail: "retail",
};

export function canonicalCategorySlug(slug: string | null | undefined): RealCategorySlug | null {
  if (!slug) return null;
  return LEGACY_CATEGORY_MAP[slug.trim().toLowerCase()] ?? null;
}

export function getDiscoveryCategoryLabel(slug: string | null | undefined): string {
  const canonical = canonicalCategorySlug(slug);
  return DISCOVERY_CATEGORIES.find((category) => category.slug === canonical)?.label ?? "Activity";
}

export function getDiscoveryCategoryLabelKey(slug: string | null | undefined): string {
  return getOptionalDiscoveryCategoryLabelKey(slug) ?? "categories.activity";
}

/** Returns a translation key only for known system categories. Unknown database values remain user-authored content. */
export function getOptionalDiscoveryCategoryLabelKey(slug: string | null | undefined): string | null {
  const normalized = slug?.trim().toLowerCase();
  if (normalized === "hidden_gem") return "categories.hiddenGem";
  const canonical = canonicalCategorySlug(normalized);
  return DISCOVERY_CATEGORIES.find((category) => category.slug === canonical)?.labelKey ?? null;
}

export function isRealCategorySlug(slug: string | null | undefined): slug is RealCategorySlug {
  return canonicalCategorySlug(slug) !== null;
}

export function getDiscoverySearchFilter(slug: string | null | undefined):
  { categorySlug?: RealCategorySlug; hiddenGemOnly?: boolean } {
  if (slug === "hidden_gem") return { hiddenGemOnly: true };
  const categorySlug = canonicalCategorySlug(slug);
  return categorySlug ? { categorySlug } : {};
}

/**
 * Turns active database rows (including legacy rows during a rollout) into
 * one selectable option per canonical real category.
 */
export function normalizeCategoryRows(rows: CategoryRecord[]): CanonicalCategoryOption[] {
  const bySlug = new Map<RealCategorySlug, CanonicalCategoryOption>();
  for (const row of rows) {
    const slug = canonicalCategorySlug(row.slug);
    if (!slug || bySlug.has(slug)) continue;
    bySlug.set(slug, { id: row.id, slug, name: getDiscoveryCategoryLabel(slug) });
  }
  return REAL_CATEGORY_SLUGS
    .map((slug) => bySlug.get(slug))
    .filter((category): category is CanonicalCategoryOption => Boolean(category));
}

export function normalizeCategorySlugs(slugs: string[] | null | undefined): RealCategorySlug[] {
  return [...new Set((slugs ?? []).map(canonicalCategorySlug).filter((slug): slug is RealCategorySlug => slug !== null))];
}
