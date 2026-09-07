import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";
import { createServiceClient } from "@/lib/supabase/service";
import { apiFail, apiOk } from "@/lib/validation/schemas";
import { auditLogFiltersSchema, parseSearchParams } from "@/lib/validation/entitlement-schemas";
import { isRecord, validationFailure } from "@/app/api/admin/access-control/_shared";
import { sanitizeAuditPayload } from "@/app/api/admin/access-control/_audit-sanitizer";

export const dynamic = "force-dynamic";

function kycReviewKey(submissionId: string, action: string, createdAt: string) {
  return `${submissionId}:${action}:${createdAt}`;
}

export async function GET(request: Request) {
  const { db, user, response } = await requireAccessControlSuperAdmin();
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

  const rows = data ?? [];
  const kycSubmissionIds = [...new Set(rows
    .filter((row) => row.entity_type === "kyc_submission" && row.action.startsWith("kyc.") && row.entity_id)
    .map((row) => row.entity_id as string))];
  const kycReviews = new Map<string, Record<string, unknown>>();
  if (kycSubmissionIds.length > 0) {
    if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);
    const { data: isActiveGlobalSuperAdmin, error: activeGlobalError } = await db.rpc(
      "is_active_global_staff_super_admin",
      { p_user_id: user.id },
    );
    if (activeGlobalError) {
      return apiFail("AUTHORIZATION_UNAVAILABLE", "Unable to verify Access Control authority", 503);
    }
    if (isActiveGlobalSuperAdmin !== true) {
      return apiFail("FORBIDDEN", "Super Admin access required", 403);
    }
    const { data: reviewEvents, error: reviewError } = await createServiceClient()
      .from("kyc_review_events")
      .select("submission_id,from_status,to_status,action,reason_category,created_at")
      .in("submission_id", kycSubmissionIds);
    if (reviewError) return apiFail("AUDIT_LOG_UNAVAILABLE", "Unable to load the Audit Log", 500);
    for (const reviewEvent of reviewEvents ?? []) {
      if (typeof reviewEvent.submission_id !== "string"
          || typeof reviewEvent.action !== "string"
          || typeof reviewEvent.created_at !== "string") continue;
      kycReviews.set(
        kycReviewKey(reviewEvent.submission_id, reviewEvent.action, reviewEvent.created_at),
        reviewEvent,
      );
    }
  }

  const items = rows.map((row) => {
    const kycAction = row.action.startsWith("kyc.") ? row.action.slice(4) : "";
    const reviewEvent = row.entity_type === "kyc_submission"
      && typeof row.entity_id === "string"
      && typeof row.created_at === "string"
      ? kycReviews.get(kycReviewKey(row.entity_id, kycAction, row.created_at))
      : undefined;
    const beforeSource = reviewEvent
      ? { ...(isRecord(row.before_data) ? row.before_data : {}), status: reviewEvent.from_status }
      : row.before_data;
    const afterSource = reviewEvent
      ? {
          ...(isRecord(row.after_data) ? row.after_data : {}),
          status: reviewEvent.to_status,
          submissionId: reviewEvent.submission_id,
          reasonCode: reviewEvent.reason_category,
        }
      : row.after_data;
    const before = sanitizeAuditPayload(beforeSource);
    const after = sanitizeAuditPayload(afterSource);
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
