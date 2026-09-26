import { z } from "zod";

import { mutationReceipt } from "@/app/api/admin/access-control/_shared";
import { requireStaffRoleManagementSuperAdmin } from "@/lib/staff-permissions/server";
import { apiFail, databaseUuidSchema, parseBody } from "@/lib/validation/schemas";

type Context = { params: Promise<{ roleId: string }> };

const reasonSchema = z.string().trim().min(10).max(500);
const assignStaffRoleSchema = z.object({
  userId: databaseUuidSchema,
  reason: reasonSchema,
}).strict();
const revokeStaffRoleSchema = z.object({
  assignmentId: databaseUuidSchema,
  reason: reasonSchema,
}).strict();

function staffAssignmentFailure(message: string) {
  if (message.includes("system_role_protected")) {
    return apiFail("SYSTEM_ROLE_PROTECTED", "System staff roles cannot be changed", 409);
  }
  if (message.includes("23505") || message.includes("duplicate key")
      || message.includes("staff_role_assignments_live_unique")) {
    return apiFail("CONFLICT", "This staff role assignment already exists", 409);
  }
  if (message.includes("staff_role_not_found") || message.includes("staff_assignment_not_found")) {
    return apiFail("NOT_FOUND", "The requested staff role record was not found", 404);
  }
  if (message.includes("staff_role_inactive") || message.includes("staff_assignment_already_revoked")
      || message.includes("staff_assignment_target_not_active")
      || message.includes("coarse_staff_role_required")) {
    return apiFail("CONFLICT", "The staff role assignment is not in a valid state for this action", 409);
  }
  if (message.includes("super_admin_required")) {
    return apiFail("FORBIDDEN", "Super Admin access required", 403);
  }
  if (message.includes("staff_reason_required") || message.includes("staff_assignment_target_required")) {
    return apiFail("VALIDATION_FAILED", "Request body failed validation", 422);
  }
  return apiFail("STAFF_ROLE_OPERATION_FAILED", "Unable to complete the staff role operation", 500);
}

async function validatedRoleId(context: Context) {
  const { roleId } = await context.params;
  return databaseUuidSchema.safeParse(roleId).success ? roleId : null;
}

export async function POST(request: Request, context: Context) {
  const { db, user, response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const roleId = await validatedRoleId(context);
  if (!roleId) return apiFail("VALIDATION_FAILED", "Request failed validation", 422);
  const parsed = await parseBody(request, assignStaffRoleSchema);
  if (!parsed.ok) return parsed.response;

  const { data: assignmentId, error } = await db.rpc("assign_staff_role", {
    p_role_id: roleId,
    p_user_id: parsed.data.userId,
    p_reason: parsed.data.reason,
  });

  if (error || typeof assignmentId !== "string") {
    return staffAssignmentFailure(error?.message ?? "staff_assignment_id_unavailable");
  }

  return mutationReceipt(
    db,
    user.id,
    "staff.role.assigned",
    assignmentId,
    { assignmentId, roleId, userId: parsed.data.userId },
    201,
  );
}

export async function DELETE(request: Request, context: Context) {
  const { db, user, response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const roleId = await validatedRoleId(context);
  if (!roleId) return apiFail("VALIDATION_FAILED", "Request failed validation", 422);
  const parsed = await parseBody(request, revokeStaffRoleSchema);
  if (!parsed.ok) return parsed.response;

  const { error } = await db.rpc("revoke_staff_role_assignment", {
    p_assignment_id: parsed.data.assignmentId,
    p_reason: parsed.data.reason,
  });

  if (error) return staffAssignmentFailure(error.message);

  return mutationReceipt(
    db,
    user.id,
    "staff.role.revoked",
    parsed.data.assignmentId,
    { assignmentId: parsed.data.assignmentId, roleId },
  );
}
