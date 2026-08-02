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

export function selectFeaturedVendorProducts<T extends FeaturedVendorProduct>(products: T[], limit = 6) {
  return [...products]
    .sort((left, right) => {
      const imageScore = Number(Boolean(right.coverUrl)) - Number(Boolean(left.coverUrl));
      if (imageScore !== 0) return imageScore;
      const outletScore = right.soldAt.length - left.soldAt.length;
      if (outletScore !== 0) return outletScore;
      return left.name.localeCompare(right.name);
    })
    .slice(0, Math.max(0, limit));
}

export function getVendorProductTypeLabel(productType: string | null | undefined) {
  const labels: Record<string, string> = {
    activity: 'Activity',
    experience: 'Experience',
    food: 'Food & drink',
    digital: 'Digital guide',
    product: 'Local product',
  };
  return labels[productType || ''] || 'Local favourite';
}
