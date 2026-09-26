import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "app/customer/cart/page.tsx"), "utf8");
const localeSources = ["en", "ms", "zh-CN"].map((locale) =>
  readFileSync(resolve(process.cwd(), `app/i18n/locales/${locale}/customer.json`), "utf8"),
);

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

  it("explains each voucher scope using the existing cart catalogue data", () => {
    expect(source).toContain("function resolveVoucherScopeLabel(");
    expect(source).toContain("voucher.outletId");
    expect(source).toContain("voucher.vendorId");
    expect(source).toContain("voucher.productId");
    expect(source).toContain("scopeLabel:");
  });

  it("separates the applied voucher from the other available offers", () => {
    expect(source).toContain("const appliedVoucherOption =");
    expect(source).toContain("const availableVoucherOptions =");
    expect(source).toContain("appliedVoucher?.id !== option.voucher.id");
    expect(source).toContain("availableVoucherOptions.length");
  });

  it("blocks applying another voucher until the current one is removed", () => {
    expect(source).toContain("disabled={applied || hasAppliedVoucher}");
    expect(source).toContain("hasAppliedVoucher={Boolean(appliedVoucher)}");
    expect(source).toContain("disabled={!code.trim() || Boolean(appliedVoucher)}");
    expect(source).toContain("if (appliedVoucher) return;");
    expect(source).toContain("removeCurrentBeforeSwitch");
    localeSources.forEach((localeSource) => expect(localeSource).toContain('"removeCurrentBeforeSwitch"'));
  });
});
