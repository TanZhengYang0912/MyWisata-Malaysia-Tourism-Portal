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

export type AccessControlPage = {
  items: Record<string, unknown>[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  generation: number;
};

function parseAccessControlPage(value: unknown): AccessControlPage | null {
  if (!isRecord(value) || !isRecordArray(value.items)
      || !Number.isSafeInteger(value.page) || (value.page as number) < 1
      || !Number.isSafeInteger(value.pageSize) || (value.pageSize as number) < 1
      || !Number.isSafeInteger(value.total) || (value.total as number) < 0
      || !Number.isSafeInteger(value.totalPages) || (value.totalPages as number) < 0
      || !Number.isSafeInteger(value.generation) || (value.generation as number) < 0) return null;
  return {
    items: value.items,
    page: value.page as number,
    pageSize: value.pageSize as number,
    total: value.total as number,
    totalPages: value.totalPages as number,
    generation: value.generation as number,
  };
}

export type AccessControlFilters = {
  page: number;
  pageSize: number;
  search?: string;
  category?: string;
  riskLevel?: string;
  enabled?: boolean;
  customerVisible?: boolean;
  key?: string;
  manuallyAssignable?: boolean;
  capabilityKey?: string;
  scope?: string;
  status?: string;
  subjectType?: string;
  effect?: string;
};

export async function listAccessControlCapabilities(filters: AccessControlFilters): Promise<AccessControlPage> {
  return callRpc("list_access_control_capabilities", {
    p_page: filters.page,
    p_page_size: filters.pageSize,
    p_search: filters.search ?? "",
    p_category: filters.category ?? null,
    p_risk_level: filters.riskLevel ?? null,
    p_enabled: filters.enabled ?? null,
    p_customer_visible: filters.customerVisible ?? null,
    p_key: filters.key ?? null,
    p_manually_assignable: filters.manuallyAssignable ?? null,
  }, parseAccessControlPage);
}

export async function listAccessControlPolicies(filters: AccessControlFilters): Promise<AccessControlPage> {
  return callRpc("list_access_control_policies", {
    p_page: filters.page,
    p_page_size: filters.pageSize,
    p_search: filters.search ?? "",
    p_capability_key: filters.capabilityKey ?? null,
    p_scope: filters.scope ?? null,
    p_status: filters.status ?? null,
  }, parseAccessControlPage);
}

export async function listAccessControlAssignments(filters: AccessControlFilters): Promise<AccessControlPage> {
  return callRpc("list_access_control_assignments", {
    p_page: filters.page,
    p_page_size: filters.pageSize,
    p_search: filters.search ?? "",
    p_subject_type: filters.subjectType ?? null,
    p_capability_key: filters.capabilityKey ?? null,
    p_effect: filters.effect ?? null,
    p_status: filters.status ?? null,
  }, parseAccessControlPage);
}

export async function getAccessControlOverview(): Promise<Record<string, unknown>> {
  return callRpc("get_access_control_overview", {}, (value) => isRecord(value) ? value : null);
}

export async function listAccessControlPolicyVersions(input: {
  policyId: string;
  pageSize: number;
  beforeVersion?: number;
}): Promise<Record<string, unknown>> {
  return callRpc("list_access_control_policy_versions", {
    p_policy_id: input.policyId,
    p_page_size: input.pageSize,
    p_before_version: input.beforeVersion ?? null,
  }, (value) => isRecord(value) ? value : null);
}

export async function getAccessControlGeneration(): Promise<number> {
  return callRpc("get_access_control_generation", {}, (value) =>
    Number.isSafeInteger(value) && (value as number) >= 0 ? value as number : null);
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
