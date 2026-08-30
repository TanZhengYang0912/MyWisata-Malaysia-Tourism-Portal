import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { CapabilityKey } from "@/lib/entitlements/types";

export type EntitlementFactKey =
  | "email_verified"
  | "phone_verified"
  | "profile_complete"
  | "kyc_status"
  | "account_status"
  | "role"
  | "plan"
  | "partner";

export type EntitlementOperator = "eq" | "not_eq" | "contains";
export type EntitlementJsonScalar = boolean | string | number;

export interface PolicyRequirementInput {
  alternativeGroup: number;
  factKey: EntitlementFactKey;
  operator: EntitlementOperator;
  expectedValue: EntitlementJsonScalar | EntitlementJsonScalar[];
}

export interface CreatePolicyVersionInput {
  policyId: string;
  effect: "allow" | "deny";
  effectiveFrom: string;
  effectiveUntil: string | null;
  requirements: PolicyRequirementInput[];
  reason: string;
}

export interface AssignmentInput {
  subjectType: "user" | "role" | "plan" | "partner";
  subjectId: string;
  capabilityKey: CapabilityKey;
  effect: "allow" | "deny";
  startsAt: string;
  expiresAt: string | null;
  reason: string;
}

export interface UpdateCapabilityInput {
  key: CapabilityKey;
  category: "platform" | "commerce" | "ai" | "recommendation" | "affiliate" | "wallet";
  riskLevel: "low" | "medium" | "high" | "critical";
  customerVisible: boolean;
  manuallyAssignable: boolean;
  enabled: boolean;
  reason: string;
}

export interface AccessControlState {
  capabilities: Record<string, unknown>[];
  policies: Record<string, unknown>[];
  policyVersions: Record<string, unknown>[];
  policyRequirements: Record<string, unknown>[];
  approvals: Record<string, unknown>[];
  assignments: Record<string, unknown>[];
  generation: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRecordArray(value: unknown): value is Record<string, unknown>[] {
  return Array.isArray(value) && value.every(isRecord);
}

function parseAccessControlState(value: unknown): AccessControlState | null {
  if (!isRecord(value)
      || !isRecordArray(value.capabilities)
      || !isRecordArray(value.policies)
      || !isRecordArray(value.policyVersions)
      || !isRecordArray(value.policyRequirements)
      || !isRecordArray(value.approvals)
      || !isRecordArray(value.assignments)
      || !Number.isSafeInteger(value.generation)
      || (value.generation as number) < 0) {
    return null;
  }

  return {
    capabilities: value.capabilities,
    policies: value.policies,
    policyVersions: value.policyVersions,
    policyRequirements: value.policyRequirements,
    approvals: value.approvals,
    assignments: value.assignments,
    generation: value.generation as number,
  };
}

function isUuid(value: unknown): value is string {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function callRpc<T>(
  name: string,
  params: Record<string, unknown>,
  parse: (value: unknown) => T | null,
): Promise<T> {
  const db = await createClient();
  const { data, error } = await db.rpc(name, params);
  if (error) throw new Error(error.message || "entitlement_rpc_failed");

  const parsed = parse(data);
  if (parsed === null) throw new Error("entitlement_rpc_invalid_response");
  return parsed;
}

async function callVoidRpc(name: string, params: Record<string, unknown>): Promise<void> {
  const db = await createClient();
  const { data, error } = await db.rpc(name, params);
  if (error) throw new Error(error.message || "entitlement_rpc_failed");
  if (data !== null && typeof data !== "undefined") {
    throw new Error("entitlement_rpc_invalid_response");
  }
}

export async function listAccessControlState(): Promise<AccessControlState> {
  try {
    return await callRpc(
      "list_entitlement_access_control_state",
      {},
      parseAccessControlState,
    );
  } catch {
    throw new Error("policy_state_unavailable");
  }
}

export async function createPolicyVersion(input: CreatePolicyVersionInput): Promise<string> {
  return callRpc("create_entitlement_policy_version", {
    p_policy_id: input.policyId,
    p_effect: input.effect,
    p_effective_from: input.effectiveFrom,
    p_effective_until: input.effectiveUntil,
    p_requirements: input.requirements.map((requirement) => ({
      alternativeGroup: requirement.alternativeGroup,
      factKey: requirement.factKey,
      operator: requirement.operator,
      expectedValue: requirement.expectedValue,
    })),
    p_reason: input.reason,
  }, (value) => isUuid(value) ? value : null);
}

export async function approvePolicyVersion(versionId: string, reason: string): Promise<void> {
  return callVoidRpc("approve_entitlement_policy_version", {
    p_version_id: versionId,
    p_reason: reason,
  });
}

export async function activatePolicyVersion(versionId: string, reason: string): Promise<void> {
  return callVoidRpc("activate_entitlement_policy_version", {
    p_version_id: versionId,
    p_reason: reason,
  });
}

export async function rollbackEntitlementPolicy(
  policyId: string,
  targetVersion: number,
  reason: string,
): Promise<string> {
  return callRpc("rollback_entitlement_policy", {
    p_policy_id: policyId,
    p_target_version: targetVersion,
    p_reason: reason,
  }, (value) => isUuid(value) ? value : null);
}

export async function setEntitlementAssignment(input: AssignmentInput): Promise<string> {
  return callRpc("set_entitlement_assignment", {
    p_subject_type: input.subjectType,
    p_subject_id: input.subjectId,
    p_capability_key: input.capabilityKey,
    p_effect: input.effect,
    p_starts_at: input.startsAt,
    p_expires_at: input.expiresAt,
    p_reason: input.reason,
  }, (value) => isUuid(value) ? value : null);
}

export async function revokeEntitlementAssignment(
  assignmentId: string,
  reason: string,
): Promise<void> {
  return callVoidRpc("revoke_entitlement_assignment", {
    p_assignment_id: assignmentId,
    p_reason: reason,
  });
}

export async function updateEntitlementCapability(input: UpdateCapabilityInput): Promise<string> {
  return callRpc("update_entitlement_capability", {
    p_capability_key: input.key,
    p_category: input.category,
    p_risk_level: input.riskLevel,
    p_customer_visible: input.customerVisible,
    p_manually_assignable: input.manuallyAssignable,
    p_enabled: input.enabled,
    p_reason: input.reason,
  }, (value) => isUuid(value) ? value : null);
}
