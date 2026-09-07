import type {
  ComputedActivity,
  DiscoveryResult,
  SponsoredPlacement,
} from "@/backend/core/types";
import type { DiscoveryQuery } from "@/lib/customer/discovery-query";

const MAX_SPONSORED_RESULTS = 4;

function normalizeScope(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized || null;
}

function comparePlacements(left: SponsoredPlacement, right: SponsoredPlacement): number {
  if (left.priority !== right.priority) return right.priority - left.priority;

  const startsAtOrder = Date.parse(left.startsAt) - Date.parse(right.startsAt);
  if (startsAtOrder !== 0) return startsAtOrder;
  return left.id.localeCompare(right.id);
}

function matchesScope(placement: SponsoredPlacement, filters: DiscoveryQuery): boolean {
  const placementState = normalizeScope(placement.state);
  const selectedState = normalizeScope(filters.state);
  if (placementState !== null && placementState !== selectedState) return false;

  const placementCategory = normalizeScope(placement.categorySlug);
  const selectedCategories = new Set(filters.categories.map((category) => normalizeScope(category)));
  return placementCategory === null || selectedCategories.has(placementCategory);
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
    .sort(comparePlacements);

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
