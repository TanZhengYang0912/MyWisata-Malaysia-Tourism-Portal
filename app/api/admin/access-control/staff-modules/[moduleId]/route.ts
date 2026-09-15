import { z } from "zod";

import { mutationReceipt } from "@/app/api/admin/access-control/_shared";
import { moduleFailure, staffModuleCreateSchema } from "@/app/api/admin/access-control/staff-modules/route";
import { requireStaffRoleManagementSuperAdmin } from "@/lib/staff-permissions/server";
import { apiFail, parseBody } from "@/lib/validation/schemas";

type Context = { params: Promise<{ moduleId: string }> };

const moduleIdSchema = z.string().uuid();
const updateStaffModuleSchema = staffModuleCreateSchema.omit({ key: true }).extend({
  active: z.boolean(),
}).strict();

export async function PATCH(request: Request, context: Context) {
  const { db, user, response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const { moduleId } = await context.params;
  if (!moduleIdSchema.safeParse(moduleId).success) {
    return apiFail("VALIDATION_FAILED", "Request failed validation", 422);
  }
  const parsed = await parseBody(request, updateStaffModuleSchema);
  if (!parsed.ok) return parsed.response;

  const { error } = await db.rpc("update_staff_module", {
    p_module_id: moduleId,
    p_label: parsed.data.label,
    p_label_key: null,
    p_description: parsed.data.description,
    p_section_key: parsed.data.sectionKey,
    p_section_label: parsed.data.sectionLabel,
    p_section_label_key: null,
    p_section_sort_order: parsed.data.sectionSortOrder,
    p_href: parsed.data.href,
    p_icon_key: parsed.data.iconKey,
    p_sort_order: parsed.data.sortOrder,
    p_permission_keys: parsed.data.permissionKeys,
    p_group_key: parsed.data.groupKey,
    p_active: parsed.data.active,
    p_reason: parsed.data.reason,
  });
  if (error) return moduleFailure(error.message);

  return mutationReceipt(db, user.id, "staff.module.updated", moduleId, { moduleId });
}
