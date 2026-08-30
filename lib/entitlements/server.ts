import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  isCapabilityKey,
  type CapabilityKey,
  type EntitlementBlockerCode,
  type EntitlementDecision,
  type QualificationPath,
} from "@/lib/entitlements/types";

const BLOCKER_CODES = new Set<EntitlementBlockerCode>([
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
]);

const SOURCES = new Set<NonNullable<EntitlementDecision["source"]>>([
  "hard_guard",
  "policy",
  "assignment",
  "default_deny",
]);

const QUALIFICATION_HREFS: Record<QualificationPath["type"], string> = {
  email: "/customer/profile",
  phone: "/customer/phone",
  profile: "/customer/profile",
  kyc: "/customer/kyc",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isQualificationPath(value: unknown): value is QualificationPath {
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.href !== "string") {
    return false;
  }

  return value.type in QUALIFICATION_HREFS
    && QUALIFICATION_HREFS[value.type as QualificationPath["type"]] === value.href;
}

export function parseEntitlementDecision(
  value: unknown,
  expectedCapability: CapabilityKey,
): EntitlementDecision | null {
  if (!isRecord(value)
      || typeof value.capability !== "string"
      || !isCapabilityKey(value.capability)
      || value.capability !== expectedCapability
      || typeof value.allowed !== "boolean"
      || !Array.isArray(value.qualificationPaths)
      || !value.qualificationPaths.every(isQualificationPath)
      || !Number.isSafeInteger(value.entitlementGeneration)
      || (value.entitlementGeneration as number) < 0
      || (value.source !== null && (typeof value.source !== "string" || !SOURCES.has(
        value.source as NonNullable<EntitlementDecision["source"]>,
      )))) {
    return null;
  }

  const blockerCode = value.blockerCode;
  if (blockerCode !== null
      && (typeof blockerCode !== "string" || !BLOCKER_CODES.has(blockerCode as EntitlementBlockerCode))) {
    return null;
  }

  if ((value.allowed && blockerCode !== null)
      || (!value.allowed && blockerCode === null)
      || (value.allowed && value.source !== "policy" && value.source !== "assignment")) {
    return null;
  }

  return {
    capability: value.capability,
    allowed: value.allowed,
    blockerCode: blockerCode as EntitlementBlockerCode | null,
    qualificationPaths: value.qualificationPaths,
    entitlementGeneration: value.entitlementGeneration as number,
    source: value.source as EntitlementDecision["source"],
  };
}

function unavailableDecision(capability: CapabilityKey): EntitlementDecision {
  return {
    capability,
    allowed: false,
    blockerCode: "POLICY_UNAVAILABLE",
    qualificationPaths: [],
    entitlementGeneration: 0,
    source: "default_deny",
  };
}

export async function resolveEffectiveCapability(
  userId: string,
  capability: CapabilityKey,
): Promise<EntitlementDecision> {
  try {
    const db = await createClient();
    const { data, error } = await db.rpc("resolve_user_capability", {
      p_user_id: userId,
      p_capability_key: capability,
    });

    if (error) return unavailableDecision(capability);
    return parseEntitlementDecision(data, capability) ?? unavailableDecision(capability);
  } catch {
    return unavailableDecision(capability);
  }
}
