import {
  CAPABILITY_KEYS,
  isCapabilityKey,
  type CapabilityKey,
  type EntitlementDecision,
} from "@/lib/entitlements/types";
import { resolveEffectiveCapabilities, resolveEffectiveCapability } from "@/lib/entitlements/server";
import {
  type CustomerCapability,
  type CustomerCapabilityDecision,
  type CustomerCapabilityNextAction,
  type CustomerCapabilitySnapshot,
} from "@/lib/auth/customer-capabilities";
import { apiFail } from "@/lib/validation/schemas";

// This shape remains only to keep unconverted route call sites compiling while
// they migrate to the user-id resolver. It is deliberately not authorization
// input: tier-only state cannot prove a capability.
export type ServerCustomerCapabilityState = {
  tier?: unknown;
  kycStatus?: unknown;
  roles?: unknown;
};

const LEGACY_CAPABILITY_KEY: Record<string, CapabilityKey> = {
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

function capabilityKey(capability: CustomerCapability): CapabilityKey | null {
  if (isCapabilityKey(capability)) return capability;
  return LEGACY_CAPABILITY_KEY[capability] ?? null;
}

function nextActionFor(blockerCode: CustomerCapabilityDecision["blockerCode"]): CustomerCapabilityNextAction {
  switch (blockerCode) {
    case "EMAIL_VERIFICATION_REQUIRED": return "verify_email";
    case "PHONE_VERIFICATION_REQUIRED": return "verify_phone";
    case "PROFILE_OR_KYC_REQUIRED":
    case "PROFILE_REQUIRED": return "complete_profile";
    case "KYC_PENDING": return "wait_for_kyc";
    case "KYC_RESUBMISSION_REQUIRED": return "resubmit_kyc";
    case "KYC_REQUIRED": return "submit_kyc";
    case "SIGN_IN_REQUIRED": return "sign_in";
    default: return "none";
  }
}

function customerDecision(decision: EntitlementDecision): CustomerCapabilityDecision {
  return {
    ...decision,
    currentTier: null,
    requiredTier: null,
    nextAction: nextActionFor(decision.blockerCode),
  };
}

function unavailableDecision(capability: CustomerCapability): CustomerCapabilityDecision {
  const resolvedCapability = capabilityKey(capability);
  return {
    ...(resolvedCapability ? { capability: resolvedCapability } : {}),
    allowed: false,
    blockerCode: "POLICY_UNAVAILABLE",
    qualificationPaths: [],
    entitlementGeneration: 0,
    source: "default_deny",
    currentTier: null,
    requiredTier: null,
    nextAction: "none",
  };
}

export function resolveServerCustomerCapability(
  userId: string,
  capability: CustomerCapability,
): Promise<CustomerCapabilityDecision>;
export function resolveServerCustomerCapability(
  state: ServerCustomerCapabilityState,
  capability: CustomerCapability,
): CustomerCapabilityDecision;
export function resolveServerCustomerCapability(
  subject: string | ServerCustomerCapabilityState,
  capability: CustomerCapability,
): Promise<CustomerCapabilityDecision> | CustomerCapabilityDecision {
  const resolvedCapability = capabilityKey(capability);
  if (typeof subject !== "string" || !resolvedCapability) return unavailableDecision(capability);
  return resolveEffectiveCapability(subject, resolvedCapability).then(customerDecision);
}

async function resolveCanonicalSnapshot(userId: string): Promise<CustomerCapabilitySnapshot> {
  const decisions = await resolveEffectiveCapabilities(userId, CAPABILITY_KEYS);
  return Object.fromEntries(CAPABILITY_KEYS.map((capability) => [
    capability,
    customerDecision(decisions.get(capability) ?? {
      capability,
      allowed: false,
      blockerCode: "POLICY_UNAVAILABLE",
      qualificationPaths: [],
      entitlementGeneration: 0,
      source: "default_deny",
    }),
  ])) as CustomerCapabilitySnapshot;
}

function isValidGeneration(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value >= 0;
}

function sharedGeneration(snapshot: CustomerCapabilitySnapshot): number | null {
  const generations = CAPABILITY_KEYS.map((capability) => snapshot[capability]?.entitlementGeneration);
  if (!generations.every(isValidGeneration)) return null;
  return new Set(generations).size === 1 ? generations[0]! : null;
}

function unavailableSnapshot(generation: number): CustomerCapabilitySnapshot {
  return Object.fromEntries(CAPABILITY_KEYS.map((capability) => [
    capability,
    { ...unavailableDecision(capability), entitlementGeneration: generation },
  ])) as CustomerCapabilitySnapshot;
}

function withLegacyAliases(snapshot: CustomerCapabilitySnapshot): CustomerCapabilitySnapshot {
  for (const [legacyCapability, stableCapability] of Object.entries(LEGACY_CAPABILITY_KEY)) {
    snapshot[legacyCapability] = snapshot[stableCapability]!;
  }
  return snapshot;
}

export async function resolveServerCustomerCapabilities(
  userId: string,
): Promise<CustomerCapabilitySnapshot> {
  const firstSnapshot = await resolveCanonicalSnapshot(userId);
  const firstGeneration = sharedGeneration(firstSnapshot);
  if (firstGeneration !== null) return withLegacyAliases(firstSnapshot);

  const secondSnapshot = await resolveCanonicalSnapshot(userId);
  const secondGeneration = sharedGeneration(secondSnapshot);
  if (secondGeneration !== null) return withLegacyAliases(secondSnapshot);

  const safeGeneration = Math.max(
    0,
    ...CAPABILITY_KEYS.flatMap((capability) => [
      firstSnapshot[capability]?.entitlementGeneration,
      secondSnapshot[capability]?.entitlementGeneration,
    ]).filter(isValidGeneration),
  );

  return withLegacyAliases(unavailableSnapshot(safeGeneration));
}

export function customerCapabilityFailure(
  capability: CustomerCapability,
  decision: CustomerCapabilityDecision,
  message: string,
): Response | null {
  if (decision.allowed || !decision.blockerCode) return null;
  return apiFail(
    decision.blockerCode,
    message,
    decision.blockerCode === "SIGN_IN_REQUIRED" ? 401 : 403,
    {
      capability: capabilityKey(capability) ?? capability,
      blockerCode: decision.blockerCode,
      qualificationPaths: decision.qualificationPaths ?? [],
      entitlementGeneration: decision.entitlementGeneration ?? 0,
    },
  );
}
