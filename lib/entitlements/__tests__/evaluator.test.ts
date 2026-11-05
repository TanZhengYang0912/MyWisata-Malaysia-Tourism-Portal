import { describe, expect, it } from "vitest";
import { evaluateEntitlementDecision } from "@/lib/entitlements/evaluator";
import type {
  CapabilityKey,
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
  it("does not let KYC waive Phone or Profile for protected capabilities", () => {
    const emailKycOnly = facts({ kycStatus: "approved" });

    expect(evaluateEntitlementDecision(emailKycOnly, "recommendation.submit", allowPolicy))
      .toMatchObject({ allowed: false, blockerCode: "PHONE_VERIFICATION_REQUIRED" });
    expect(evaluateEntitlementDecision(emailKycOnly, "affiliate.full", allowPolicy))
      .toMatchObject({ allowed: false, blockerCode: "PHONE_VERIFICATION_REQUIRED" });
    expect(evaluateEntitlementDecision(emailKycOnly, "wallet.request_withdrawal", allowPolicy))
      .toMatchObject({ allowed: false, blockerCode: "PHONE_VERIFICATION_REQUIRED" });
    const phoneKycOnly = facts({ phoneVerified: true, kycStatus: "approved" });
    expect(evaluateEntitlementDecision(phoneKycOnly, "recommendation.submit", allowPolicy))
      .toMatchObject({ allowed: false, blockerCode: "PROFILE_REQUIRED" });
    expect(evaluateEntitlementDecision(phoneKycOnly, "affiliate.full", allowPolicy))
      .toMatchObject({ allowed: false, blockerCode: "PROFILE_REQUIRED" });
    expect(evaluateEntitlementDecision(phoneKycOnly, "wallet.request_withdrawal", allowPolicy))
      .toMatchObject({ allowed: false, blockerCode: "PROFILE_REQUIRED" });
    expect(evaluateEntitlementDecision(emailKycOnly, "wallet.top_up", allowPolicy))
      .toMatchObject({
        allowed: false,
        blockerCode: "PHONE_VERIFICATION_REQUIRED",
      });
  });

  it.each([
    ["email only", facts(), "wallet.top_up", "PHONE_VERIFICATION_REQUIRED"],
    ["phone only", facts({ phoneVerified: true }), "recommendation.submit", "PROFILE_REQUIRED"],
    ["profile only", facts({ profileComplete: true }), "wallet.top_up", "PHONE_VERIFICATION_REQUIRED"],
    ["phone and profile", facts({ phoneVerified: true, profileComplete: true }), "affiliate.full", "KYC_REQUIRED"],
    ["phone and KYC", facts({ phoneVerified: true, kycStatus: "approved" }), "affiliate.limited", "PROFILE_REQUIRED"],
    ["profile and KYC", facts({ profileComplete: true, kycStatus: "approved" }), "wallet.top_up", "PHONE_VERIFICATION_REQUIRED"],
  ] as const)("keeps %s qualifications independent", (_label, verificationFacts, capability, blockerCode) => {
    expect(evaluateEntitlementDecision(verificationFacts, capability, allowPolicy))
      .toMatchObject({ allowed: false, blockerCode });
  });

  it.each([
    ["phone and profile", facts({ phoneVerified: true, profileComplete: true }), ["recommendation.submit", "affiliate.limited"]],
    ["phone, profile and KYC", facts({ phoneVerified: true, profileComplete: true, kycStatus: "approved" }), ["recommendation.submit", "affiliate.full", "affiliate.earn_commission", "wallet.request_withdrawal"]],
  ] as const)("grants the cumulative bundle for %s", (_label, verificationFacts, capabilities) => {
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

    expect(evaluateEntitlementDecision(allComplete, "wallet.top_up", allowPolicy).allowed).toBe(true);
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
        blockerCode: "PROFILE_REQUIRED",
        qualificationPaths: [{ type: "profile", href: "/customer/profile" }],
      });
  });

  it("allows Limited Affiliate only with Phone and Profile and without full KYC", () => {
    expect(evaluateEntitlementDecision(
      facts({ phoneVerified: true, profileComplete: true }),
      "affiliate.limited",
      allowPolicy,
    )).toMatchObject({ allowed: true });
    expect(evaluateEntitlementDecision(
      facts({ phoneVerified: true, profileComplete: true, kycStatus: "approved" }),
      "affiliate.limited",
      allowPolicy,
    )).toMatchObject({ allowed: false, blockerCode: "ENTITLEMENT_DENIED" });
  });

  it("routes Phone hard-guard recovery to the independent Phone page", () => {
    expect(evaluateEntitlementDecision(facts(), "wallet.top_up", allowPolicy))
      .toMatchObject({
        qualificationPaths: [{ type: "phone", href: "/customer/phone" }],
      });
  });

  it.each([
    ["pending", "KYC_PENDING"],
    ["rejected", "KYC_RESUBMISSION_REQUIRED"],
    ["unverified", "KYC_REQUIRED"],
  ] as const)("keeps %s KYC recovery distinct", (kycStatus, blockerCode) => {
    expect(evaluateEntitlementDecision(facts({ phoneVerified: true, profileComplete: true, kycStatus }), "wallet.request_withdrawal", allowPolicy))
      .toMatchObject({ allowed: false, blockerCode });
  });

  it("restricts accounts and ineligible affiliate roles before policy allowance", () => {
    expect(evaluateEntitlementDecision(
      facts({ accountStatus: "suspended", phoneVerified: true }),
      "commerce.checkout",
      allowPolicy,
    )).toMatchObject({ allowed: false, blockerCode: "ACCOUNT_RESTRICTED", source: "hard_guard" });
    expect(evaluateEntitlementDecision(
      facts({ phoneVerified: true, profileComplete: true, roles: ["vendor_owner"] }),
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
    expect(evaluateEntitlementDecision(complete, "wallet.top_up", allowPolicy))
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

  it("fails closed for an unknown runtime capability despite an allow policy", () => {
    expect(evaluateEntitlementDecision(
      facts({ phoneVerified: true, profileComplete: true, kycStatus: "approved" }),
      "unknown.runtime_capability" as CapabilityKey,
      allowPolicy,
    )).toMatchObject({
      allowed: false,
      blockerCode: "ENTITLEMENT_DENIED",
      source: "default_deny",
    });
  });
});

 describe("email-verified commerce", () => {
  it.each(["commerce.purchase", "commerce.booking", "commerce.checkout"] as const)("allows %s without phone, profile or KYC", (capability) => {
    expect(evaluateEntitlementDecision(facts(), capability, allowPolicy)).toMatchObject({ allowed: true });
    expect(evaluateEntitlementDecision(facts({ emailVerified: false }), capability, allowPolicy)).toMatchObject({ allowed: false, blockerCode: "EMAIL_VERIFICATION_REQUIRED" });
  });
  it("keeps wallet top-up and basic AI phone-gated", () => {
    for (const capability of ["wallet.top_up", "ai.basic_recommendation"] as const) {
      expect(evaluateEntitlementDecision(facts(), capability, allowPolicy)).toMatchObject({ allowed: false, blockerCode: "PHONE_VERIFICATION_REQUIRED" });
    }
  });
});
