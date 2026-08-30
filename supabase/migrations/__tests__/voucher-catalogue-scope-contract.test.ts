import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("voucher catalogue scope migration", () => {
  it("guards vendor, outlet, and shared-product relationships at the database boundary", () => {
    const source = readFileSync(resolve(process.cwd(), "supabase/migrations/20260816150658_voucher_catalogue_scope.sql"), "utf8");
    expect(source).toContain("validate_voucher_catalogue_scope");
    expect(source).toContain("voucher_product_vendor_mismatch");
    expect(source).toContain("voucher_outlet_vendor_mismatch");
    expect(source).toContain("outlet_offers");
    expect(source).toContain("status = 'active'");
    expect(source).toContain("vouchers_catalogue_scope");
  });
});
