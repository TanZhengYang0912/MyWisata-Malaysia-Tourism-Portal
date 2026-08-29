import { describe, expect, it } from "vitest";
import { evaluateEntitlementDecision } from "@/lib/entitlements/evaluator";
import type {
  PolicyMatch,
  VerificationFacts,
} from "@/lib/entitlements/types";

const allowPolicy: PolicyMatch = {
  effect: "allow",
  source: "policy",
  entitlementGeneration: 3,
};

const noPolicy: PolicyMatch = {
  effect: null,
  source: null,
  entitlementGeneration: 3,
};

function facts(overrides: Partial<VerificationFacts> = {}): VerificationFacts {
  return {
    emailVerified: true,
    phoneVerified: false,
    profileComplete: false,
    kycStatus: "unverified",
    accountStatus: "active",
    roles: ["customer"],
    ...overrides,
  };
}

describe("independent entitlement evaluator", () => {
  it("grants KYC capabilities without inferring phone or profile completion", () => {
    const emailKycOnly = facts({ kycStatus: "approved" });

    expect(evaluateEntitlementDecision(emailKycOnly, "recommendation.submit", allowPolicy))
      .toMatchObject({ allowed: true });
    expect(evaluateEntitlementDecision(emailKycOnly, "affiliate.full", allowPolicy))
      .toMatchObject({ allowed: true });
    expect(evaluateEntitlementDecision(emailKycOnly, "wallet.request_withdrawal", allowPolicy))
      .toMatchObject({ allowed: true });
    expect(evaluateEntitlementDecision(emailKycOnly, "commerce.checkout", allowPolicy))
      .toMatchObject({
        allowed: false,
        blockerCode: "PHONE_VERIFICATION_REQUIRED",
      });
  });

  it.each([
    ["email only", facts(), "commerce.checkout", "PHONE_VERIFICATION_REQUIRED"],
    ["phone only", facts({ phoneVerified: true }), "recommendation.submit", "PROFILE_OR_KYC_REQUIRED"],
    ["profile only", facts({ profileComplete: true }), "commerce.checkout", "PHONE_VERIFICATION_REQUIRED"],
    ["phone and profile", facts({ phoneVerified: true, profileComplete: true }), "affiliate.full", "KYC_REQUIRED"],
    ["phone and KYC", facts({ phoneVerified: true, kycStatus: "approved" }), "affiliate.limited", "ENTITLEMENT_DENIED"],
    ["profile and KYC", facts({ profileComplete: true, kycStatus: "approved" }), "commerce.checkout", "PHONE_VERIFICATION_REQUIRED"],
  ] as const)("keeps %s qualifications independent", (_label, verificationFacts, capability, blockerCode) => {
    expect(evaluateEntitlementDecision(verificationFacts, capability, allowPolicy))
      .toMatchObject({ allowed: false, blockerCode });
  });

  it.each([
    ["phone only", facts({ phoneVerified: true }), ["commerce.booking", "commerce.purchase", "commerce.checkout", "ai.basic_recommendation"]],
    ["profile only", facts({ profileComplete: true }), ["recommendation.submit", "affiliate.limited"]],
    ["KYC only", facts({ kycStatus: "approved" }), ["recommendation.submit", "affiliate.full", "affiliate.earn_commission", "wallet.request_withdrawal"]],
    ["phone and profile", facts({ phoneVerified: true, profileComplete: true }), ["commerce.checkout", "recommendation.submit", "affiliate.limited"]],
    ["phone and KYC", facts({ phoneVerified: true, kycStatus: "approved" }), ["commerce.checkout", "recommendation.submit", "affiliate.full", "wallet.request_withdrawal"]],
    ["profile and KYC", facts({ profileComplete: true, kycStatus: "approved" }), ["recommendation.submit", "affiliate.full", "affiliate.earn_commission", "wallet.request_withdrawal"]],
  ] as const)("grants the union of bundles for %s", (_label, verificationFacts, capabilities) => {
    for (const capability of capabilities) {
      expect(evaluateEntitlementDecision(verificationFacts, capability, allowPolicy)).toMatchObject({
        allowed: true,
      });
    }
  });

  it("unions independently earned bundles when every fact is complete", () => {
    const allComplete = facts({
      phoneVerified: true,
      profileComplete: true,
      kycStatus: "approved",
    });

    expect(evaluateEntitlementDecision(allComplete, "commerce.checkout", allowPolicy).allowed).toBe(true);
    expect(evaluateEntitlementDecision(allComplete, "recommendation.submit", allowPolicy).allowed).toBe(true);
    expect(evaluateEntitlementDecision(allComplete, "affiliate.full", allowPolicy).allowed).toBe(true);
    expect(evaluateEntitlementDecision(allComplete, "affiliate.earn_commission", allowPolicy).allowed).toBe(true);
    expect(evaluateEntitlementDecision(allComplete, "wallet.request_withdrawal", allowPolicy).allowed).toBe(true);
    expect(evaluateEntitlementDecision(allComplete, "affiliate.limited", allowPolicy))
      .toMatchObject({ allowed: false, blockerCode: "ENTITLEMENT_DENIED" });
  });

  it("limits withdrawal approval to authorized admin roles", () => {
    expect(evaluateEntitlementDecision(facts(), "wallet.approve_withdrawal", allowPolicy))
      .toMatchObject({ allowed: false, blockerCode: "ENTITLEMENT_DENIED" });
    expect(evaluateEntitlementDecision(
      facts({ roles: ["approver"] }),
      "wallet.approve_withdrawal",
      allowPolicy,
    )).toMatchObject({ allowed: true });
  });

  it("returns all valid qualification paths for recommendation submission", () => {
    expect(evaluateEntitlementDecision(facts({ phoneVerified: true }), "recommendation.submit", allowPolicy))
      .toMatchObject({
        allowed: false,
        blockerCode: "PROFILE_OR_KYC_REQUIRED",
        qualificationPaths: [
          { type: "profile", href: "/customer/profile" },
          { type: "kyc", href: "/customer/kyc" },
        ],
      });
  });

  it.each([
    ["pending", "KYC_PENDING"],
    ["rejected", "KYC_RESUBMISSION_REQUIRED"],
    ["unverified", "KYC_REQUIRED"],
  ] as const)("keeps %s KYC recovery distinct", (kycStatus, blockerCode) => {
    expect(evaluateEntitlementDecision(facts({ kycStatus }), "wallet.request_withdrawal", allowPolicy))
      .toMatchObject({ allowed: false, blockerCode });
  });

  it("restricts accounts and ineligible affiliate roles before policy allowance", () => {
    expect(evaluateEntitlementDecision(
      facts({ accountStatus: "suspended", phoneVerified: true }),
      "commerce.checkout",
      allowPolicy,
    )).toMatchObject({ allowed: false, blockerCode: "ACCOUNT_RESTRICTED", source: "hard_guard" });
    expect(evaluateEntitlementDecision(
      facts({ profileComplete: true, roles: ["vendor_owner"] }),
      "affiliate.limited",
      allowPolicy,
    )).toMatchObject({ allowed: false, blockerCode: "ENTITLEMENT_DENIED", source: "hard_guard" });
  });

  it("applies explicit deny, then allow, then default deny after hard guards", () => {
    const complete = facts({ phoneVerified: true, profileComplete: true, kycStatus: "approved" });

    expect(evaluateEntitlementDecision(complete, "commerce.checkout", {
      effect: "deny",
      source: "assignment",
      entitlementGeneration: 4,
    })).toMatchObject({ allowed: false, blockerCode: "ENTITLEMENT_DENIED", source: "assignment" });
    expect(evaluateEntitlementDecision(complete, "commerce.checkout", allowPolicy))
      .toMatchObject({ allowed: true, source: "policy" });
    expect(evaluateEntitlementDecision(complete, "commerce.checkout", noPolicy))
      .toMatchObject({ allowed: false, blockerCode: "ENTITLEMENT_DENIED", source: "default_deny" });
  });

  it("fails closed when policy evaluation is unavailable", () => {
    expect(evaluateEntitlementDecision(facts({ phoneVerified: true }), "commerce.checkout", {
      effect: null,
      source: null,
      entitlementGeneration: 5,
      unavailable: true,
    })).toMatchObject({ allowed: false, blockerCode: "POLICY_UNAVAILABLE", source: "default_deny" });
  });
});
