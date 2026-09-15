import { z } from "zod";

import {
  createStaffInvitationToken,
  hashStaffInvitationToken,
  normalizeStaffInvitationEmail,
} from "@/lib/staff-invitations/server";
import {
  deliverPreparedInvitation,
  invitationFailure,
  preparedInvitation,
} from "@/lib/staff-invitations/route-helpers";
import { requireStaffRoleManagementSuperAdmin } from "@/lib/staff-permissions/server";
import { createServiceClient } from "@/lib/supabase/service";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  email: z.string().trim().email().max(254),
  staffRoleId: z.string().uuid(),
  locale: z.enum(["en", "ms", "zh-CN"]).optional().default("en"),
  reason: z.string().trim().min(10).max(500),
}).strict();

export async function GET() {
  const { response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;

  try {
    const service = createServiceClient();
    const { data, error } = await service
      .from("staff_invitations")
      .select("id,invited_email,role_name_snapshot,permission_keys_snapshot,status,delivery_status,send_attempt_count,expires_at,created_at,accepted_at,revoked_at")
      .order("created_at", { ascending: false });
    if (error) return apiFail("STAFF_INVITATIONS_UNAVAILABLE", "Unable to load staff invitations", 503);

    return apiOk({
      invitations: (data ?? []).map((row) => ({
        id: row.id,
        invitedEmail: row.invited_email,
        roleName: row.role_name_snapshot,
        permissionKeys: row.permission_keys_snapshot,
        status: row.status,
        deliveryStatus: row.delivery_status,
        sendAttemptCount: row.send_attempt_count,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        acceptedAt: row.accepted_at,
        revokedAt: row.revoked_at,
      })),
    });
  } catch {
    return apiFail("STAFF_INVITATIONS_UNAVAILABLE", "Unable to load staff invitations", 503);
  }
}

export async function POST(request: Request) {
  const { db, response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;

  const parsed = await parseBody(request, createSchema);
  if (!parsed.ok) return parsed.response;

  const token = createStaffInvitationToken();
  const tokenHash = hashStaffInvitationToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db.rpc("prepare_staff_invitation", {
    p_invited_email: normalizeStaffInvitationEmail(parsed.data.email),
    p_staff_role_id: parsed.data.staffRoleId,
    p_reason: parsed.data.reason,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  });
  if (error) return invitationFailure(error.message);

  const prepared = preparedInvitation(data);
  if (!prepared) return apiFail("STAFF_INVITATION_FAILED", "Unable to prepare the staff invitation", 500);
  const delivery = await deliverPreparedInvitation(db, prepared, token, tokenHash, parsed.data.locale);
  if (!delivery.sent || !delivery.finalized) {
    return apiFail("STAFF_INVITATION_DELIVERY_FAILED", "The invitation was created but email delivery could not be confirmed", 503);
  }

  return apiOk({
    id: prepared.id,
    status: prepared.status,
    deliveryStatus: "sent",
    expiresAt: prepared.expires_at,
  }, { status: 201 });
}
