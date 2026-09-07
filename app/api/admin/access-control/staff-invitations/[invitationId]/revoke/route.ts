import { z } from "zod";

import { invitationFailure } from "@/app/api/admin/access-control/staff-invitations/route";
import { requireStaffRoleManagementSuperAdmin } from "@/lib/staff-permissions/server";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().trim().min(10).max(500) }).strict();
const idSchema = z.string().uuid();

export async function POST(request: Request, context: { params: Promise<{ invitationId: string }> }) {
  const { db, response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;

  const { invitationId } = await context.params;
  if (!idSchema.safeParse(invitationId).success) return apiFail("VALIDATION_FAILED", "Invalid invitation id", 422);
  const parsed = await parseBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const { error } = await db.rpc("revoke_staff_invitation", {
    p_invitation_id: invitationId,
    p_reason: parsed.data.reason,
  });
  if (error) return invitationFailure(error.message);
  return apiOk({ id: invitationId, status: "revoked" });
}
