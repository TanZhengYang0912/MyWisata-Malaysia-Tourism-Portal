export type ReviewMetric = { rating: number; reviews: number };

export function aggregateReviewMetrics(rows: Array<{ product_id: string; rating: number }>): Map<string, ReviewMetric> {
  const totals = new Map<string, { total: number; reviews: number }>();
  for (const row of rows) {
    const current = totals.get(row.product_id) ?? { total: 0, reviews: 0 };
    current.total += Number(row.rating);
    current.reviews += 1;
    totals.set(row.product_id, current);
  }

  return new Map([...totals.entries()].map(([productId, value]) => [
    productId,
    { rating: Math.round((value.total / value.reviews) * 10) / 10, reviews: value.reviews },
  ]));
}
