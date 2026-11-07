import type { ComputedActivity, OperatingHours } from "@/backend/core/types";
import { buildActivityPath } from "@/lib/customer/navigation-context";
import { orderProductCatalogue } from '@/lib/customer/product-catalogue';

export interface VendorReviewMetric {
  rating: number;
  reviews: number;
}

export interface FeaturedVendorProduct {
  id: string;
  name: string;
  coverUrl: string | null;
  soldAt: Array<{ id: string }>;
}

export function summarizeVendorReviews(metrics: VendorReviewMetric[]) {
  const reviews = metrics.reduce((total, metric) => total + metric.reviews, 0);
  if (reviews === 0) return { rating: null, reviews: 0 };

  const weightedRating = metrics.reduce((total, metric) => total + metric.rating * metric.reviews, 0) / reviews;
  return { rating: Math.round(weightedRating * 10) / 10, reviews };
}

export function selectFeaturedVendorProducts<T extends FeaturedVendorProduct>(
  products: T[],
  limit = 4,
  featuredProductIds?: string[] | null,
) {
  return orderProductCatalogue(products, featuredProductIds ?? []).slice(0, Math.max(0, limit));
}

export function getVendorProductTypeLabel(productType: string | null | undefined) {
  const labels: Record<string, string> = {
    activity: 'Activity',
    experience: 'Experience',
    food: 'Food & drink',
    digital: 'Digital guide',
    product: 'Local product',
    retail: 'Local product',
    accommodation: 'Accommodation',
  };
  return labels[productType || ''] || 'Local favourite';
}
export type VendorProductCardData = {
  id: string;
  vendorId: string;
  name: string;
  description: string | null;
  productType: string | null;
  imageUrl: string | null;
  fromPrice: number;
  requiresBooking: boolean;
  rating: number;
  reviews: number;
  soldAt: Array<{ id: string; name: string; price: number; city: string | null; state: string | null; operatingHours: OperatingHours | null }>;
};

export function vendorProductDetailHref(productId: string, vendorId: string, outletId?: string) {
  const outletQuery = outletId ? `&outletId=${encodeURIComponent(outletId)}` : "";
  return `/customer/products/${productId}?source=vendor${outletQuery}&returnTo=${encodeURIComponent(`/customer/vendors/${vendorId}`)}`;
}

/** A vendor card's three most-reviewed listings, as drawer thumbnails. */
export function popularVendorProducts(activities: ComputedActivity[], vendorId: string) {
  const seen = new Set<string>();
  return activities
    .filter((activity) => activity.outlet.vendorId === vendorId && !seen.has(activity.id) && seen.add(activity.id))
    .sort((left, right) => right.reviews - left.reviews || right.rating - left.rating)
    .slice(0, 3)
    .map((activity) => ({ id: activity.id, name: activity.name, imageUrl: activity.image || null, href: buildActivityPath(activity.id) }));
}
