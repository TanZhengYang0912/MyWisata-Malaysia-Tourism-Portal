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
    expect(listSource).toContain("t(\"ui.reviews.allRatings\")");
    expect(listSource).toContain("t(\"ui.reviews.verifiedPurchase\")");
    expect(listSource).toContain("t(\"ui.reviews.showAll\"");
    expect(listSource).toContain("t(\"ui.reviews.showLess\")");
    expect(listSource).toContain("productHref");
    expect(listSource).toContain("source=vendor");
  });

  it("integrates VendorReviewsList into the vendor page", () => {
    expect(pageSource).toContain("import { VendorReviewsList");
    expect(pageSource).toContain("<VendorReviewsList reviews={reviews} vendorId={vendor.id} />");
    expect(pageSource).toContain("from('reviews')");
  });
});
