import { mutationReceipt } from "@/app/api/admin/access-control/_shared";
import { requireStaffRoleManagementSuperAdmin } from "@/lib/staff-permissions/server";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import { moduleFailure, staffModuleCreateSchema } from "./_shared";

export const dynamic = "force-dynamic";

function relationKey(value: unknown): string | null {
  const relation = Array.isArray(value) ? value[0] : value;
  if (typeof relation !== "object" || relation === null || !("key" in relation)) return null;
  return typeof relation.key === "string" ? relation.key : null;
}

export async function GET() {
  const { db, response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;

  const [modulesResult, permissionsResult, mappingsResult, groupsResult, membersResult] = await Promise.all([
    db.from("staff_modules")
      .select("id,key,label,label_key,description,section_key,section_label,section_label_key,section_sort_order,href,icon_key,sort_order,is_active,is_system,created_at,updated_at")
      .order("section_sort_order", { ascending: true })
      .order("sort_order", { ascending: true }),
    db.from("staff_permissions")
      .select("id,key,module,action,description,is_system,created_at")
      .order("key", { ascending: true }),
    db.from("staff_module_permissions").select("module_id,staff_permissions(key)"),
    db.from("staff_module_groups")
      .select("id,key,name,description,is_system,is_active")
      .order("name", { ascending: true }),
    db.from("staff_module_group_members").select("group_id,module_id"),
  ]);

  if (modulesResult.error || permissionsResult.error || mappingsResult.error || groupsResult.error || membersResult.error) {
    return apiFail("STAFF_MODULES_UNAVAILABLE", "Unable to load Staff Modules", 503);
  }

  const permissionKeysByModule = new Map<string, string[]>();
  for (const mapping of mappingsResult.data ?? []) {
    const key = relationKey(mapping.staff_permissions);
    if (!key) continue;
    permissionKeysByModule.set(mapping.module_id, [...(permissionKeysByModule.get(mapping.module_id) ?? []), key]);
  }
  const groupByModule = new Map<string, { key: string; name: string }>();
  for (const member of membersResult.data ?? []) {
    const group = (groupsResult.data ?? []).find((item) => item.id === member.group_id);
    if (group) groupByModule.set(member.module_id, { key: group.key, name: group.name });
  }

  return apiOk({
    modules: (modulesResult.data ?? []).map((module) => ({
      id: module.id,
      key: module.key,
      label: module.label,
      labelKey: module.label_key,
      description: module.description,
      sectionKey: module.section_key,
      sectionLabel: module.section_label,
      sectionLabelKey: module.section_label_key,
      sectionSortOrder: module.section_sort_order,
      href: module.href,
      iconKey: module.icon_key,
      sortOrder: module.sort_order,
      isActive: module.is_active,
      isSystem: module.is_system,
      groupKey: groupByModule.get(module.id)?.key ?? null,
      groupName: groupByModule.get(module.id)?.name ?? null,
      permissionKeys: (permissionKeysByModule.get(module.id) ?? []).sort(),
    })),
    permissions: (permissionsResult.data ?? []).map((permission) => ({
      id: permission.id,
      key: permission.key,
      module: permission.module,
      action: permission.action,
      description: permission.description,
      isSystem: permission.is_system,
    })),
    groups: (groupsResult.data ?? []).map((group) => ({
      id: group.id,
      key: group.key,
      name: group.name,
      description: group.description,
      isSystem: group.is_system,
      isActive: group.is_active,
      moduleKeys: (membersResult.data ?? [])
        .filter((member) => member.group_id === group.id)
        .map((member) => (modulesResult.data ?? []).find((module) => module.id === member.module_id)?.key)
        .filter((key): key is string => Boolean(key))
        .sort(),
    })),
  });
}

export async function POST(request: Request) {
  const { db, user, response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);
  const parsed = await parseBody(request, staffModuleCreateSchema);
  if (!parsed.ok) return parsed.response;

  const { data: moduleId, error } = await db.rpc("create_staff_module", {
    p_key: parsed.data.key,
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
    p_reason: parsed.data.reason,
  });
  if (error || typeof moduleId !== "string") return moduleFailure(error?.message ?? "staff_module_id_unavailable");

  return mutationReceipt(db, user.id, "staff.module.created", moduleId, { moduleId }, 201);
}
