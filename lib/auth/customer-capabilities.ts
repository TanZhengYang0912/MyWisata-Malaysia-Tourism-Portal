import { guestLoginHref, postLoginPath } from "@/lib/auth/guest-mode";
import { evaluateEntitlementDecision } from "@/lib/entitlements/evaluator";
import {
  CAPABILITY_KEYS,
  isCapabilityKey,
  type CapabilityKey,
  type EntitlementBlockerCode,
  type EntitlementDecision,
  type PolicyMatch,
  type QualificationPath,
  type VerificationFacts,
} from "@/lib/entitlements/types";
import type { Tier } from "@/lib/constants";

export const CUSTOMER_CAPABILITY_KEY = {
  CHECKOUT: "commerce.checkout",
  BASIC_AI: "ai.basic_recommendation",
  RECOMMENDATION_SUBMIT: "recommendation.submit",
  AFFILIATE_LIMITED: "affiliate.limited",
  AFFILIATE_FULL: "affiliate.full",
  WITHDRAWAL: "wallet.request_withdrawal",
} as const satisfies Record<string, CapabilityKey>;

type CustomerCapabilityAlias =
  | "BROWSE"
  | "ACCOUNT_MUTATION"
  | "CART_MUTATION"
  | keyof typeof CUSTOMER_CAPABILITY_KEY;

type LegacyCustomerCapability =
  | "browse"
  | "account_mutation"
  | "cart_mutation"
  | "checkout"
  | "basic_ai"
  | "recommendation_submit"
  | "affiliate_limited"
  | "affiliate_full"
  | "withdrawal";

const LEGACY_CAPABILITY_KEY: Record<LegacyCustomerCapability, CapabilityKey> = {
  browse: "platform.browse",
  account_mutation: "platform.browse",
  cart_mutation: "commerce.purchase",
  checkout: "commerce.checkout",
  basic_ai: "ai.basic_recommendation",
  recommendation_submit: "recommendation.submit",
  affiliate_limited: "affiliate.limited",
  affiliate_full: "affiliate.full",
  withdrawal: "wallet.request_withdrawal",
};

// Temporary customer-facing aliases. New code should depend on CapabilityKey.
export const CUSTOMER_CAPABILITY: Record<CustomerCapabilityAlias, CustomerCapability> = {
  BROWSE: "platform.browse",
  ACCOUNT_MUTATION: "platform.browse",
  CART_MUTATION: "commerce.purchase",
  ...CUSTOMER_CAPABILITY_KEY,
};

export type CustomerCapability = CapabilityKey | LegacyCustomerCapability;
export type CustomerCapabilityBlocker = EntitlementBlockerCode
  | "SIGN_IN_REQUIRED"
  | "PROFILE_COMPLETION_REQUIRED"
  | "VENDOR_AFFILIATE_INELIGIBLE";
export type CustomerCapabilityNextAction =
  | "none"
  | "sign_in"
  | "verify_email"
  | "verify_phone"
  | "complete_profile"
  | "submit_kyc"
  | "wait_for_kyc"
  | "resubmit_kyc";

export type CustomerCapabilityDecision = {
  allowed: boolean;
  blockerCode: CustomerCapabilityBlocker | null;
  currentTier: Tier | null;
  requiredTier: Tier | null;
  nextAction: CustomerCapabilityNextAction;
  capability?: CapabilityKey;
  qualificationPaths?: QualificationPath[];
  entitlementGeneration?: number;
  source?: EntitlementDecision["source"];
};

export type CustomerCapabilitySnapshot = Record<string, CustomerCapabilityDecision>;

// This accepts old call-site shapes only so staged migrations type-check. Values
// without every independent fact are rejected; it never reads a legacy tier.
export type CustomerViewer = VerificationFacts | Record<string, unknown> | null;

export type CustomerAccessDecision =
  | "allowed"
  | "sign_in_required"
  | "email_verification_required"
  | "phone_verification_required"
  | "profile_completion_required"
  | "kyc_required";

const BUILT_IN_ALLOW: PolicyMatch = {
  effect: "allow",
  source: "policy",
  entitlementGeneration: 0,
};

function isVerificationFacts(value: CustomerViewer): value is VerificationFacts {
  if (!value || typeof value !== "object") return false;
  return typeof value.emailVerified === "boolean"
    && typeof value.phoneVerified === "boolean"
    && typeof value.profileComplete === "boolean"
    && ["unverified", "pending", "approved", "rejected"].includes(value.kycStatus as string)
    && ["active", "suspended", "deleted"].includes(value.accountStatus as string)
    && Array.isArray(value.roles)
    && value.roles.every((role) => typeof role === "string");
}

function capabilityKey(capability: CustomerCapability): CapabilityKey | null {
  if (isCapabilityKey(capability)) {
    return capability;
  }
  return LEGACY_CAPABILITY_KEY[capability as LegacyCustomerCapability] ?? null;
}

function nextActionFor(blockerCode: CustomerCapabilityBlocker | null): CustomerCapabilityNextAction {
  switch (blockerCode) {
    case "EMAIL_VERIFICATION_REQUIRED":
      return "verify_email";
    case "PHONE_VERIFICATION_REQUIRED":
      return "verify_phone";
    case "PROFILE_OR_KYC_REQUIRED":
    case "PROFILE_REQUIRED":
    case "PROFILE_COMPLETION_REQUIRED":
      return "complete_profile";
    case "KYC_PENDING":
      return "wait_for_kyc";
    case "KYC_RESUBMISSION_REQUIRED":
      return "resubmit_kyc";
    case "KYC_REQUIRED":
      return "submit_kyc";
    case "SIGN_IN_REQUIRED":
      return "sign_in";
    default:
      return "none";
  }
}

function compatibilityDecision(decision: EntitlementDecision): CustomerCapabilityDecision {
  return {
    ...decision,
    currentTier: null,
    requiredTier: null,
    nextAction: nextActionFor(decision.blockerCode),
  };
}

function signInRequired(capability: CapabilityKey): CustomerCapabilityDecision {
  return {
    capability,
    allowed: false,
    blockerCode: "SIGN_IN_REQUIRED",
    qualificationPaths: [],
    entitlementGeneration: 0,
    source: "hard_guard",
    currentTier: null,
    requiredTier: null,
    nextAction: "sign_in",
  };
}

function unknownCapabilityDecision(): CustomerCapabilityDecision {
  return {
    allowed: false,
    blockerCode: "ENTITLEMENT_DENIED",
    qualificationPaths: [],
    entitlementGeneration: 0,
    source: "default_deny",
    currentTier: null,
    requiredTier: null,
    nextAction: "none",
  };
}

export function resolveCustomerCapability(
  viewer: CustomerViewer,
  capability: CustomerCapability,
): CustomerCapabilityDecision {
  const resolvedCapability = capabilityKey(capability);
  if (!resolvedCapability) return unknownCapabilityDecision();
  if (!isVerificationFacts(viewer)) return signInRequired(resolvedCapability);

  return compatibilityDecision(
    evaluateEntitlementDecision(viewer, resolvedCapability, BUILT_IN_ALLOW),
  );
}

export function resolveCustomerCapabilities(viewer: CustomerViewer): CustomerCapabilitySnapshot {
  const snapshot: CustomerCapabilitySnapshot = {};

  for (const [legacyCapability, stableCapability] of Object.entries(LEGACY_CAPABILITY_KEY)) {
    snapshot[legacyCapability] = resolveCustomerCapability(viewer, stableCapability);
  }
  for (const stableCapability of CAPABILITY_KEYS) {
    snapshot[stableCapability] = resolveCustomerCapability(viewer, stableCapability);
  }

  return snapshot;
}

export function resolveCustomerAccess(
  viewer: CustomerViewer,
  capability: CustomerCapability,
): CustomerAccessDecision {
  const decision = resolveCustomerCapability(viewer, capability);
  if (decision.allowed) return "allowed";

  switch (decision.blockerCode) {
    case "SIGN_IN_REQUIRED":
      return "sign_in_required";
    case "EMAIL_VERIFICATION_REQUIRED":
      return "email_verification_required";
    case "PHONE_VERIFICATION_REQUIRED":
      return "phone_verification_required";
    case "PROFILE_OR_KYC_REQUIRED":
    case "PROFILE_REQUIRED":
    case "PROFILE_COMPLETION_REQUIRED":
      return "profile_completion_required";
    default:
      return "kyc_required";
  }
}

export function customerAccessHref(
  decision: Exclude<CustomerAccessDecision, "allowed">,
  nextPath: string,
): string {
  const safeNext = postLoginPath(nextPath) ?? "/customer";
  if (decision === "sign_in_required") return guestLoginHref(safeNext);
  if (decision === "kyc_required") {
    return `/customer/kyc?next=${encodeURIComponent(safeNext)}`;
  }
  if (decision === "phone_verification_required") {
    return `/customer/phone?next=${encodeURIComponent(safeNext)}`;
  }
  return `/customer/profile?next=${encodeURIComponent(safeNext)}`;
}

export type { EntitlementBlockerCode } from "@/lib/entitlements/types";
