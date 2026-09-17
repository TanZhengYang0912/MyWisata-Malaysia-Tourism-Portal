import {
  CUSTOMER_CAPABILITY_KEY,
  type CustomerCapabilityDecision,
  type CustomerCapabilityNextAction,
} from "@/lib/auth/customer-capabilities";
import type {
  EntitlementBlockerCode,
  VerificationFacts,
} from "@/lib/entitlements/types";

const VENDOR_KYC_PATH = { type: "kyc", href: "/vendor/kyc" } as const;

function blockedDecision(
  blockerCode: EntitlementBlockerCode,
  nextAction: CustomerCapabilityNextAction,
): CustomerCapabilityDecision {
  return {
    capability: CUSTOMER_CAPABILITY_KEY.WITHDRAWAL,
    allowed: false,
    blockerCode,
    qualificationPaths: [VENDOR_KYC_PATH],
    entitlementGeneration: 0,
    source: "hard_guard",
    currentTier: null,
    requiredTier: null,
    nextAction,
  };
}

export function getVendorWithdrawalKycDecision(
  verificationFacts: VerificationFacts | null,
): CustomerCapabilityDecision {
  switch (verificationFacts?.kycStatus) {
    case "approved":
      return {
        capability: CUSTOMER_CAPABILITY_KEY.WITHDRAWAL,
        allowed: true,
        blockerCode: null,
        qualificationPaths: [],
        entitlementGeneration: 0,
        source: "hard_guard",
        currentTier: null,
        requiredTier: null,
        nextAction: "none",
      };
    case "pending":
      return blockedDecision("KYC_PENDING", "wait_for_kyc");
    case "rejected":
      return blockedDecision("KYC_RESUBMISSION_REQUIRED", "resubmit_kyc");
    default:
      return blockedDecision("KYC_REQUIRED", "submit_kyc");
  }
}
