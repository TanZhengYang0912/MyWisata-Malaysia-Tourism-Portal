import { describe, expect, it } from "vitest";

import {
  buildDemoBookingReference,
  buildDemoOrderNote,
  buildDemoReviewCopy,
  buildDemoReviewRefreshRows,
  buildDemoVoucherCopy,
} from "../lib/demo-content.mjs";

const product = {
  id: "product-food",
  name: "Nyonya Kuih Tasting Box",
  product_type: "food",
};
const outlet = {
  id: "outlet-melaka",
  name: "Jonker Street Kitchen",
  city: "Melaka",
  state: "Melaka",
};

describe("natural demo content", () => {
  it("is deterministic and changes with the review context", () => {
    const first = buildDemoReviewCopy({ product, outlet, reviewIndex: 2, scenarioKey: "month-completed" });
    const second = buildDemoReviewCopy({ product, outlet, reviewIndex: 2, scenarioKey: "month-completed" });
    const different = buildDemoReviewCopy({ product, outlet, reviewIndex: 3, scenarioKey: "annual-completed" });

    expect(second).toEqual(first);
    expect(different).not.toEqual(first);
    expect(first.body).toContain(product.name);
    expect(first.body).toContain(outlet.name);
    expect(first.body).not.toMatch(/demo|mock|fixture/i);
  });

  it("uses the product type to choose credible copy", () => {
    const activity = buildDemoReviewCopy({
      product: { ...product, name: "Kilim Geoforest Mangrove Kayak", product_type: "activity" },
      outlet,
      reviewIndex: 0,
      scenarioKey: "completed",
    });

    expect(activity.body).toMatch(/guide|route|meeting point|pace|water/i);
    expect(activity.body).not.toEqual(buildDemoReviewCopy({ product, outlet, reviewIndex: 0, scenarioKey: "completed" }).body);
  });

  it("keeps other visible seed labels natural and stable", () => {
    expect(buildDemoOrderNote({ product, outlet, scenarioKey: "completed" })).not.toMatch(/^Demo/i);
    expect(buildDemoVoucherCopy("heritage-trails").name).not.toMatch(/^Demo/i);
    expect(buildDemoBookingReference("order-item-1")).not.toMatch(/^DEMO/i);
    expect(buildDemoVoucherCopy("heritage-trails")).toEqual(buildDemoVoucherCopy("heritage-trails"));
  });

  it("refreshes stale demo reviews without changing their relationships", () => {
    const stale = {
      id: "review-legacy",
      user_id: "customer-demo",
      vendor_id: "vendor-food",
      order_item_id: "legacy-order-item",
      product_id: product.id,
      outlet_id: outlet.id,
      rating: 5,
      title: "Loved it!",
      body: "Delicious Nyonya Kuih Tasting Box from Jonker Street Kitchen!",
    };
    const realReview = { ...stale, id: "review-real", user_id: "real-customer" };

    const refreshed = buildDemoReviewRefreshRows({
      existingReviews: [stale, realReview],
      products: [product],
      outlets: [outlet],
      canonicalOrderItemIds: [],
      approvedVendorIds: ["vendor-food"],
      customerIds: ["customer-demo"],
    });

    expect(refreshed).toHaveLength(1);
    expect(refreshed[0]).toMatchObject({
      id: stale.id,
      order_item_id: stale.order_item_id,
      product_id: stale.product_id,
      outlet_id: stale.outlet_id,
    });
    expect(refreshed[0].body).not.toEqual(stale.body);
    expect(refreshed[0].body).toContain(product.name);
    expect(refreshed[0].body).toContain(outlet.name);
  });
});
