import {
  type CustomerCapability,
  type CustomerCapabilityBlocker,
  type CustomerCapabilityDecision,
  type CustomerCapabilityNextAction,
} from "@/lib/auth/customer-capabilities";
import { isCapabilityKey, type QualificationPath } from "@/lib/entitlements/types";

const BLOCKER_CODES: readonly CustomerCapabilityBlocker[] = [
  "SIGN_IN_REQUIRED",
  "EMAIL_VERIFICATION_REQUIRED",
  "PHONE_VERIFICATION_REQUIRED",
  "PROFILE_OR_KYC_REQUIRED",
  "PROFILE_REQUIRED",
  "KYC_REQUIRED",
  "KYC_PENDING",
  "KYC_RESUBMISSION_REQUIRED",
  "ENTITLEMENT_DENIED",
  "ACCOUNT_RESTRICTED",
  "POLICY_UNAVAILABLE",
  "VENDOR_AFFILIATE_INELIGIBLE",
];

export type ParsedCustomerCapabilityError = {
  capability: CustomerCapability;
  decision: CustomerCapabilityDecision;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isQualificationPath(value: unknown): value is QualificationPath {
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.href !== "string") return false;
  if (value.type === "email" || value.type === "profile") return value.href === "/customer/profile";
  if (value.type === "phone") return value.href === "/customer/phone";
  return value.type === "kyc" && value.href === "/customer/kyc";
}

function nextActionFor(blockerCode: CustomerCapabilityBlocker): CustomerCapabilityNextAction {
  switch (blockerCode) {
    case "EMAIL_VERIFICATION_REQUIRED": return "verify_email";
    case "PHONE_VERIFICATION_REQUIRED": return "verify_phone";
    case "PROFILE_OR_KYC_REQUIRED":
    case "PROFILE_REQUIRED":
    case "PROFILE_COMPLETION_REQUIRED": return "complete_profile";
    case "KYC_REQUIRED": return "submit_kyc";
    case "KYC_PENDING": return "wait_for_kyc";
    case "KYC_RESUBMISSION_REQUIRED": return "resubmit_kyc";
    case "SIGN_IN_REQUIRED": return "sign_in";
    default: return "none";
  }
}

export function parseCustomerCapabilityError(
  payload: unknown,
): ParsedCustomerCapabilityError | null {
  if (!isRecord(payload) || !isRecord(payload.error)) return null;
  const { code, details } = payload.error;
  if (!BLOCKER_CODES.includes(code as CustomerCapabilityBlocker) || !isRecord(details)) {
    return null;
  }

  const { capability, blockerCode, qualificationPaths, entitlementGeneration } = details;
  if (
    typeof capability !== "string"
    || !isCapabilityKey(capability)
    || blockerCode !== code
    || !Array.isArray(qualificationPaths)
    || !qualificationPaths.every(isQualificationPath)
    || !Number.isSafeInteger(entitlementGeneration)
    || (entitlementGeneration as number) < 0
  ) {
    return null;
  }

  return {
    capability,
    decision: {
      allowed: false,
      blockerCode: code as CustomerCapabilityBlocker,
      qualificationPaths,
      entitlementGeneration: entitlementGeneration as number,
      source: "hard_guard",
      currentTier: null,
      requiredTier: null,
      nextAction: nextActionFor(code as CustomerCapabilityBlocker),
    },
  };
}
