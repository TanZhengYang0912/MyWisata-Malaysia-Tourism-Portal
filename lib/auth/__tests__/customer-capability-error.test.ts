import { describe, expect, it } from "vitest";
import { parseCustomerCapabilityError } from "@/lib/auth/customer-capability-error";

describe("customer capability API error parser", () => {
  it("parses a canonical capability denial", () => {
    expect(parseCustomerCapabilityError({
      data: null,
      error: {
        code: "PHONE_VERIFICATION_REQUIRED",
        message: "Phone verification is required",
        details: {
          capability: "commerce.checkout",
          blockerCode: "PHONE_VERIFICATION_REQUIRED",
          qualificationPaths: [{ type: "phone", href: "/customer/profile" }],
          entitlementGeneration: 7,
        },
      },
    })).toEqual({
      capability: "commerce.checkout",
      decision: {
        allowed: false,
        blockerCode: "PHONE_VERIFICATION_REQUIRED",
        qualificationPaths: [{ type: "phone", href: "/customer/profile" }],
        entitlementGeneration: 7,
        source: "hard_guard",
        currentTier: null,
        requiredTier: null,
        nextAction: "verify_phone",
      },
    });
  });

  it("preserves multiple safe qualification paths", () => {
    const parsed = parseCustomerCapabilityError({
      error: {
        code: "PROFILE_OR_KYC_REQUIRED",
        details: {
          capability: "recommendation.submit",
          blockerCode: "PROFILE_OR_KYC_REQUIRED",
          qualificationPaths: [
            { type: "profile", href: "/customer/profile" },
            { type: "kyc", href: "/customer/kyc" },
          ],
          entitlementGeneration: 9,
        },
      },
    });

    expect(parsed?.decision.qualificationPaths).toHaveLength(2);
  });

  it("accepts a zero-path policy denial without inventing a recovery action", () => {
    expect(parseCustomerCapabilityError({
      error: {
        code: "ENTITLEMENT_DENIED",
        details: {
          capability: "affiliate.limited",
          blockerCode: "ENTITLEMENT_DENIED",
          qualificationPaths: [],
          entitlementGeneration: 10,
        },
      },
    })?.decision).toMatchObject({
      blockerCode: "ENTITLEMENT_DENIED",
      qualificationPaths: [],
      nextAction: "none",
    });
  });

  it("rejects unrelated and malformed error payloads", () => {
    expect(parseCustomerCapabilityError({ error: { code: "VALIDATION_ERROR" } })).toBeNull();
    expect(parseCustomerCapabilityError({
      error: { code: "KYC_REQUIRED", details: { capability: "not_real" } },
    })).toBeNull();
    expect(parseCustomerCapabilityError({
      error: {
        code: "KYC_REQUIRED",
        details: {
          capability: "wallet.request_withdrawal",
          blockerCode: "KYC_REQUIRED",
          qualificationPaths: [{ type: "kyc", href: "https://untrusted.example" }],
          entitlementGeneration: 1,
        },
      },
    })).toBeNull();
    expect(parseCustomerCapabilityError(null)).toBeNull();
  });
});
