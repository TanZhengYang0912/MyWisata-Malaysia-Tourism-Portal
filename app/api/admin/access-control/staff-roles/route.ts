import { z } from "zod";

import { mutationReceipt } from "@/app/api/admin/access-control/_shared";
import { requireStaffRoleManagementSuperAdmin } from "@/lib/staff-permissions/server";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

const reasonSchema = z.string().trim().min(10).max(500);
const moduleKeySchema = z.string().regex(/^[a-z][a-z0-9_]*$/);

const createStaffRoleSchema = z.object({
  name: z.string().trim().min(1).max(20),
  description: z.string().trim().max(100).nullable().optional().default(null),
  moduleKeys: z.array(moduleKeySchema).max(100)
    .refine((keys) => new Set(keys).size === keys.length, "Module keys must be unique"),
  reason: reasonSchema,
}).strict();

function permissionKeyFromRelation(value: unknown): string | null {
  const relation = Array.isArray(value) ? value[0] : value;
  if (typeof relation !== "object" || relation === null || !("key" in relation)) return null;
  return typeof relation.key === "string" ? relation.key : null;
}

function moduleKeyFromRelation(value: unknown): string | null {
  return permissionKeyFromRelation(value);
}

function staffRoleFailure(message: string) {
  if (message.includes("system_role_protected")) {
    return apiFail("SYSTEM_ROLE_PROTECTED", "System staff roles cannot be changed", 409);
  }
  if (message.includes("23505") || message.includes("duplicate key")
      || message.includes("staff_role_assignments_live_unique")) {
    return apiFail("CONFLICT", "The staff role change conflicts with an existing record", 409);
  }
  if (message.includes("staff_role_not_found") || message.includes("staff_assignment_not_found")) {
    return apiFail("NOT_FOUND", "The requested staff role record was not found", 404);
  }
  if (message.includes("staff_role_inactive") || message.includes("staff_assignment_already_revoked")
      || message.includes("staff_assignment_target_not_active")
      || message.includes("coarse_staff_role_required")) {
    return apiFail("CONFLICT", "The staff role record is not in a valid state for this action", 409);
  }
  if (message.includes("super_admin_required")) {
    return apiFail("FORBIDDEN", "Super Admin access required", 403);
  }
  if (message.includes("staff_module_not_delegable")) return apiFail("MODULE_NOT_DELEGABLE", "This module is reserved for its existing system role", 422);
  if (message.includes("staff_reason_required") || message.includes("staff_role_name_required")
      || message.includes("staff_role_description_too_long")
      || message.includes("invalid_module_key") || message.includes("duplicate_module_key")) {
    return apiFail("VALIDATION_FAILED", "Request body failed validation", 422);
  }
  return apiFail("STAFF_ROLE_OPERATION_FAILED", "Unable to complete the staff role operation", 500);
}

export async function GET() {
  const { db, response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;

  const [rolesResult, permissionsResult, modulesResult, jitPermissionsResult] = await Promise.all([
    db.from("staff_roles").select("id,name,description,is_system,is_active,created_by,created_at,updated_at").order("name", { ascending: true }),
    db.from("staff_role_permissions").select("role_id,staff_permissions(key)"),
    db.from("staff_role_modules").select("role_id,staff_modules(key)"),
    db.from("staff_role_jit_permissions").select("role_id,staff_permissions(key)"),
  ]);
  if (rolesResult.error || permissionsResult.error || modulesResult.error || jitPermissionsResult.error) {
    return apiFail("STAFF_ROLES_UNAVAILABLE", "Unable to load staff roles", 503);
  }

  const keysByRole = new Map<string, string[]>();
  for (const row of permissionsResult.data ?? []) {
    const key = permissionKeyFromRelation(row.staff_permissions);
    if (!key) continue;
    keysByRole.set(row.role_id, [...(keysByRole.get(row.role_id) ?? []), key]);
  }
  const moduleKeysByRole = new Map<string, string[]>();
  for (const row of modulesResult.data ?? []) {
    const key = moduleKeyFromRelation(row.staff_modules);
    if (!key) continue;
    moduleKeysByRole.set(row.role_id, [...(moduleKeysByRole.get(row.role_id) ?? []), key]);
  }
  const jitPermissionKeysByRole = new Map<string, string[]>();
  for (const row of jitPermissionsResult.data ?? []) {
    const key = permissionKeyFromRelation(row.staff_permissions);
    if (!key) continue;
    jitPermissionKeysByRole.set(row.role_id, [...(jitPermissionKeysByRole.get(row.role_id) ?? []), key]);
  }


  return apiOk({
    roles: (rolesResult.data ?? []).map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.is_system,
      isActive: role.is_active,
      createdBy: role.created_by,
      createdAt: role.created_at,
      updatedAt: role.updated_at,
      moduleKeys: moduleKeysByRole.get(role.id) ?? [],
      permissionKeys: keysByRole.get(role.id) ?? [],
      jitPermissionKeys: jitPermissionKeysByRole.get(role.id) ?? [],
    })),
    assignments: [],
    employees: [],
  });
}

export async function POST(request: Request) {
  const { db, user, response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const parsed = await parseBody(request, createStaffRoleSchema);
  if (!parsed.ok) return parsed.response;

  const { data: roleId, error } = await db.rpc("create_staff_role_with_modules", {
    p_name: parsed.data.name,
    p_description: parsed.data.description,
    p_module_keys: parsed.data.moduleKeys,
    p_reason: parsed.data.reason,
  });

  if (error || typeof roleId !== "string") {
    return staffRoleFailure(error?.message ?? "staff_role_id_unavailable");
  }

  return mutationReceipt(
    db,
    user.id,
    "staff.role.created",
    roleId,
    { roleId },
    201,
  );
}
