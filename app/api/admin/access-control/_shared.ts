import type { SupabaseClient } from "@supabase/supabase-js";

import { listAccessControlState } from "@/lib/entitlements/admin";
import { apiFail, apiOk } from "@/lib/validation/schemas";

export type AccessControlRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is AccessControlRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringField(row: AccessControlRecord, ...keys: string[]): string | null {
  for (const key of keys) {
    if (typeof row[key] === "string") return row[key] as string;
  }
  return null;
}

export function booleanField(row: AccessControlRecord, ...keys: string[]): boolean | null {
  for (const key of keys) {
    if (typeof row[key] === "boolean") return row[key] as boolean;
  }
  return null;
}

export function numberField(row: AccessControlRecord, ...keys: string[]): number | null {
  for (const key of keys) {
    if (typeof row[key] === "number" && Number.isFinite(row[key])) return row[key] as number;
  }
  return null;
}

export function paginate<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

export function validationFailure(details?: unknown) {
  return apiFail("VALIDATION_FAILED", "Request failed validation", 422, details);
}

export function accessControlFailure(error: unknown): Response {
  const message = error instanceof Error ? error.message : "access_control_failed";
  if (message.includes("super_admin_required")) {
    return apiFail("FORBIDDEN", "Super Admin access required", 403);
  }
  if (message.includes("self_approval_forbidden")) {
    return apiFail("SELF_APPROVAL_FORBIDDEN", "The policy creator cannot approve this version", 403);
  }
  if (message.includes("policy_state_unavailable") || message.includes("policy_unavailable")) {
    return apiFail("POLICY_STATE_UNAVAILABLE", "Access Control policy state is unavailable", 503);
  }
  if (message.includes("policy_version_not_found") || message.includes("policy_not_found")
      || message.includes("rollback_target_not_found") || message.includes("assignment_not_found")
      || message.includes("assignment_subject_not_found") || message.includes("capability_not_found")) {
    return apiFail("NOT_FOUND", "The requested Access Control record was not found", 404);
  }
  if (message.includes("policy_version_not_pending") || message.includes("policy_version_not_approved")
      || message.includes("policy_version_not_effective") || message.includes("rollback_target_expired")
      || message.includes("assignment_already_revoked") || message.includes("capability_not_manually_assignable")
      || message.includes("entitlement_assignments_no_unrevoked_overlap")) {
    return apiFail("CONFLICT", "The Access Control record is not in a valid state for this action", 409);
  }
  if (message.includes("policy_invalid") || message.includes("assignment_invalid")
      || message.includes("reason_required")) {
    return validationFailure();
  }
  return apiFail("ACCESS_CONTROL_FAILED", "Unable to complete the Access Control operation", 500);
}

export async function loadAccessControlStateResponse() {
  try {
    return { state: await listAccessControlState(), response: null };
  } catch (error) {
    return { state: null, response: accessControlFailure(error) };
  }
}

export async function mutationReceipt(
  db: SupabaseClient,
  actorId: string,
  action: string,
  entityId: string,
  data: Record<string, unknown>,
  status = 200,
) {
  const [{ data: auditEvent, error: auditError }, stateResult] = await Promise.all([
    db.from("audit_logs")
      .select("id")
      .eq("actor_id", actorId)
      .eq("action", action)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadAccessControlStateResponse(),
  ]);

  if (auditError || !auditEvent?.id) {
    return apiFail("AUDIT_EVENT_UNAVAILABLE", "The mutation completed but its audit event could not be resolved", 500);
  }
  if (stateResult.response || !stateResult.state) {
    return apiFail("POLICY_STATE_UNAVAILABLE", "The mutation completed but the current generation is unavailable", 503);
  }

  return apiOk({
    ...data,
    auditEventId: auditEvent.id,
    generation: stateResult.state.generation,
  }, { status });
}
