import type {
  ComputedActivity,
  DiscoveryResult,
  SponsoredPlacement,
  VendorSummary,
} from "@/backend/core/types";
import { selectEntityGallery, type EntityMediaRow } from "@/lib/customer/entity-media";
import { canonicalCategorySlug } from "@/lib/customer/discovery-categories";
import { rankDiscoveryResults } from "@/lib/customer/discovery-ranking";
import { getActivityDiscoveryMode } from "@/lib/customer/category-details";
import type { DiscoveryQuery } from "@/lib/customer/discovery-query";
import { isOperatingHoursAtAvailable, isOperatingHoursWindowAvailable } from "@/lib/customer/operating-hours";

export type PartnerView = "all" | "featured";
export type PartnerSort = "featured" | "name" | "outlets";

/** The only product fields the partner directory filters read; sent instead of full products. */
export type PartnerActivityFacts = {
  category: string;
  typeSlugs: string[];
  price: number;
  requiresBooking: boolean;
  /** The product's outlet carries the hidden_gem badge. */
  hiddenGem: boolean;
};

export type PartnerFilterFacts = {
  /** Card category labels, in first-seen order (the card shows the first two). */
  categories: string[];
  activityFacts: PartnerActivityFacts[];
};

function activityCategory(activity: Pick<ComputedActivity, "categorySlug" | "category">): string {
  return canonicalCategorySlug(activity.categorySlug) ?? activity.categorySlug ?? activity.category;
}

/**
 * Server-side summary of each vendor's products for the partner directory.
 * Card categories count vendor-mode products only; filter facts cover every
 * product of the vendor. Products without a vendor can never match a vendor
 * and are skipped.
 */
export function buildPartnerFilterFacts(activities: ComputedActivity[]): Map<string, PartnerFilterFacts> {
  const factsByVendor = new Map<string, { categories: Set<string>; activityFacts: PartnerActivityFacts[] }>();
  for (const activity of activities) {
    const vendorId = activity.outlet.vendorId;
    if (!vendorId) continue;
    const facts = factsByVendor.get(vendorId) ?? { categories: new Set<string>(), activityFacts: [] };
    const category = activityCategory(activity);
    const hiddenGem = Boolean(activity.outlet.badgeSlugs?.includes("hidden_gem"));
    if (getActivityDiscoveryMode(activity) === "vendor") {
      facts.categories.add(category);
      if (hiddenGem) facts.categories.add("hidden_gem");
    }
    facts.activityFacts.push({
      category,
      typeSlugs: activity.typeSlugs ?? [],
      price: activity.price,
      requiresBooking: activity.requiresBooking,
      hiddenGem,
    });
    factsByVendor.set(vendorId, facts);
  }
  return new Map([...factsByVendor].map(([vendorId, facts]) => [vendorId, {
    categories: [...facts.categories],
    activityFacts: facts.activityFacts,
  }]));
}

type FilterablePartner = Pick<VendorSummary, "name" | "outlets"> & PartnerFilterFacts;

/** Whether a directory vendor matches the visitor's discovery filters. */
export function matchesPartnerFilters(vendor: FilterablePartner, filters: DiscoveryQuery): boolean {
  const normalizedQuery = filters.q.trim().toLowerCase();
  const matchesQuery = !normalizedQuery || `${vendor.name} ${vendor.outlets.map((outlet) => `${outlet.city} ${outlet.state}`).join(" ")}`.toLowerCase().includes(normalizedQuery);
  const hasTimeFilter = filters.openNow ||
    (filters.hoursMode === "at" && Boolean(filters.timeAt)) ||
    (filters.hoursMode !== "at" && Boolean(filters.timeFrom && filters.timeTo));
  const hasStateFilter = Boolean(filters.state && filters.state !== "All Malaysia");
  const matchesOutlets = (!hasStateFilter && !hasTimeFilter) || vendor.outlets.some((outlet) => {
    const matchesState = !hasStateFilter || outlet.state === filters.state;
    const hours = outlet.operatingHours ?? null;
    const matchesOpenNow = !filters.openNow || outlet.currentlyOpen === true;
    const matchesTime = filters.hoursMode === "at" && filters.timeAt
      ? Boolean(hours && isOperatingHoursAtAvailable(filters.timeAt, hours, filters.operatingDays))
      : filters.hoursMode !== "at" && filters.timeFrom && filters.timeTo
        ? Boolean(hours && isOperatingHoursWindowAvailable(filters.timeFrom, filters.timeTo, hours, filters.operatingDays, { overnight: filters.overnight }))
        : true;
    return matchesState && matchesOpenNow && matchesTime;
  });
  const category = filters.categories.length === 1 ? filters.categories[0] : filters.hiddenGemOnly ? "hidden_gem" : null;
  const matchesCategory = !category || (category === "hidden_gem"
    ? vendor.outlets.some((outlet) => outlet.badgeSlugs?.includes("hidden_gem"))
    : vendor.categories.includes(category));
  const selectedBadgeSlugs = [
    filters.hiddenGemOnly && "hidden_gem",
    filters.familyFriendlyOnly && "family_friendly",
    filters.coupleFriendlyOnly && "couple_friendly",
  ].filter(Boolean) as string[];
  const matchesOutletBadges = selectedBadgeSlugs.length === 0 || vendor.outlets.some((outlet) =>
    selectedBadgeSlugs.some((slug) => outlet.badgeSlugs?.includes(slug)),
  );
  const hasActivityFilters = filters.categories.length > 0 || filters.types.length > 0 || filters.priceMax !== null ||
    filters.freeOnly || filters.bookableOnly;
  const matchesActivities = !hasActivityFilters || vendor.activityFacts.some((activity) => {
    const matchesTypes = filters.types.length === 0 || filters.types.some((token) => {
      const [selectedCategory, selectedType] = token.split(":", 2);
      return selectedCategory === activity.category && Boolean(selectedType && activity.typeSlugs.includes(selectedType));
    });
    const matchesCategoryBranch = filters.categories.length === 0 || filters.categories.includes(activity.category) ||
      (filters.categories.includes("hidden_gem") && activity.hiddenGem);
    const matchesPrice = filters.priceMax === null || activity.price <= filters.priceMax;
    const matchesCommerce = (!filters.freeOnly || activity.price === 0) && (!filters.bookableOnly || activity.requiresBooking);
    return matchesCategoryBranch && matchesTypes && matchesPrice && matchesCommerce;
  });
  return matchesQuery && matchesOutlets && matchesCategory && matchesActivities && matchesOutletBadges;
}

export function attachSponsoredOutletGalleryCovers(
  activities: ComputedActivity[],
  sponsoredProductIds: ReadonlySet<string>,
  mediaRows: ({ outletId: string } & EntityMediaRow)[],
): ComputedActivity[] {
  const mediaByOutlet = new Map<string, EntityMediaRow[]>();
  for (const { outletId, ...media } of mediaRows) {
    const outletMedia = mediaByOutlet.get(outletId) ?? [];
    outletMedia.push(media);
    mediaByOutlet.set(outletId, outletMedia);
  }

  return activities.map((activity) => {
    if (!sponsoredProductIds.has(activity.id)) return activity;

    const coverUrl = selectEntityGallery(mediaByOutlet.get(activity.outlet.id) ?? [], 1)[0]?.url;
    return coverUrl ? { ...activity, outlet: { ...activity.outlet, coverUrl } } : activity;
  });
}

type RankablePartner = Pick<VendorSummary, "id" | "name" | "outlets">;

export function rankPartnerDirectory<T extends RankablePartner>({
  vendors,
  featuredVendorIds,
  view,
  sort,
}: {
  vendors: T[];
  featuredVendorIds: ReadonlySet<string>;
  view: PartnerView;
  sort: PartnerSort;
}): T[] {
  const visibleVendors = view === "featured"
    ? vendors.filter((vendor) => featuredVendorIds.has(vendor.id))
    : [...vendors];

  return visibleVendors.sort((left, right) => {
    if (sort === "featured") {
      const featuredOrder = Number(featuredVendorIds.has(right.id)) - Number(featuredVendorIds.has(left.id));
      if (featuredOrder !== 0) return featuredOrder;
    }

    if (sort === "outlets") {
      const outletOrder = right.outlets.length - left.outlets.length;
      if (outletOrder !== 0) return outletOrder;
    }

    return left.name.localeCompare(right.name);
  });
}

function includesQuery(activity: ComputedActivity, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;

  return [
    activity.name,
    activity.description,
    activity.outlet.vendorName,
    activity.outlet.name,
    activity.outlet.city,
    activity.outlet.state,
  ].some((value) => value?.toLowerCase().includes(normalizedQuery));
}

function matchesState(activity: ComputedActivity, state: string | null): boolean {
  const normalizedState = state?.trim().toLowerCase() ?? "";
  return !normalizedState || activity.outlet.state.trim().toLowerCase() === normalizedState;
}

function matchesCategory(activity: ComputedActivity, category: string | null): boolean {
  if (!category) return true;
  if (category === "hidden_gem") return Boolean(activity.outlet.badgeSlugs?.includes("hidden_gem"));

  const selectedCategory = canonicalCategorySlug(category);
  return selectedCategory !== null && canonicalCategorySlug(activity.categorySlug) === selectedCategory;
}

export function selectPartnerAdvertisements({
  activities,
  placements,
  query,
  state,
  category,
  now,
}: {
  activities: ComputedActivity[];
  placements: SponsoredPlacement[];
  query: string;
  state: string | null;
  category: string | null;
  now: string;
}): DiscoveryResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  const matchingActivities = activities.filter((activity) => (
    includesQuery(activity, normalizedQuery)
    && matchesState(activity, state)
    && matchesCategory(activity, category)
  ));

  return rankDiscoveryResults({
    activities: matchingActivities,
    placements,
    filters: {
      q: normalizedQuery,
      state,
      categories: category ? [category] : [],
      types: [],
      priceMax: null,
      operatingDays: [],
      hoursMode: "during",
      timeAt: null,
      timeFrom: null,
      timeTo: null,
      overnight: false,
      openNow: false,
      freeOnly: false,
      bookableOnly: false,
      hiddenGemOnly: category === "hidden_gem",
      familyFriendlyOnly: false,
      coupleFriendlyOnly: false,
    },
    now,
  }).filter((activity) => activity.sponsorship !== null);
}
