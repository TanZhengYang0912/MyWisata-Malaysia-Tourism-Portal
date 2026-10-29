import { z } from "zod";

import { invitationFailure } from "@/lib/staff-invitations/route-helpers";
import { mutationReceipt } from "@/app/api/admin/access-control/_shared";
import { requireStaffRoleManagementSuperAdmin } from "@/lib/staff-permissions/server";
import { apiFail, parseBody } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ reason: z.string().trim().min(10).max(500) }).strict();
const idSchema = z.string().uuid();

export async function POST(request: Request, context: { params: Promise<{ invitationId: string }> }) {
  const { db, user, response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const { invitationId } = await context.params;
  if (!idSchema.safeParse(invitationId).success) return apiFail("VALIDATION_FAILED", "Invalid invitation id", 422);
  const parsed = await parseBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const { error } = await db.rpc("revoke_staff_invitation", {
    p_invitation_id: invitationId,
    p_reason: parsed.data.reason,
  });
  if (error) return invitationFailure(error.message);
  return mutationReceipt(db, user.id, "staff.invitation.revoked", invitationId, { id: invitationId, status: "revoked" });
}
