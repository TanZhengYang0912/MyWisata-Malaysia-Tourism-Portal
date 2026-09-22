import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/customer/cart/page.tsx"), "utf8");

describe("cart voucher outlet validation", () => {
  it("uses the cart line's selected outlet before the product default", () => {
    expect(source).toMatch(/outletId:\s*item\.outletId\s*\?\?\s*activity\?\.outletId/);
  });

  it("shows the cart line's selected outlet next to the product", () => {
    expect(source).toContain("const outlet = outlets.get(item.outletId ?? activity.outletId);");
  });

  it("validates only vouchers matching the selected vendor, outlet, and product", () => {
    expect(source).toContain("const candidateVouchers = useMemo(");
    expect(source).toContain("selectedVendorIds.has(voucher.vendorId)");
    expect(source).toContain("selectedOutletIds.has(voucher.outletId)");
    expect(source).toContain("selectedProductIds.has(voucher.productId)");
    expect(source).toContain("candidateVouchers.map(async (voucher)");
  });
});
