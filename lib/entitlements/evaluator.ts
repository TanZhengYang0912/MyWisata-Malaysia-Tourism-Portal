import {
  hasEligibleCustomerRole,
  hasWithdrawalApprovalRole,
  QUALIFICATION_PATH,
} from "@/lib/entitlements/facts";
import type {
  CapabilityKey,
  EntitlementBlockerCode,
  EntitlementDecision,
  PolicyMatch,
  QualificationPath,
  VerificationFacts,
} from "@/lib/entitlements/types";
import { isCapabilityKey } from "@/lib/entitlements/types";

const CUSTOMER_CAPABILITIES = new Set<CapabilityKey>([
  "platform.browse",
  "commerce.booking",
  "commerce.purchase",
  "commerce.checkout",
  "ai.basic_recommendation",
  "recommendation.submit",
  "affiliate.limited",
  "affiliate.full",
  "affiliate.earn_commission",
  "wallet.request_withdrawal",
]);

const PHONE_CAPABILITIES = new Set<CapabilityKey>([
  "commerce.booking",
  "commerce.purchase",
  "commerce.checkout",
  "ai.basic_recommendation",
]);

const KYC_CAPABILITIES = new Set<CapabilityKey>([
  "affiliate.full",
  "affiliate.earn_commission",
  "wallet.request_withdrawal",
]);

function denied(
  capability: CapabilityKey,
  blockerCode: EntitlementBlockerCode,
  qualificationPaths: QualificationPath[] = [],
): EntitlementDecision {
  return {
    capability,
    allowed: false,
    blockerCode,
    qualificationPaths,
    entitlementGeneration: 0,
    source: "hard_guard",
  };
}

function kycBlocker(
  facts: VerificationFacts,
  capability: CapabilityKey,
): EntitlementDecision | null {
  switch (facts.kycStatus) {
    case "approved":
      return null;
    case "pending":
      return denied(capability, "KYC_PENDING", [QUALIFICATION_PATH.kyc]);
    case "rejected":
      return denied(capability, "KYC_RESUBMISSION_REQUIRED", [QUALIFICATION_PATH.kyc]);
    default:
      return denied(capability, "KYC_REQUIRED", [QUALIFICATION_PATH.kyc]);
  }
}

export function hardGuardDecision(
  facts: VerificationFacts,
  capability: CapabilityKey,
): EntitlementDecision | null {
  if (capability === "wallet.approve_withdrawal") {
    return hasWithdrawalApprovalRole(facts)
      ? null
      : denied(capability, "ENTITLEMENT_DENIED");
  }

  if (CUSTOMER_CAPABILITIES.has(capability) && !facts.emailVerified) {
    return denied(capability, "EMAIL_VERIFICATION_REQUIRED", [QUALIFICATION_PATH.email]);
  }

  if (PHONE_CAPABILITIES.has(capability) && !facts.phoneVerified) {
    return denied(capability, "PHONE_VERIFICATION_REQUIRED", [QUALIFICATION_PATH.phone]);
  }

  if (capability === "recommendation.submit" && !facts.profileComplete && facts.kycStatus !== "approved") {
    return denied(capability, "PROFILE_OR_KYC_REQUIRED", [
      QUALIFICATION_PATH.profile,
      QUALIFICATION_PATH.kyc,
    ]);
  }

  if (capability === "affiliate.limited") {
    if (!hasEligibleCustomerRole(facts) || facts.kycStatus === "approved") {
      return denied(capability, "ENTITLEMENT_DENIED");
    }
    if (!facts.profileComplete) {
      return denied(capability, "PROFILE_REQUIRED", [QUALIFICATION_PATH.profile]);
    }
  }

  if (KYC_CAPABILITIES.has(capability)) {
    if (!hasEligibleCustomerRole(facts)) {
      return denied(capability, "ENTITLEMENT_DENIED");
    }
    return kycBlocker(facts, capability);
  }

  return null;
}

export function evaluateEntitlementDecision(
  facts: VerificationFacts,
  capability: CapabilityKey,
  match: PolicyMatch,
): EntitlementDecision {
  if (!isCapabilityKey(capability)) {
    return {
      capability,
      allowed: false,
      blockerCode: "ENTITLEMENT_DENIED",
      qualificationPaths: [],
      entitlementGeneration: match.entitlementGeneration,
      source: "default_deny",
    };
  }

  if (facts.accountStatus !== "active") {
    return {
      ...denied(capability, "ACCOUNT_RESTRICTED"),
      entitlementGeneration: match.entitlementGeneration,
    };
  }

  const hardGuard = hardGuardDecision(facts, capability);
  if (hardGuard) {
    return { ...hardGuard, entitlementGeneration: match.entitlementGeneration };
  }

  if (match.unavailable) {
    return {
      capability,
      allowed: false,
      blockerCode: "POLICY_UNAVAILABLE",
      qualificationPaths: [],
      entitlementGeneration: match.entitlementGeneration,
      source: "default_deny",
    };
  }

  if (match.effect === "deny") {
    return {
      capability,
      allowed: false,
      blockerCode: "ENTITLEMENT_DENIED",
      qualificationPaths: [],
      entitlementGeneration: match.entitlementGeneration,
      source: match.source,
    };
  }

  if (match.effect === "allow") {
    return {
      capability,
      allowed: true,
      blockerCode: null,
      qualificationPaths: [],
      entitlementGeneration: match.entitlementGeneration,
      source: match.source,
    };
  }

  return {
    capability,
    allowed: false,
    blockerCode: "ENTITLEMENT_DENIED",
    qualificationPaths: [],
    entitlementGeneration: match.entitlementGeneration,
    source: "default_deny",
  };
}
