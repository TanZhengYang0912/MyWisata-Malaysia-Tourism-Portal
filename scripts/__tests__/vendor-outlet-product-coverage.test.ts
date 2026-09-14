import { describe, expect, it } from "vitest";

import { buildVendorOutletProductCoverage, getCoverageFailures } from "../lib/vendor-outlet-product-coverage.mjs";

const vendor = { id: "vendor-1", name: "Real Operator", status: "approved" };
const outletA = { id: "outlet-a", vendor_id: vendor.id, name: "Branch A", status: "active", review_status: "approved" };
const outletB = { id: "outlet-b", vendor_id: vendor.id, name: "Branch B", status: "active", review_status: "approved" };
const products = [1, 2, 3, 4, 5].map((number) => ({
  id: `product-${number}`,
  vendor_id: vendor.id,
  outlet_id: number === 1 ? outletA.id : null,
  name: `Product ${number}`,
  base_price: number * 10,
  status: "active",
  review_status: "approved",
}));

describe("vendor outlet product coverage", () => {
  it("counts direct and shared products once and keeps outlet prices separate", () => {
    const result = buildVendorOutletProductCoverage({
      vendors: [vendor],
      outlets: [outletA, outletB],
      products,
      offers: products.map((product) => ({
        product_id: product.id,
        outlet_id: outletB.id,
        price: 100 + Number(product.id.replace("product-", "")),
        status: "active",
      })).concat(products.slice(1).map((product) => ({
        product_id: product.id,
        outlet_id: outletA.id,
        price: product.id === "product-2" ? 77 : Number(product.base_price),
        status: "active",
      }))),
    });

    expect(result.allRequirementsPass).toBe(true);
    expect(result.coverage.map((row) => row.productCount)).toEqual([5, 5]);
    expect(getCoverageFailures(result)).toEqual([]);
    expect(result.coverage[0].products.find((product) => product.id === "product-2")?.price).toBe(77);
    expect(result.coverage[1].products.find((product) => product.id === "product-2")?.price).toBe(102);
  });

  it("rejects a shared offer that crosses Vendor ownership", () => {
    const result = buildVendorOutletProductCoverage({
      vendors: [vendor, { id: "vendor-2", status: "approved", name: "Other Operator" }],
      outlets: [outletA],
      products: [...products, { ...products[0], id: "foreign-product", vendor_id: "vendor-2", outlet_id: null }],
      offers: [{ product_id: "foreign-product", outlet_id: outletA.id, price: 12, status: "active" }],
    });

    expect(result.issues).toContainEqual({
      code: "shared_offer_vendor_mismatch",
      productId: "foreign-product",
      outletId: outletA.id,
    });
  });

  it("ignores inactive products and outlets", () => {
    const result = buildVendorOutletProductCoverage({
      vendors: [vendor],
      outlets: [outletA, { ...outletB, status: "inactive" }],
      products: [{ ...products[0], status: "inactive" }],
      offers: [],
    });

    expect(result.activeOutletCount).toBe(1);
    expect(result.coverage[0].productCount).toBe(0);
    expect(result.issues[0].code).toBe("outlet_product_minimum_not_met");
  });
});
