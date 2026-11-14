import { apiFail, apiOk, databaseUuidSchema } from "@/lib/validation/schemas";
import { authorizeVendor } from "@/lib/vendor-authorization";

interface Props { params: Promise<{ vendorId: string; campaignId: string; memberId: string }> }

/**
 * DELETE: remove one staff member from this vendor × event. The row stays as
 * history and blocks rejoining, even through a new link. No participation
 * check: an owner must be able to remove staff after withdrawing too.
 */
export async function DELETE(_request: Request, { params }: Props) {
  const { vendorId, campaignId, memberId } = await params;
  if (!databaseUuidSchema.safeParse(campaignId).success || !databaseUuidSchema.safeParse(memberId).success) {
    return apiFail("MEMBER_NOT_FOUND", "Staff member not found", 404);
  }
  const access = await authorizeVendor(vendorId, ["vendor_owner"], { allowEventVendor: true, requireApproved: true });
  if (!access.ok) return access.response;
  const db = access.access.serviceDb;

  const { data: removed, error } = await db.from("event_staff_members")
    .update({ removed_at: new Date().toISOString(), removed_by: access.access.userId })
    .eq("id", memberId).eq("vendor_id", vendorId).eq("campaign_id", campaignId).is("removed_at", null)
    .select("id");
  if (error) return apiFail("DB_ERROR", "Unable to remove this staff member", 500);

  if ((removed ?? []).length === 0) {
    // Already removed (idempotent retry) or not this vendor's member.
    const { data: existing, error: lookupError } = await db.from("event_staff_members").select("id")
      .eq("id", memberId).eq("vendor_id", vendorId).eq("campaign_id", campaignId).maybeSingle();
    if (lookupError) return apiFail("DB_ERROR", "Unable to remove this staff member", 500);
    if (!existing) return apiFail("MEMBER_NOT_FOUND", "Staff member not found", 404);
    return apiOk({ removed: true });
  }

  const { error: auditError } = await db.from("audit_logs").insert({
    actor_id: access.access.userId,
    action: "event_staff.removed",
    entity_type: "event_staff_member",
    entity_id: memberId,
    after_data: { vendor_id: vendorId, campaign_id: campaignId },
  });
  if (auditError) console.error("[event-staff] removal audit failed", { memberId, message: auditError.message });
  return apiOk({ removed: true });
}
