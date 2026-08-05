import type { ComputedActivity } from "@/backend/core/types";
import type { FeedItem } from "@/backend/domains/recommend";

const DEFAULT_VENDOR_LIMIT = 4;
type RankableVendor = { id: string; name: string; outlets: unknown[] };

function capLimit(limit: number | undefined): number {
  return Math.max(0, limit ?? DEFAULT_VENDOR_LIMIT);
}

/**
 * Collapses the ranked activity feed into distinct vendors while preserving
 * the first (best) personalized activity position for each vendor.
 */
export function rankVendorsByPersonalizedFeed<T extends RankableVendor>(
  vendors: T[],
  feed: FeedItem[],
  limit = DEFAULT_VENDOR_LIMIT,
): T[] {
  const rankByVendor = new Map<string, number>();

  feed.forEach((item, index) => {
    if (item.reason === null) return;
    const vendorId = item.activity.outlet.vendorId;
    if (vendorId && !rankByVendor.has(vendorId)) rankByVendor.set(vendorId, index);
  });

  return vendors
    .filter((vendor) => rankByVendor.has(vendor.id))
    .sort((left, right) => (
      (rankByVendor.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (rankByVendor.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      || left.name.localeCompare(right.name)
    ))
    .slice(0, capLimit(limit));
}

/**
 * Stable public fallback for the customer home. It uses catalogue quality and
 * active-outlet breadth only; no user-specific recommendation signal enters.
 */
export function rankFeaturedVendors<T extends RankableVendor>(
  vendors: T[],
  activities: ComputedActivity[],
  limit = DEFAULT_VENDOR_LIMIT,
): T[] {
  const qualityByVendor = new Map<string, number>();
  for (const activity of activities) {
    const vendorId = activity.outlet.vendorId;
    if (!vendorId) continue;
    const quality = Math.max(0, activity.rating) * Math.max(0, activity.reviews);
    qualityByVendor.set(vendorId, Math.max(qualityByVendor.get(vendorId) ?? 0, quality));
  }

  return [...vendors]
    .sort((left, right) => {
      const qualityDelta = (qualityByVendor.get(right.id) ?? 0) - (qualityByVendor.get(left.id) ?? 0);
      if (qualityDelta !== 0) return qualityDelta;
      const outletDelta = right.outlets.length - left.outlets.length;
      return outletDelta || left.name.localeCompare(right.name);
    })
    .slice(0, capLimit(limit));
}
