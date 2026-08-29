import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROUTES = [
  ["app/api/checkout/prepare/route.ts", "CHECKOUT"],
  ["app/api/stripe/create-order-checkout/route.ts", "CHECKOUT"],
  ["app/api/stripe/create-checkout/route.ts", "CHECKOUT"],
  ["app/api/dev/simulate-purchase/route.ts", "CHECKOUT"],
  ["app/api/personalized-recommendations/route.ts", "BASIC_AI"],
  ["app/api/recommendations/route.ts", "RECOMMENDATION_SUBMIT"],
  ["app/api/affiliate/link/route.ts", "AFFILIATE_LIMITED"],
  ["app/api/stripe/connect-onboard/route.ts", "WITHDRAWAL"],
  ["app/api/wallet/withdrawals/route.ts", "WITHDRAWAL"],
] as const;

describe("protected customer API capability contract", () => {
  it.each(ROUTES)("uses the shared resolver and stable envelope in %s", (file, capability) => {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");

    expect(source).toContain("resolveServerCustomerCapability");
    expect(source).toContain("customerCapabilityFailure");
    expect(source).toContain(`CUSTOMER_CAPABILITY.${capability}`);
    expect(source).toMatch(/await resolveServerCustomerCapability\(\s*(?:user|authUser)\.id,\s*CUSTOMER_CAPABILITY\./);
    expect(source).not.toContain("resolveServerCustomerCapability({");
  });

  it("does not retain route-local tier sets for the basic AI gate", () => {
    const source = readFileSync(
      resolve(process.cwd(), "app/api/personalized-recommendations/route.ts"),
      "utf8",
    );

    expect(source).not.toContain("PHONE_READY_TIERS");
  });

  it("does not use legacy tier or route-loaded verification facts as authorization input", () => {
    for (const [file] of ROUTES) {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");

      expect(source).not.toMatch(/resolveServerCustomerCapability\(\{[\s\S]*?tier:/);
      expect(source).not.toMatch(/resolveServerCustomerCapability\(\{[\s\S]*?kycStatus:/);
    }
  });
});
