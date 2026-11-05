import { isRecord } from "@/app/api/admin/access-control/_shared";

const AUDIT_PAYLOAD_ALLOWLIST = new Set([
  "capabilityKey",
  "category",
  "riskLevel",
  "customerVisible",
  "manuallyAssignable",
  "enabled",
  "policyId",
  "policyVersionId",
  "assignmentId",
  "invitationId",
  "roleId",
  "userId",
  "revoked",
  "submissionId",
  "subjectType",
  "subjectId",
  "effect",
  "status",
  "effectiveFrom",
  "effectiveUntil",
  "generation",
  "traceReference",
  "reasonCode",
  "roleName",
  "moduleKeys",
  "permissionKeys",
  "isActive",
  "expiresAt",
  "attempt",
]);

const DATABASE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const GOVERNANCE_NOTES = new Map([
  ["staff.role.created:staff_role", true],
  ["staff.role.updated:staff_role", true],
  ["staff.role.assigned:staff_role_assignment", true],
  ["staff.role.revoked:staff_role_assignment", true],
  ["staff.module.created:staff_module", true],
  ["staff.module.updated:staff_module", true],
]);
const PRIVATE_REASON_TERMS = /\b(?:address|alamat|passport|pasport|identity card|kad pengenalan|bank account|akaun bank|account number|routing number|phone|telefon|mobile|handphone|nric|ic number)\b|(?:地址|住址|护照|身份证|身分证|银行卡|银行账户|银行账号|电话号码|手机号码|手机号)/i;

function redactAuditText(value: string) {
  const identifiers: string[] = [];
  const protectedValue = value.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, (identifier) => {
    identifiers.push(identifier);
    return `AUDITUUIDTOKEN${identifiers.length - 1}END`;
  });
  return protectedValue
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(?:\+?60|0)1[0-9][\s().-]?\d{3,4}[\s().-]?\d{4}\b/g, "[redacted-phone]")
    .replace(/(?:\+\d[\d\s().-]{7,}\d)/g, "[redacted-phone]")
    .replace(/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9_-]+\b|\bwhsec_[A-Za-z0-9_-]+\b|\bBearer\s+[A-Za-z0-9._~-]+/gi, "[redacted-secret]")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}(?:\.[A-Za-z0-9_-]+){1,2}\b/g, "[redacted-token]")
    .replace(/\b\d{6}[- ]?\d{2}[- ]?\d{4}\b/g, "[redacted-id]")
    .replace(/(?<![0-9a-f-])\d{8,20}(?![0-9a-f-])/gi, "[redacted-number]")
    .replace(/(?:private\/)?kyc\/[A-Za-z0-9_./-]+/gi, "[redacted-storage-path]")
    .replace(/AUDITUUIDTOKEN(\d+)END/g, (_placeholder, index: string) => identifiers[Number(index)] ?? "[redacted-id]");
}

export function sanitizeGovernanceReason(action: string, entityType: string, note: unknown): string | null {
  if (!GOVERNANCE_NOTES.has(`${action}:${entityType}`) || typeof note !== "string") return null;
  const trimmed = note.trim();
  if (trimmed.length < 10 || trimmed.length > 500) return null;
  const sanitized = redactAuditText(trimmed);
  if (PRIVATE_REASON_TERMS.test(trimmed)) return null;
  if (/\b\d{1,5}\s+(?:jalan|lorong|persiaran|street|road|avenue|drive|lane)\b/i.test(trimmed)) return null;
  return sanitized;
}

function sanitizeAllowedValue(value: unknown): unknown {
  if (typeof value === "string") return redactAuditText(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.map(sanitizeAllowedValue).filter((item) => item !== undefined);
  if (isRecord(value)) return sanitizeAuditPayload(value);
  return undefined;
}

export function sanitizeAuditPayload(value: unknown, context?: { action: string; entityType: string }): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const output: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (!AUDIT_PAYLOAD_ALLOWLIST.has(key)) continue;
    if (["assignmentId", "roleId", "userId", "invitationId"].includes(key)) {
      const staffAssignment = context?.entityType === "staff_role_assignment"
        && (context.action === "staff.role.assigned" || context.action === "staff.role.revoked");
      const staffRole = context?.entityType === "staff_role"
        && (context.action === "staff.role.created" || context.action === "staff.role.updated");
      const staffInvitation = context?.entityType === "staff_invitation"
        && context.action.startsWith("staff.invitation.");
      const allowed = key === "assignmentId" ? staffAssignment || DATABASE_UUID.test(String(nestedValue))
        : key === "roleId" ? staffAssignment || staffRole || staffInvitation
        : key === "invitationId" ? staffInvitation
        : staffAssignment;
      if (allowed && typeof nestedValue === "string" && DATABASE_UUID.test(nestedValue)) output[key] = nestedValue;
      continue;
    }
    if (key === "expiresAt") {
      const invitationEvent = context?.entityType === "staff_invitation"
        && ["staff.invitation.created", "staff.invitation.resent"].includes(context.action);
      if (invitationEvent && typeof nestedValue === "string"
        && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(nestedValue)
        && Number.isFinite(Date.parse(nestedValue))) output[key] = new Date(nestedValue).toISOString();
      continue;
    }
    if (key === "attempt") {
      if (context?.entityType === "staff_invitation" && context.action === "staff.invitation.resent"
        && typeof nestedValue === "number" && Number.isInteger(nestedValue) && nestedValue >= 1 && nestedValue <= 10_000) output[key] = nestedValue;
      continue;
    }
    if (key === "revoked") {
      if (context?.action === "staff.role.revoked" && context.entityType === "staff_role_assignment" && typeof nestedValue === "boolean") output[key] = nestedValue;
      continue;
    }
    if (key === "roleName") {
      if (typeof nestedValue === "string" && nestedValue.length <= 100) output[key] = redactAuditText(nestedValue);
      continue;
    }
    if (key === "isActive") {
      if (typeof nestedValue === "boolean") output[key] = nestedValue;
      continue;
    }
    if (key === "moduleKeys" || key === "permissionKeys") {
      const pattern = key === "moduleKeys" ? /^[a-z][a-z0-9_]{0,63}$/ : /^[a-z][a-z0-9_.:-]{0,127}$/;
      if (Array.isArray(nestedValue) && nestedValue.length <= 100
        && nestedValue.every((item): item is string => typeof item === "string" && pattern.test(item))) {
        output[key] = [...new Set(nestedValue)].sort();
      }
      continue;
    }
    const sanitized = sanitizeAllowedValue(nestedValue);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}
