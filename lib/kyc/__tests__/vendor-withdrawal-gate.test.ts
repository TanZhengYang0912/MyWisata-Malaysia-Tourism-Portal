import { describe, expect, it } from "vitest";
import { getVendorWithdrawalKycDecision } from "@/lib/kyc/vendor-withdrawal-gate";
import type { VerificationFacts } from "@/lib/entitlements/types";

function facts(kycStatus: VerificationFacts["kycStatus"]): VerificationFacts {
  return {
    emailVerified: true,
    phoneVerified: false,
    profileComplete: false,
    kycStatus,
    accountStatus: "active",
    roles: ["vendor_owner"],
  };
}

describe("Vendor withdrawal KYC gate", () => {
  it("allows an approved vendor to continue to the existing withdrawal flow", () => {
    expect(getVendorWithdrawalKycDecision(facts("approved"))).toEqual({
      capability: "wallet.request_withdrawal",
      allowed: true,
      blockerCode: null,
      qualificationPaths: [],
      entitlementGeneration: 0,
      source: "hard_guard",
      currentTier: null,
      requiredTier: null,
      nextAction: "none",
    });
  });

  it.each([
    ["pending", "KYC_PENDING", "wait_for_kyc"],
    ["rejected", "KYC_RESUBMISSION_REQUIRED", "resubmit_kyc"],
    ["unverified", "KYC_REQUIRED", "submit_kyc"],
  ] as const)("maps %s KYC to a distinct recovery decision", (kycStatus, blockerCode, nextAction) => {
    expect(getVendorWithdrawalKycDecision(facts(kycStatus))).toMatchObject({
      capability: "wallet.request_withdrawal",
      allowed: false,
      blockerCode,
      nextAction,
      qualificationPaths: [{ type: "kyc", href: "/vendor/kyc" }],
      source: "hard_guard",
    });
  });

  it("fails closed when authenticated verification facts are unavailable", () => {
    expect(getVendorWithdrawalKycDecision(null)).toMatchObject({
      capability: "wallet.request_withdrawal",
      allowed: false,
      blockerCode: "KYC_REQUIRED",
      nextAction: "submit_kyc",
      qualificationPaths: [{ type: "kyc", href: "/vendor/kyc" }],
    });
  });
});
