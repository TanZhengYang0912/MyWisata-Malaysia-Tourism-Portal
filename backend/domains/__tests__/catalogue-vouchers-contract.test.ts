import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("catalogue voucher checkout scope", () => {
  it("only exposes approved active online-capable vendor vouchers to cart and checkout", () => {
    const source = readFileSync(resolve(process.cwd(), "backend/domains/catalogue.ts"), "utf8");
    const getVouchers = source.slice(source.indexOf("export async function getVouchers"), source.indexOf("// Customer selectors"));
    expect(getVouchers).toContain('.eq("is_active", true)');
    expect(getVouchers).toContain('.eq("review_status", "approved")');
    expect(getVouchers).toContain('.in("redemption_mode", ["online", "both"])');
    expect(getVouchers).toContain('getVoucherByCode');
  });

  it("maps vendor and outlet IDs so the cart can filter unrelated vouchers", () => {
    const source = readFileSync(resolve(process.cwd(), "backend/domains/catalogue.ts"), "utf8");
    const mapper = source.slice(source.indexOf("function mapVoucher"), source.indexOf("export async function getVouchers"));
    expect(mapper).toContain("vendorId: row.vendor_id");
    expect(mapper).toContain("outletId: row.outlet_id ?? undefined");
  });
});
