import type {
  ComputedActivity,
  DiscoveryResult,
  SponsoredPlacement,
} from "@/backend/core/types";
import type { DiscoveryQuery } from "@/lib/customer/discovery-query";
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
