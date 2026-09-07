import { z } from "zod";

import { mutationReceipt } from "@/app/api/admin/access-control/_shared";
import { STAFF_PERMISSION_KEYS } from "@/lib/staff-permissions/types";
import { requireStaffRoleManagementSuperAdmin } from "@/lib/staff-permissions/server";
import { apiFail, parseBody } from "@/lib/validation/schemas";

type Context = { params: Promise<{ roleId: string }> };

const roleIdSchema = z.string().uuid();
const updateStaffRoleSchema = z.object({
  name: z.string().trim().min(1).max(20),
  description: z.string().trim().max(100).nullable().optional().default(null),
  permissionKeys: z.array(z.enum(STAFF_PERMISSION_KEYS)).max(STAFF_PERMISSION_KEYS.length)
    .refine((keys) => new Set(keys).size === keys.length, "Permission keys must be unique"),
  active: z.boolean(),
  reason: z.string().trim().min(10).max(500),
}).strict();

function staffRoleFailure(message: string) {
  if (message.includes("system_role_protected")) {
    return apiFail("SYSTEM_ROLE_PROTECTED", "System staff roles cannot be changed", 409);
  }
  if (message.includes("23505") || message.includes("duplicate key")) {
    return apiFail("CONFLICT", "The staff role change conflicts with an existing record", 409);
  }
  if (message.includes("staff_role_not_found")) {
    return apiFail("NOT_FOUND", "The requested staff role was not found", 404);
  }
  if (message.includes("super_admin_required")) {
    return apiFail("FORBIDDEN", "Super Admin access required", 403);
  }
  if (message.includes("staff_reason_required") || message.includes("staff_role_name_required")
      || message.includes("staff_role_description_too_long")
      || message.includes("invalid_permission_key") || message.includes("duplicate_permission_key")) {
    return apiFail("VALIDATION_FAILED", "Request body failed validation", 422);
  }
  return apiFail("STAFF_ROLE_OPERATION_FAILED", "Unable to complete the staff role operation", 500);
}

export async function PATCH(request: Request, context: Context) {
  const { db, user, response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const { roleId } = await context.params;
  if (!roleIdSchema.safeParse(roleId).success) {
    return apiFail("VALIDATION_FAILED", "Request failed validation", 422);
  }
  const parsed = await parseBody(request, updateStaffRoleSchema);
  if (!parsed.ok) return parsed.response;

  const { error } = await db.rpc("update_staff_role", {
    p_role_id: roleId,
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_permission_keys: parsed.data.permissionKeys,
    p_active: parsed.data.active,
    p_reason: parsed.data.reason,
  });

  if (error) return staffRoleFailure(error.message);

  return mutationReceipt(db, user.id, "staff.role.updated", roleId, { roleId });
}
