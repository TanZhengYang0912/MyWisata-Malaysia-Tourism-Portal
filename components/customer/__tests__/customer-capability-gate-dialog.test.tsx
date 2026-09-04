import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  capabilityGateCopyKey,
  customerCapabilityRecoveryActions,
  customerCapabilityRecoveryHref,
  customerCapabilityRecoveryHrefs,
} from "@/components/customer/customer-capability-gate-dialog";

describe("customer capability gate dialog contract", () => {
  it("keeps the decorative shield alongside the title in a centered row", () => {
    const source = readFileSync("components/customer/customer-capability-gate-dialog.tsx", "utf8");
    expect(source).toMatch(/<DialogTitle className="[^"]*flex items-center[^"]*">\s*<span className="[^"]*shrink-0[^"]*">\s*<ShieldCheck aria-hidden="true" \/>/);
    expect(source).toMatch(/<\/span>\s*<span>\{copyKey \? t\(`\$\{copyKey\}\.title`\) : ""\}<\/span>\s*<\/DialogTitle>\s*<DialogDescription>/);
  });

  it("offers one login-page action with a safe return path for guests", () => {
    const request = {
      capability: "checkout" as const,
      decision: { allowed: false, blockerCode: "SIGN_IN_REQUIRED" as const, currentTier: null, requiredTier: null, nextAction: "sign_in" as const },
      nextPath: "/customer/profile?tab=account#preferences",
    };
    expect(customerCapabilityRecoveryActions(request)).toEqual([
      { href: "/login?next=%2Fcustomer%2Fprofile%3Ftab%3Daccount%23preferences", copyKey: "ui.capabilityGate.blockers.SIGN_IN_REQUIRED" },
    ]);
    expect(customerCapabilityRecoveryHrefs({ ...request, nextPath: "//attacker.test" })).toEqual([
      "/login?next=%2Fcustomer",
    ]);
    expect(customerCapabilityRecoveryActions({ ...request, decision: { ...request.decision, blockerCode: "EMAIL_VERIFICATION_REQUIRED", nextAction: "verify_email" } })).toHaveLength(1);
  });

  it("routes only to the exact recovery step while retaining safe intent", () => {
    expect(customerCapabilityRecoveryHref({
      capability: "checkout",
      decision: {
        allowed: false,
        blockerCode: "PHONE_VERIFICATION_REQUIRED",
        qualificationPaths: [{ type: "phone", href: "/customer/phone" }],
        entitlementGeneration: 1,
        source: "hard_guard",
        currentTier: null,
        requiredTier: null,
        nextAction: "verify_phone",
      },
      nextPath: "/customer/checkout?cart=1",
    })).toBe("/customer/phone?capability=checkout&next=%2Fcustomer%2Fcheckout%3Fcart%3D1");
  });

  it("uses login for sign-in and email recovery, and KYC for review states", () => {
    expect(customerCapabilityRecoveryHref({
      capability: "withdrawal",
      decision: {
        allowed: false,
        blockerCode: "SIGN_IN_REQUIRED",
        qualificationPaths: [],
        entitlementGeneration: 0,
        source: "hard_guard",
        currentTier: null,
        requiredTier: "kyc_verified",
        nextAction: "sign_in",
      },
      nextPath: "/customer/wallet",
    })).toBe("/login?next=%2Fcustomer%2Fwallet");

    expect(customerCapabilityRecoveryHref({
      capability: "withdrawal",
      decision: {
        allowed: false,
        blockerCode: "KYC_PENDING",
        qualificationPaths: [{ type: "kyc", href: "/customer/kyc" }],
        entitlementGeneration: 2,
        source: "hard_guard",
        currentTier: null,
        requiredTier: null,
        nextAction: "wait_for_kyc",
      },
      nextPath: "/customer/wallet",
    })).toBe("/customer/kyc?capability=withdrawal&next=%2Fcustomer%2Fwallet");
  });

  it("renders a recovery action for each safe qualification path and rejects external next", () => {
    expect(customerCapabilityRecoveryHrefs({
      capability: "recommendation.submit",
      decision: {
        capability: "recommendation.submit",
        allowed: false,
        blockerCode: "PROFILE_OR_KYC_REQUIRED",
        qualificationPaths: [
          { type: "profile", href: "/customer/profile" },
          { type: "kyc", href: "/customer/kyc" },
        ],
        entitlementGeneration: 3,
        source: "hard_guard",
        currentTier: null,
        requiredTier: null,
        nextAction: "complete_profile",
      },
      nextPath: "https://untrusted.example/steal",
    })).toEqual([
      "/customer/profile?capability=recommendation.submit&next=%2Fcustomer",
      "/customer/kyc?capability=recommendation.submit&next=%2Fcustomer",
    ]);
  });

  it("uses distinct translated CTAs for Profile-or-KYC qualification paths", () => {
    const actions = customerCapabilityRecoveryActions({
      capability: "recommendation.submit",
      decision: {
        capability: "recommendation.submit", allowed: false, blockerCode: "PROFILE_OR_KYC_REQUIRED",
        qualificationPaths: [{ type: "profile", href: "/customer/profile" }, { type: "kyc", href: "/customer/kyc" }],
        entitlementGeneration: 3, source: "hard_guard", currentTier: null, requiredTier: null, nextAction: "complete_profile",
      },
      nextPath: "/customer/recommendations",
    });

    expect(actions.map((action) => action.copyKey)).toEqual([
      "ui.capabilityGate.blockers.PROFILE_COMPLETION_REQUIRED",
      "ui.capabilityGate.blockers.KYC_REQUIRED",
    ]);
  });

  it("maps stable blocker codes to localized copy keys", () => {
    expect(capabilityGateCopyKey("PROFILE_COMPLETION_REQUIRED"))
      .toBe("ui.capabilityGate.blockers.PROFILE_COMPLETION_REQUIRED");
    expect(capabilityGateCopyKey("PROFILE_OR_KYC_REQUIRED"))
      .toBe("ui.capabilityGate.blockers.PROFILE_OR_KYC_REQUIRED");
  });
});
