import { describe, expect, it } from "vitest";
import { aggregateReviewMetrics } from "@/backend/domains/review-metrics";

describe("aggregateReviewMetrics", () => {
  it("calculates a one-decimal average and review count per product", () => {
    expect(aggregateReviewMetrics([
      { product_id: "product-a", rating: 5 },
      { product_id: "product-a", rating: 4 },
      { product_id: "product-b", rating: 3 },
    ])).toEqual(new Map([
      ["product-a", { rating: 4.5, reviews: 2 }],
      ["product-b", { rating: 3, reviews: 1 }],
    ]));
  });

  it("does not create metrics for products with no visible reviews", () => {
    expect(aggregateReviewMetrics([]).get("unreviewed-product") ?? { rating: 0, reviews: 0 })
      .toEqual({ rating: 0, reviews: 0 });
  });
});
