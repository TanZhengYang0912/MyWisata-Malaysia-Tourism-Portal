import "server-only";

import { createHmac } from "node:crypto";

import { isCapabilityKey, type CapabilityKey } from "@/lib/entitlements/types";

export const SHADOW_AUDIT_ACTION = "entitlement.shadow_evaluation" as const;

export type ApprovedShadowTransition = "profile_independent" | "kyc_independent";
export type ShadowClassification =
  | "parity"
  | "expected_change"
  | "blocking_denial"
  | "blocking_overgrant";

export interface ShadowEvaluationInput {
  userId: string;
  capability: CapabilityKey;
  legacyAllowed: boolean;
  entitlementAllowed: boolean;
  entitlementGeneration: number;
  approvedTransition: ApprovedShadowTransition | null;
}

export interface ShadowEvaluationTelemetry {
  userHash: string;
  capability: CapabilityKey;
  legacyAllowed: boolean;
  entitlementAllowed: boolean;
  classification: ShadowClassification;
  blocking: boolean;
  entitlementGeneration: number;
}

const EXPECTED_CAPABILITIES: Record<ApprovedShadowTransition, ReadonlySet<CapabilityKey>> = {
  profile_independent: new Set(["recommendation.submit", "affiliate.limited"]),
  kyc_independent: new Set([
    "recommendation.submit",
    "affiliate.full",
    "affiliate.earn_commission",
    "wallet.request_withdrawal",
  ]),
};

function shadowHashSecret(): string {
  const secret = process.env.ENTITLEMENT_SHADOW_HASH_SECRET;
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("shadow_hash_secret_unavailable");
  }
  return secret;
}

function classify(input: ShadowEvaluationInput): ShadowClassification {
  if (input.legacyAllowed === input.entitlementAllowed) return "parity";
  if (input.legacyAllowed && !input.entitlementAllowed) return "blocking_denial";
  if (input.approvedTransition
      && EXPECTED_CAPABILITIES[input.approvedTransition].has(input.capability)) {
    return "expected_change";
  }
  return "blocking_overgrant";
}

export function compareShadowEvaluation(
  input: ShadowEvaluationInput,
): ShadowEvaluationTelemetry {
  if (!input.userId
      || !isCapabilityKey(input.capability)
      || typeof input.legacyAllowed !== "boolean"
      || typeof input.entitlementAllowed !== "boolean"
      || !Number.isSafeInteger(input.entitlementGeneration)
      || input.entitlementGeneration < 0) {
    throw new Error("shadow_evaluation_invalid");
  }

  const classification = classify(input);
  const userHash = createHmac("sha256", shadowHashSecret())
    .update(input.userId, "utf8")
    .digest("hex");

  return {
    userHash,
    capability: input.capability,
    legacyAllowed: input.legacyAllowed,
    entitlementAllowed: input.entitlementAllowed,
    classification,
    blocking: classification === "blocking_denial" || classification === "blocking_overgrant",
    entitlementGeneration: input.entitlementGeneration,
  };
}
