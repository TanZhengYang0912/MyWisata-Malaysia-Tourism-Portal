import { describe, expect, it } from "vitest";
import {
  CUSTOMER_CAPABILITY,
  customerAccessHref,
  resolveCustomerAccess,
} from "@/lib/auth/customer-capabilities";

const viewer = (
  verificationTier: "email_unverified" | "email_verified" | "phone_verified" | "profile_complete" | "kyc_verified",
) => ({ verificationTier });

describe("customer capability policy", () => {
  it.each([
    [null, CUSTOMER_CAPABILITY.BROWSE, "allowed"],
    [null, CUSTOMER_CAPABILITY.ACCOUNT_MUTATION, "sign_in_required"],
    [viewer("email_verified"), CUSTOMER_CAPABILITY.CART_MUTATION, "allowed"],
    [viewer("email_verified"), CUSTOMER_CAPABILITY.CHECKOUT, "phone_verification_required"],
    [viewer("email_verified"), CUSTOMER_CAPABILITY.BASIC_AI, "phone_verification_required"],
    [viewer("phone_verified"), CUSTOMER_CAPABILITY.CHECKOUT, "allowed"],
    [viewer("phone_verified"), CUSTOMER_CAPABILITY.BASIC_AI, "allowed"],
    [viewer("phone_verified"), CUSTOMER_CAPABILITY.RECOMMENDATION_SUBMIT, "profile_completion_required"],
    [viewer("profile_complete"), CUSTOMER_CAPABILITY.AFFILIATE_LIMITED, "allowed"],
    [viewer("profile_complete"), CUSTOMER_CAPABILITY.AFFILIATE_FULL, "kyc_required"],
    [viewer("profile_complete"), CUSTOMER_CAPABILITY.WITHDRAWAL, "kyc_required"],
    [viewer("kyc_verified"), CUSTOMER_CAPABILITY.AFFILIATE_FULL, "allowed"],
    [viewer("kyc_verified"), CUSTOMER_CAPABILITY.WITHDRAWAL, "allowed"],
  ])("resolves %o / %s as %s", (currentViewer, capability, expected) => {
    expect(resolveCustomerAccess(currentViewer, capability)).toBe(expected);
  });

  it("preserves only a safe local continuation", () => {
    expect(customerAccessHref("sign_in_required", "/customer/activity/p1?slot=s1"))
      .toBe("/login?next=%2Fcustomer%2Factivity%2Fp1%3Fslot%3Ds1");
    expect(customerAccessHref("phone_verification_required", "https://evil.example"))
      .toBe("/customer/profile?next=%2Fcustomer");
    expect(customerAccessHref("profile_completion_required", "//evil.example"))
      .toBe("/customer/profile?next=%2Fcustomer");
    expect(customerAccessHref("kyc_required", "/customer/wallet"))
      .toBe("/customer/kyc?next=%2Fcustomer%2Fwallet");
  });
});
