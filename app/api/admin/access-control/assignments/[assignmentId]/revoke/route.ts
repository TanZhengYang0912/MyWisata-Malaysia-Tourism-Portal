import { revokeEntitlementAssignment } from "@/lib/entitlements/admin";
import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";
import { parseBody } from "@/lib/validation/schemas";
import { idParamSchema, revokeAssignmentSchema } from "@/lib/validation/entitlement-schemas";
import { accessControlFailure, mutationReceipt, validationFailure } from "@/app/api/admin/access-control/_shared";

type Context = { params: Promise<{ assignmentId: string }> };

export async function POST(request: Request, context: Context) {
  const { db, user, response } = await requireAccessControlSuperAdmin();
  if (response) return response;
  if (!user) return validationFailure();
  const { assignmentId } = await context.params;
  if (!idParamSchema.safeParse(assignmentId).success) return validationFailure();
  const parsed = await parseBody(request, revokeAssignmentSchema);
  if (!parsed.ok) return parsed.response;

  try {
    await revokeEntitlementAssignment(assignmentId, parsed.data.reason);
    return mutationReceipt(db, user.id, "entitlement.assignment.revoked", assignmentId, { assignmentId });
  } catch (error) {
    return accessControlFailure(error);
  }
}
