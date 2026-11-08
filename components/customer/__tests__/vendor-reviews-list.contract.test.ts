import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const listSource = readFileSync(
  resolve(process.cwd(), "components/customer/vendor-reviews-list.tsx"),
  "utf8",
);
const pageSource = readFileSync(
  resolve(process.cwd(), "app/customer/vendor/[vendorId]/page.tsx"),
  "utf8",
);

describe("vendor reviews list and contract", () => {
  it("renders review cards with star rating, verified badge, and product links", () => {
    expect(listSource).toContain("FeedbackCollection mode=\"reviews\"");
    expect(listSource).toContain("t(\"ui.reviews.allRatings\")");
    expect(listSource).toContain("t(\"ui.reviews.verifiedPurchase\")");
    expect(listSource).toContain("productHref");
    expect(listSource).toContain("source=vendor");
  });

  it("keeps rating filters in one horizontally scrollable row on mobile", () => {
    expect(listSource).toContain("flex w-full min-w-0 flex-nowrap gap-2 overflow-x-auto overscroll-x-contain hide-scrollbar py-1");
    expect(listSource).toContain("min-h-10 shrink-0 whitespace-nowrap");
  });

  it("integrates VendorReviewsList into the vendor page", () => {
    expect(pageSource).toContain("import { VendorReviewsList");
    expect(pageSource).toContain("<VendorReviewsList reviews={reviews} ratingBuckets={reviewRatingBuckets} totalReviews={reviewSummary.reviews} vendorId={vendor.id} />");
    expect(pageSource).toContain("getScopedReviewPage(\"vendor\", vendorId");
    expect(pageSource).not.toContain("users(full_name)");
  });
});
