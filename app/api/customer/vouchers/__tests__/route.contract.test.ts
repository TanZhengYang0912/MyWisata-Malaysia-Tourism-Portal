import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(file: string) {
  return readFileSync(resolve(process.cwd(), file), "utf8");
}

describe("customer voucher API contracts", () => {
  it("requires a signed-in user for browse and claim routes", () => {
    const browse = read("app/api/customer/vouchers/route.ts");
    const claim = read("app/api/customer/vouchers/claim/route.ts");
    expect(browse).toContain("auth.getUser()");
    expect(claim).toContain("auth.getUser()");
    expect(browse).toContain("UNAUTHORIZED");
    expect(claim).toContain("UNAUTHORIZED");
  });

  it("uses the current user's claim rows when building My Vouchers", () => {
    const browse = read("app/api/customer/vouchers/route.ts");
    expect(browse).toContain("customer_voucher_claims");
    expect(browse).toContain(".eq(\"user_id\", user.id)");
    expect(browse).toContain("tab");
    expect(browse).toContain("claimedVoucherIds");
    expect(browse).toContain("!claimedVoucherIds.has(voucher.id)");
  });

  it("returns real outlet coverage and redemption mode from the catalogue", () => {
    const browse = read("app/api/customer/vouchers/route.ts");
    expect(browse).toContain("outlet_offers");
    expect(browse).toContain("eligibleProductsByOutlet");
    expect(browse).toContain("eligibleProductCount");
    expect(browse).toContain("eligibleProductNames");
    expect(browse).toContain("productName");
    expect(browse).toContain("redemptionMode: row.redemption_mode");
  });

  it("keeps vendor-wide vouchers visible without requiring an outlet relation", () => {
    const browse = read("app/api/customer/vouchers/route.ts");
    expect(browse).not.toContain("outlets!inner");
    expect(browse).toContain("!row.outlet_id");
    expect(browse).toContain('status === "active"');
    expect(browse).toContain('review_status === "approved"');
  });

  it("resolves voucher imagery from the outlet before falling back to vendor branding", () => {
    const browse = read("app/api/customer/vouchers/route.ts");
    expect(browse).toContain("outlet_pages(hero_url)");
    expect(browse).toContain("managed_by_vendor_id");
    expect(browse).toContain("resolveOutletImage");
    expect(browse).toContain("outletImageUrl");
  });

  it("claims only by voucher ID and delegates ownership to the RPC", () => {
    const claim = read("app/api/customer/vouchers/claim/route.ts");
    expect(claim).toContain("voucherId");
    expect(claim).toContain("claim_voucher");
    expect(claim).toContain("p_voucher_id");
    expect(claim).not.toContain("userId");
  });
});
