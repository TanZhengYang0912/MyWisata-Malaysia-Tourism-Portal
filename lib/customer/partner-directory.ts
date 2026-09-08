import type {
  ComputedActivity,
  DiscoveryResult,
  SponsoredPlacement,
  VendorSummary,
} from "@/backend/core/types";
import { canonicalCategorySlug } from "@/lib/customer/discovery-categories";
import { rankDiscoveryResults } from "@/lib/customer/discovery-ranking";

export type PartnerView = "all" | "featured";
export type PartnerSort = "featured" | "name" | "outlets";

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
  if (category === "hidden_gem") return Boolean(activity.isHiddenGem);

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
      freeOnly: false,
      bookableOnly: false,
      hiddenGemOnly: category === "hidden_gem",
      familyFriendlyOnly: false,
      coupleFriendlyOnly: false,
    },
    now,
  }).filter((activity) => activity.sponsorship !== null);
}
