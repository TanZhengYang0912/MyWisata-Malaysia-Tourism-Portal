import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("progressive capability surfaces", () => {
  it("keeps checkout visible and gates the payment action instead of redirecting on mount", () => {
    const checkout = source("app/customer/checkout/page.tsx");

    expect(checkout).not.toContain("resolveCustomerAccess");
    expect(checkout).not.toContain("if (!checkoutAllowed) gate(");
    expect(checkout).not.toContain("if (!checkoutAllowed) {\n    return <EmptyState");
    expect(checkout).toContain("gate(CUSTOMER_CAPABILITY.CHECKOUT");
    expect(checkout).toContain("gate.handleResponse(prepareResponse");
  });

  it("asks for basic-AI capability only when recommendations are requested", () => {
    const forYou = source("app/customer/for-you/for-you-client.tsx");

    expect(forYou).toContain("gate(CUSTOMER_CAPABILITY.BASIC_AI");
    expect(forYou).not.toContain("useEffect(() => { void load(); }");
    expect(forYou).toContain("gate.handleResponse(response");
  });

  it("keeps the affiliate teaser visible and uses the shared profile gate", () => {
    const affiliate = source("app/customer/affiliate/page.tsx");

    expect(affiliate).not.toContain("isAffiliateEligible");
    expect(affiliate).not.toContain('<Link href="/customer/kyc">');
    expect(affiliate).toContain("capabilities.affiliate_full.allowed || capabilities.affiliate_limited.allowed");
    expect(affiliate).toContain("CUSTOMER_CAPABILITY.AFFILIATE_FULL");
    expect(affiliate).toContain("gate.handleResponse(response");
  });

  it("uses the capability snapshot rather than legacy tier for withdrawal readiness", () => {
    const wallet = source("app/customer/wallet/page.tsx");

    expect(wallet).toContain("capabilities.withdrawal.allowed");
    expect(wallet).not.toContain('data.tier !== "kyc_verified"');
  });
});
