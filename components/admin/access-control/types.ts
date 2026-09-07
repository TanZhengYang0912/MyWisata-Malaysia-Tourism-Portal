export type AccessControlTabId = "overview" | "capabilities" | "policies" | "assignments" | "staff-roles" | "audit-log";

export type ApiError = { code?: string; message?: string };
export type ApiEnvelope<T> = { data?: T | null; error?: ApiError | null };
export type MutationReceipt = {
  auditEventId: string;
  generation: number;
  capabilityId?: string;
  capabilityKey?: string;
  policyId?: string;
  policyVersionId?: string;
  assignmentId?: string;
  roleId?: string;
};

export type StaffPermissionRecord = {
  id: string;
  key: string;
  module: string;
  action: string;
  description: string | null;
  isSystem?: boolean;
};

export type StaffRoleRecord = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissionKeys: string[];
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type StaffRoleAssignmentRecord = {
  id: string;
  roleId: string;
  userId: string;
  assignedBy: string | null;
  revokedAt: string | null;
  createdAt: string | null;
};

export type StaffRoleCandidate = {
  id: string;
  email: string;
  name: string;
  roles: string[];
};

export type StaffEmployeeRecord = {
  id: string;
  email: string;
  name: string;
  status: string;
  assignments: Array<{ id: string; roleId: string; createdAt: string | null }>;
};

export type StaffInvitationRecord = {
  id: string;
  invitedEmail: string;
  roleName: string;
  permissionKeys: string[];
  status: "pending" | "accepted" | "revoked";
  deliveryStatus: "pending" | "sending" | "sent" | "failed";
  sendAttemptCount: number;
  expiresAt: string;
  createdAt?: string | null;
  acceptedAt?: string | null;
  revokedAt?: string | null;
};

export type PageResult<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  generation?: number;
};

export type CapabilityRecord = {
  key: string;
  category: string;
  riskLevel: string;
  customerVisible: boolean;
  manuallyAssignable: boolean;
  enabled: boolean;
  createdAt: string | null;
  updatedAt: string | null;
};

export type PolicySummary = {
  id: string;
  key: string;
  capabilityKey: string;
  name: string;
  scope: string;
  createdAt: string | null;
  latestVersion: PolicyVersionSummary | null;
  versionCount: number;
};

export type PolicyRequirement = {
  alternative_group?: number;
  alternativeGroup?: number;
  fact_key?: string;
  factKey?: string;
  operator?: string;
  expected_value?: unknown;
  expectedValue?: unknown;
};

export type PolicyVersionSummary = {
  id: string;
  version: number;
  status: string;
  effect: string;
  effectiveFrom: string | null;
  effectiveUntil: string | null;
  createdBy?: string | null;
  approvedBy?: string | null;
  createdAt?: string | null;
  activatedAt?: string | null;
  requirements?: PolicyRequirement[];
  approvals?: Record<string, unknown>[];
};

export type AssignmentRecord = {
  id: string;
  subjectType: string;
  subjectId: string;
  capabilityKey: string;
  effect: string;
  startsAt: string;
  expiresAt: string | null;
  reason: string;
  grantedBy: string | null;
  revokedBy: string | null;
  revokedAt: string | null;
  createdAt: string;
  status: string;
};

export type AuditRecord = {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
};

export type AuditFocus = { eventId: string; entityId?: string | null };
export type EntityFocus = { tab: Exclude<AccessControlTabId, "overview" | "audit-log">; id: string };

export function buildAccessControlQuery(filters: Record<string, string | number | boolean | null | undefined>) {
  const searchParams = new URLSearchParams();
  for (const [key, rawValue] of Object.entries(filters)) {
    const value = typeof rawValue === "string" ? rawValue.trim() : rawValue;
    if (value === "" || value === null || value === undefined) continue;
    searchParams.set(key, String(value));
  }
  return searchParams.toString();
}

export function focusTargetForAuditEvent(entityType: string, entityId: string | null): EntityFocus | null {
  if (!entityId) return null;
  if (entityType === "entitlement_capability") return { tab: "capabilities", id: entityId };
  if (entityType === "entitlement_policy" || entityType === "entitlement_policy_version") return { tab: "policies", id: entityId };
  if (entityType === "entitlement_assignment") return { tab: "assignments", id: entityId };
  return null;
}

export function errorMessage(body: ApiEnvelope<unknown>, fallback: string) {
  return body.error?.message?.trim() || fallback;
}
