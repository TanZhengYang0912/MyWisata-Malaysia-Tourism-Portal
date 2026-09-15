import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("Vendor Owner product details", () => {
  it("keeps owner view access separate from Outlet Manager edit access", () => {
    const products = read("app/vendor/products/page.tsx");
    const details = read("components/vendor/product-details-page.tsx");
    const variants = read("components/vendor/variant-manager.tsx");
    const pricing = read("components/vendor/price-rule-manager.tsx");

    expect(products).toContain("const canViewProductDetails = isOwner || canManageOutlet;");
    expect(products).toContain("canViewDetails={canViewProductDetails}");
    expect(details).toContain("canViewDetails: boolean;");
    expect(details).toContain("readOnly={!canManageOutlet}");
    expect(variants).toContain("readOnly?: boolean");
    expect(pricing).toContain("readOnly?: boolean");
  });

  it("retains outlet identity for inventory rows", () => {
    const productsApi = read("app/api/vendors/[vendorId]/products/route.ts");
    const variants = read("components/vendor/variant-manager.tsx");

    expect(productsApi).toContain("inventory(outlet_id,quantity,reserved,low_stock_threshold)");
    expect(variants).toContain("outlet_id?: string");
    expect(variants).toContain("selectedOutletId");
    expect(variants).toContain("find((inventory) => inventory.outlet_id === selectedOutletId)");
  });
});
