import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";
import { apiFail, apiOk } from "@/lib/validation/schemas";
import { auditLogFiltersSchema, parseSearchParams } from "@/lib/validation/entitlement-schemas";
import { validationFailure } from "@/app/api/admin/access-control/_shared";
import { sanitizeAuditPayload } from "@/app/api/admin/access-control/_audit-sanitizer";

export const dynamic = "force-dynamic";

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
