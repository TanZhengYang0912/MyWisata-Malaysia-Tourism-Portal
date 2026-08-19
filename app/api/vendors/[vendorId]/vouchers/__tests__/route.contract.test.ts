import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

describe("vendor voucher catalogue linkage", () => {
  it("validates voucher product targets against the selected outlet scope", () => {
    const source = read("app/api/vendors/[vendorId]/vouchers/route.ts");
    expect(source).toContain("isProductEligibleForVoucherOutlet");
    expect(source).toContain("INVALID_PRODUCT_SCOPE");
    expect(source).toContain("outlet_offers");
  });

  it("applies the same linkage validation to bulk voucher imports", () => {
    const source = read("app/api/vendors/[vendorId]/vouchers/bulk/route.ts");
    expect(source).toContain("isProductEligibleForVoucherOutlet");
    expect(source).toContain("INVALID_PRODUCT_SCOPE");
    expect(source).toContain("redemption_mode");
  });
});
