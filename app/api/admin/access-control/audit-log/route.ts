import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";
import { apiFail, apiOk } from "@/lib/validation/schemas";
import { auditLogFiltersSchema, parseSearchParams } from "@/lib/validation/entitlement-schemas";
import { isRecord, validationFailure } from "@/app/api/admin/access-control/_shared";

export const dynamic = "force-dynamic";

const AUDIT_PAYLOAD_ALLOWLIST = new Set([
  "capabilityKey",
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

export async function GET(request: Request) {
  const { db, response } = await requireAccessControlSuperAdmin();
  if (response) return response;
  const parsed = parseSearchParams(request.url, auditLogFiltersSchema);
  if (!parsed.success) return validationFailure();
  const filters = parsed.data;
  const offset = (filters.page - 1) * filters.pageSize;

  let query = db.from("audit_logs")
    .select("id,actor_id,action,entity_type,entity_id,before_data,after_data,created_at", { count: "exact" });
  if (filters.actorId) query = query.eq("actor_id", filters.actorId);
  if (filters.actionPrefix) {
    query = query.gte("action", filters.actionPrefix).lt("action", `${filters.actionPrefix}\uffff`);
  }
  if (filters.entityType) query = query.eq("entity_type", filters.entityType);
  if (filters.entityId) query = query.eq("entity_id", filters.entityId);
  if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
  if (filters.dateTo) query = query.lte("created_at", filters.dateTo);
  if (filters.capabilityKey) {
    query = query.or(`before_data->>capabilityKey.eq.${filters.capabilityKey},after_data->>capabilityKey.eq.${filters.capabilityKey}`);
  }
  if (filters.policyId) {
    query = query.or(`before_data->>policyId.eq.${filters.policyId},after_data->>policyId.eq.${filters.policyId}`);
  }
  if (filters.traceReference) {
    query = query.or(`before_data->>traceReference.eq.${filters.traceReference},after_data->>traceReference.eq.${filters.traceReference}`);
  }

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(offset, offset + filters.pageSize - 1);
  if (error) return apiFail("AUDIT_LOG_UNAVAILABLE", "Unable to load the Audit Log", 500);

  const items = (data ?? []).map((row) => {
    const before = sanitizeAuditPayload(row.before_data);
    const after = sanitizeAuditPayload(row.after_data);
    return {
      id: row.id,
      actorId: row.actor_id,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      before,
      after,
      reason: typeof after?.reason === "string"
        ? after.reason
        : typeof before?.reason === "string" ? before.reason : null,
      createdAt: row.created_at,
    };
  });
  const total = count ?? items.length;

  return apiOk({
    items,
    page: filters.page,
    pageSize: filters.pageSize,
    total,
    totalPages: Math.ceil(total / filters.pageSize),
  });
}
