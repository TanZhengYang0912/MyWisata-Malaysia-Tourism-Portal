import { z } from "zod";

import {
  deliverPreparedInvitation,
  invitationFailure,
  preparedInvitation,
} from "@/app/api/admin/access-control/staff-invitations/route";
import {
  createStaffInvitationToken,
  hashStaffInvitationToken,
} from "@/lib/staff-invitations/server";
import { requireStaffRoleManagementSuperAdmin } from "@/lib/staff-permissions/server";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  locale: z.enum(["en", "ms", "zh-CN"]).optional().default("en"),
}).strict();
const idSchema = z.string().uuid();

export async function POST(request: Request, context: { params: Promise<{ invitationId: string }> }) {
  const { db, response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;

  const { invitationId } = await context.params;
  if (!idSchema.safeParse(invitationId).success) return apiFail("VALIDATION_FAILED", "Invalid invitation id", 422);
  const parsed = await parseBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const token = createStaffInvitationToken();
  const tokenHash = hashStaffInvitationToken(token);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await db.rpc("prepare_staff_invitation_resend", {
    p_invitation_id: invitationId,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
  });
  if (error) return invitationFailure(error.message);

  const prepared = preparedInvitation(data);
  if (!prepared) return apiFail("STAFF_INVITATION_FAILED", "Unable to prepare the staff invitation", 500);
  const delivery = await deliverPreparedInvitation(db, prepared, token, tokenHash, parsed.data.locale);
  if (!delivery.sent || !delivery.finalized) {
    return apiFail("STAFF_INVITATION_DELIVERY_FAILED", "Email delivery could not be confirmed", 503);
  }

  return apiOk({ id: prepared.id, status: prepared.status, deliveryStatus: "sent", expiresAt: prepared.expires_at });
}
