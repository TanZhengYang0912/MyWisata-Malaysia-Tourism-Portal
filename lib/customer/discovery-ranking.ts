import type {
  ComputedActivity,
  DiscoveryPropertySummary,
  DiscoveryResult,
  SponsoredPlacement,
} from "@/backend/core/types";
import { parseDiscoveryQuery, type DiscoveryQuery } from "@/lib/customer/discovery-query";
import { isMerchantFeatured, orderProductCatalogue } from "@/lib/customer/product-catalogue";
import {
  compareEligibleSponsoredPlacements,
  getSponsoredSpecificity,
} from "@/lib/sponsored-placements/targeting";

const MAX_SPONSORED_RESULTS = 4;

function matchesScope(placement: SponsoredPlacement, filters: DiscoveryQuery): boolean {
  return getSponsoredSpecificity(placement, {
    state: filters.state,
    categorySlugs: filters.categories,
  }) !== null;
}

function isEffective(placement: SponsoredPlacement, nowMs: number): boolean {
  const startsAtMs = Date.parse(placement.startsAt);
  const endsAtMs = Date.parse(placement.endsAt);
  return Number.isFinite(nowMs)
    && Number.isFinite(startsAtMs)
    && Number.isFinite(endsAtMs)
    && startsAtMs <= nowMs
    && nowMs < endsAtMs;
}

export function rankDiscoveryResults(input: {
  activities: ComputedActivity[];
  placements: SponsoredPlacement[];
  filters: DiscoveryQuery;
  now: string;
}): DiscoveryResult[] {
  const activitiesById = new Map(input.activities.map((activity) => [activity.id, activity]));
  const sponsoredProductIds = new Set<string>();
  const sponsored: DiscoveryResult[] = [];
  const nowMs = Date.parse(input.now);

  const eligiblePlacements = input.placements
    .filter((placement) => (
      placement.status === "approved"
      && activitiesById.has(placement.productId)
      && matchesScope(placement, input.filters)
      && isEffective(placement, nowMs)
    ))
    .sort((left, right) => compareEligibleSponsoredPlacements(left, right, {
      state: input.filters.state,
      categorySlugs: input.filters.categories,
    }));

  for (const placement of eligiblePlacements) {
    if (sponsored.length === MAX_SPONSORED_RESULTS) break;
    if (sponsoredProductIds.has(placement.productId)) continue;

    const activity = activitiesById.get(placement.productId);
    if (!activity) continue;

    sponsoredProductIds.add(placement.productId);
    sponsored.push({
      ...activity,
      sponsorship: { placementId: placement.id, label: "Sponsored" },
    });
  }

  const organic = input.activities
    .filter((activity) => !sponsoredProductIds.has(activity.id))
    .map((activity) => ({ ...activity, sponsorship: null }));

  return [...sponsored, ...organic];
}

/**
 * Accommodation is discovered as a property, while the rows underneath it
 * remain room types. Keep the ranked room that first introduced a property so
 * sponsored placement and click attribution still point at a real product.
 */
export function groupAccommodationByProperty<T extends ComputedActivity & { property?: DiscoveryPropertySummary }>(results: T[]): T[] {
  const roomsByProperty = new Map<string, T[]>();

  for (const result of results) {
    if (result.categorySlug !== "accommodation") continue;
    const propertyId = result.outlet.id || result.outletId;
    if (!propertyId) continue;
    const rooms = roomsByProperty.get(propertyId) ?? [];
    rooms.push(result);
    roomsByProperty.set(propertyId, rooms);
  }

  const emitted = new Set<string>();
  return results.flatMap((result) => {
    if (result.categorySlug !== "accommodation") return [result];

    const propertyId = result.outlet.id || result.outletId;
    const rooms = propertyId ? roomsByProperty.get(propertyId) : undefined;
    if (!propertyId || !rooms || emitted.has(propertyId)) return [];
    emitted.add(propertyId);

    const fromPrice = rooms.reduce((minimum, room) => Math.min(minimum, Number(room.price)), Number.POSITIVE_INFINITY);
    const safeFromPrice = Number.isFinite(fromPrice) ? fromPrice : Number(result.price);
    return [{
      ...result,
      name: result.outlet.name || result.name,
      image: result.outlet.coverUrl || result.image,
      price: safeFromPrice,
      property: {
        roomTypeCount: rooms.length,
        fromPrice: safeFromPrice,
      },
    }];
  });
}

/** Home highlights: Sponsored (untargeted only — Home has no state/category), then merchant ⭐ by name, then name. */
export function selectHomeDiscoverySections(
  activities: ComputedActivity[],
  recommended: ComputedActivity[],
  placements: SponsoredPlacement[] = [],
  now: string = new Date().toISOString(),
) {
  const grouped = groupAccommodationByProperty(activities);
  const oldHighlightIds = new Set(grouped.slice(0, 4).map((activity) => activity.id));
  const seen = new Set<string>();
  const uniqueActivities = activities.filter((activity) => !seen.has(activity.id) && Boolean(seen.add(activity.id)));
  const organic = orderProductCatalogue(uniqueActivities, orderProductCatalogue(uniqueActivities.filter(isMerchantFeatured)).map(({ id }) => id));
  const ranked = rankDiscoveryResults({ activities: organic, placements, filters: parseDiscoveryQuery(new URLSearchParams()), now });
  const ordinary = groupAccommodationByProperty<DiscoveryResult & { property?: DiscoveryPropertySummary }>(ranked);
  return {
    highlightItems: ordinary.filter((activity) => activity.salesSummary?.outletCount !== 0).slice(0, HOME_HIGHLIGHT_LIMIT),
    forYouItems: groupAccommodationByProperty(recommended).filter((activity) => !oldHighlightIds.has(activity.id)).slice(0, 4),
  };
}

export const HOME_HIGHLIGHT_LIMIT = 12;
export const HOME_HIGHLIGHTS_PER_PAGE = 4;

/** One page of Home highlights (4 per page); the page is clamped to the ones that exist. */
export function pageHomeHighlights<T>(items: T[], page: number) {
  const pageCount = Math.ceil(items.length / HOME_HIGHLIGHTS_PER_PAGE);
  const current = Math.min(Math.max(0, page), Math.max(0, pageCount - 1));
  return { items: items.slice(current * HOME_HIGHLIGHTS_PER_PAGE, (current + 1) * HOME_HIGHLIGHTS_PER_PAGE), page: current, pageCount };
}

/** Same grouping for ranked items that carry extra data (e.g. For You's reasons): the best-ranked room keeps its slot. */
export function groupRankedByProperty<T extends { activity: ComputedActivity & { property?: DiscoveryPropertySummary } }>(items: T[]): T[] {
  const grouped = new Map(groupAccommodationByProperty(items.map((item) => item.activity)).map((activity) => [activity.id, activity]));
  return items.flatMap((item) => {
    const activity = grouped.get(item.activity.id);
    return activity ? [{ ...item, activity }] : [];
  });
}
