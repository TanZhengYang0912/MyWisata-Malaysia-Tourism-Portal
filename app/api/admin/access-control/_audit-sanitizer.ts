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
  "subjectType",
  "subjectId",
  "effect",
  "status",
  "effectiveFrom",
  "effectiveUntil",
  "generation",
  "traceReference",
  "reason",
]);

function redactAuditText(value: string) {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[redacted-email]")
    .replace(/(?:\+\d[\d\s().-]{7,}\d)/g, "[redacted-phone]")
    .replace(/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9_-]+\b/g, "[redacted-secret]")
    .replace(/(?:private\/)?kyc\/[A-Za-z0-9_./-]+/gi, "[redacted-storage-path]");
}

function sanitizeAllowedValue(value: unknown): unknown {
  if (typeof value === "string") return redactAuditText(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.map(sanitizeAllowedValue).filter((item) => item !== undefined);
  if (isRecord(value)) return sanitizeAuditPayload(value);
  return undefined;
}

export function sanitizeAuditPayload(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const output: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (!AUDIT_PAYLOAD_ALLOWLIST.has(key)) continue;
    const sanitized = sanitizeAllowedValue(nestedValue);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return output;
}
