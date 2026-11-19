import { z } from "zod";
import { apiFail, apiOk, databaseUuidSchema, parseBody } from "@/lib/validation/schemas";
import { authorizeVendor } from "@/lib/vendor-authorization";
import { approvedStall } from "@/lib/events/event-staff";

interface Props { params: Promise<{ vendorId: string; locationId: string; memberId: string }> }

const patchSchema = z.object({ action: z.enum(["approve", "restore"]) }).strict();

type MemberState = { id: string; approved_at: string | null; removed_at: string | null };

/**
 * PATCH { action }: the owner grants scan access.
 * - approve: a pending member (joined through the link) becomes active.
 * - restore: a removed member becomes active again; the link alone never does this.
 * Conditional updates make retries no-ops; a member in another state gets 409.
 * Granting access needs an approved stall at this location.
 */
export async function PATCH(request: Request, { params }: Props) {
  const { vendorId, locationId, memberId } = await params;
  if (!databaseUuidSchema.safeParse(locationId).success || !databaseUuidSchema.safeParse(memberId).success) {
    return apiFail("MEMBER_NOT_FOUND", "Staff member not found", 404);
  }
  const access = await authorizeVendor(vendorId, ["vendor_owner"], { allowEventVendor: true, requireApproved: true });
  if (!access.ok) return access.response;
  const parsed = await parseBody(request, patchSchema);
  if (!parsed.ok) return parsed.response;
  const { action } = parsed.data;
  const db = access.access.serviceDb;

  const { stall, error: stallError } = await approvedStall(db, vendorId, locationId);
  if (stallError) return apiFail("DB_ERROR", "Unable to update this staff member", 500);
  if (!stall) return apiFail("NOT_PARTICIPATING", "You have no approved stall at this location", 404);

  const now = new Date().toISOString();
  const base = db.from("event_staff_members")
    .update(action === "approve"
      ? { approved_at: now, approved_by: access.access.userId }
      : { removed_at: null, removed_by: null, approved_at: now, approved_by: access.access.userId })
    .eq("id", memberId).eq("vendor_id", vendorId).eq("event_location_id", locationId);
  const { data: updated, error } = await (action === "approve"
    ? base.is("approved_at", null).is("removed_at", null)
    : base.not("removed_at", "is", null)
  ).select("id");
  if (error) return apiFail("DB_ERROR", "Unable to update this staff member", 500);

  if ((updated ?? []).length === 0) {
    // Retry after success (already active) is fine; anything else is a stale action.
    const { data: existing, error: lookupError } = await db.from("event_staff_members").select("id,approved_at,removed_at")
      .eq("id", memberId).eq("vendor_id", vendorId).eq("event_location_id", locationId).maybeSingle();
    if (lookupError) return apiFail("DB_ERROR", "Unable to update this staff member", 500);
    const member = existing as MemberState | null;
    if (!member) return apiFail("MEMBER_NOT_FOUND", "Staff member not found", 404);
    if (member.approved_at && !member.removed_at) return apiOk({ status: "active" });
    return apiFail("INVALID_STATE", "This staff member has changed. Refresh and try again.", 409);
  }

  const { error: auditError } = await db.from("audit_logs").insert({
    actor_id: access.access.userId,
    action: action === "approve" ? "event_staff.approved" : "event_staff.restored",
    entity_type: "event_staff_member",
    entity_id: memberId,
    after_data: { vendor_id: vendorId, event_location_id: locationId },
  });
  if (auditError) console.error("[event-staff] access audit failed", { memberId, action, message: auditError.message });
  return apiOk({ status: "active" });
}

/**
 * DELETE: remove one staff member (or decline a pending one) from this
 * vendor's stall. The row stays as history and blocks rejoining through any
 * link until the owner restores it. No participation check: an owner must be
 * able to remove staff after withdrawing too.
 */
export async function DELETE(_request: Request, { params }: Props) {
  const { vendorId, locationId, memberId } = await params;
  if (!databaseUuidSchema.safeParse(locationId).success || !databaseUuidSchema.safeParse(memberId).success) {
    return apiFail("MEMBER_NOT_FOUND", "Staff member not found", 404);
  }
  const access = await authorizeVendor(vendorId, ["vendor_owner"], { allowEventVendor: true, requireApproved: true });
  if (!access.ok) return access.response;
  const db = access.access.serviceDb;

  const { data: removed, error } = await db.from("event_staff_members")
    .update({ removed_at: new Date().toISOString(), removed_by: access.access.userId })
    .eq("id", memberId).eq("vendor_id", vendorId).eq("event_location_id", locationId).is("removed_at", null)
    .select("id");
  if (error) return apiFail("DB_ERROR", "Unable to remove this staff member", 500);

  if ((removed ?? []).length === 0) {
    // Already removed (idempotent retry) or not this vendor's member.
    const { data: existing, error: lookupError } = await db.from("event_staff_members").select("id")
      .eq("id", memberId).eq("vendor_id", vendorId).eq("event_location_id", locationId).maybeSingle();
    if (lookupError) return apiFail("DB_ERROR", "Unable to remove this staff member", 500);
    if (!existing) return apiFail("MEMBER_NOT_FOUND", "Staff member not found", 404);
    return apiOk({ removed: true });
  }

  const { error: auditError } = await db.from("audit_logs").insert({
    actor_id: access.access.userId,
    action: "event_staff.removed",
    entity_type: "event_staff_member",
    entity_id: memberId,
    after_data: { vendor_id: vendorId, event_location_id: locationId },
  });
  if (auditError) console.error("[event-staff] removal audit failed", { memberId, message: auditError.message });
  return apiOk({ removed: true });
}
