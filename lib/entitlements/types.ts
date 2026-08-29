export const CAPABILITY_KEYS = [
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
  "wallet.approve_withdrawal",
] as const;

export type CapabilityKey = typeof CAPABILITY_KEYS[number];

export type VerificationFacts = {
  emailVerified: boolean;
  phoneVerified: boolean;
  profileComplete: boolean;
  kycStatus: "unverified" | "pending" | "approved" | "rejected";
  accountStatus: "active" | "suspended" | "deleted";
  roles: readonly string[];
};

export type QualificationPath = {
  type: "email" | "phone" | "profile" | "kyc";
  href: string;
};

export type EntitlementBlockerCode =
  | "EMAIL_VERIFICATION_REQUIRED"
  | "PHONE_VERIFICATION_REQUIRED"
  | "PROFILE_OR_KYC_REQUIRED"
  | "PROFILE_REQUIRED"
  | "KYC_REQUIRED"
  | "KYC_PENDING"
  | "KYC_RESUBMISSION_REQUIRED"
  | "ENTITLEMENT_DENIED"
  | "ACCOUNT_RESTRICTED"
  | "POLICY_UNAVAILABLE";

export type EntitlementDecision = {
  capability: CapabilityKey;
  allowed: boolean;
  blockerCode: EntitlementBlockerCode | null;
  qualificationPaths: QualificationPath[];
  entitlementGeneration: number;
  source: "hard_guard" | "policy" | "assignment" | "default_deny" | null;
};

export type PolicyMatch = {
  effect: "allow" | "deny" | null;
  source: "policy" | "assignment" | null;
  entitlementGeneration: number;
  unavailable?: boolean;
};
