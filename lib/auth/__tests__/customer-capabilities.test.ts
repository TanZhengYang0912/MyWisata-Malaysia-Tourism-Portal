import { describe, expect, it } from "vitest";
import {
  CUSTOMER_CAPABILITY,
  CUSTOMER_CAPABILITY_KEY,
  type CustomerViewer,
  customerAccessHref,
  resolveCustomerCapabilities,
  resolveCustomerCapability,
  resolveCustomerAccess,
} from "@/lib/auth/customer-capabilities";
import type { VerificationFacts } from "@/lib/entitlements/types";

const customerFacts = (overrides: Partial<VerificationFacts> = {}): VerificationFacts => ({
  emailVerified: true,
  phoneVerified: false,
  profileComplete: false,
  kycStatus: "unverified",
  accountStatus: "active",
  roles: ["customer"],
  ...overrides,
});

describe("customer capability compatibility", () => {
  it("maps customer aliases to stable capability keys", () => {
    expect(CUSTOMER_CAPABILITY.CHECKOUT).toBe(CUSTOMER_CAPABILITY_KEY.CHECKOUT);
    expect(CUSTOMER_CAPABILITY.CHECKOUT).toBe("commerce.checkout");
    expect(CUSTOMER_CAPABILITY.WITHDRAWAL).toBe("wallet.request_withdrawal");
  });

  it("uses facts rather than a verification tier", () => {
    const emailKycOnly = customerFacts({ kycStatus: "approved" });

    expect(resolveCustomerCapability(emailKycOnly, CUSTOMER_CAPABILITY.RECOMMENDATION_SUBMIT))
      .toMatchObject({ allowed: true });
    expect(resolveCustomerCapability(emailKycOnly, CUSTOMER_CAPABILITY.AFFILIATE_FULL))
      .toMatchObject({ allowed: true });
    expect(resolveCustomerCapability(emailKycOnly, CUSTOMER_CAPABILITY.WITHDRAWAL))
      .toMatchObject({ allowed: true });
    expect(resolveCustomerCapability(emailKycOnly, CUSTOMER_CAPABILITY.CHECKOUT))
      .toMatchObject({ allowed: false, blockerCode: "PHONE_VERIFICATION_REQUIRED" });
  });

  it("exposes a stable capability snapshot", () => {
    const snapshot = resolveCustomerCapabilities(customerFacts({ phoneVerified: true }));

    expect(Object.values(CUSTOMER_CAPABILITY).every((capability) => capability in snapshot)).toBe(true);
    expect(snapshot["commerce.checkout"].allowed).toBe(true);
    expect(snapshot["recommendation.submit"].blockerCode).toBe("PROFILE_OR_KYC_REQUIRED");
  });

  it("maps an entitlement blocker to the legacy access result", () => {
    expect(resolveCustomerAccess(customerFacts(), CUSTOMER_CAPABILITY.CHECKOUT))
      .toBe("phone_verification_required");
    expect(resolveCustomerAccess(customerFacts({ phoneVerified: true }), CUSTOMER_CAPABILITY.RECOMMENDATION_SUBMIT))
      .toBe("profile_completion_required");
  });

  it("fails closed for legacy tier-only or guest compatibility inputs", () => {
    const tierOnly: CustomerViewer = { verificationTier: "kyc_verified" };

    expect(resolveCustomerCapability(tierOnly, CUSTOMER_CAPABILITY.CHECKOUT))
      .toMatchObject({ allowed: false, blockerCode: "SIGN_IN_REQUIRED" });
    expect(resolveCustomerCapability(null, CUSTOMER_CAPABILITY.CHECKOUT))
      .toMatchObject({ allowed: false, blockerCode: "SIGN_IN_REQUIRED" });
  });

  it("rejects an unknown runtime capability alias", () => {
    expect(resolveCustomerCapability(
      customerFacts({ phoneVerified: true, profileComplete: true, kycStatus: "approved" }),
      "unknown.runtime_capability" as never,
    )).toMatchObject({ allowed: false, blockerCode: "ENTITLEMENT_DENIED" });
  });

  it("preserves only a safe local continuation", () => {
    expect(customerAccessHref("phone_verification_required", "https://evil.example"))
      .toBe("/customer/phone?next=%2Fcustomer");
    expect(customerAccessHref("profile_completion_required", "//evil.example"))
      .toBe("/customer/profile?next=%2Fcustomer");
    expect(customerAccessHref("kyc_required", "/customer/wallet"))
      .toBe("/customer/kyc?next=%2Fcustomer%2Fwallet");
  });
});
