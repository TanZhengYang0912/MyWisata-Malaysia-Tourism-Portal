import { requireStaffRoleManagementSuperAdmin } from "@/lib/staff-permissions/server";
import { createServiceClient } from "@/lib/supabase/service";
import { apiFail, apiOk } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

const ELIGIBLE_STAFF_ROLES = ["admin", "approver", "super_admin"] as const;

export async function GET(request: Request) {
  const { response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;

  try {
    const service = createServiceClient();
    const { data: roles, error: rolesError } = await service
      .from("roles")
      .select("id,name")
      .in("name", ELIGIBLE_STAFF_ROLES);

    if (rolesError || !roles?.length) {
      return apiFail("STAFF_CANDIDATES_UNAVAILABLE", "Unable to load eligible staff", 503);
    }

    const roleNames = new Map(roles.map((role) => [role.id, role.name]));
    const { data: assignments, error: assignmentsError } = await service
      .from("user_roles")
      .select("user_id,role_id")
      .in("role_id", [...roleNames.keys()])
      .is("vendor_id", null)
      .is("outlet_id", null);

    if (assignmentsError) {
      return apiFail("STAFF_CANDIDATES_UNAVAILABLE", "Unable to load eligible staff", 503);
    }

    const rolesByUser = new Map<string, string[]>();
    for (const assignment of assignments ?? []) {
      const roleName = roleNames.get(assignment.role_id);
      if (!roleName) continue;
      rolesByUser.set(assignment.user_id, [
        ...(rolesByUser.get(assignment.user_id) ?? []),
        roleName,
      ]);
    }

    const userIds = [...rolesByUser.keys()];
    if (userIds.length === 0) return apiOk({ candidates: [] });

    const { data: users, error: usersError } = await service
      .from("users")
      .select("id,email,full_name,display_name,status")
      .in("id", userIds)
      .eq("status", "active")
      .order("email", { ascending: true });

    if (usersError) {
      return apiFail("STAFF_CANDIDATES_UNAVAILABLE", "Unable to load eligible staff", 503);
    }

    const search = new URL(request.url).searchParams.get("search")?.trim().toLocaleLowerCase() ?? "";
    const candidates = (users ?? [])
      .map((user) => ({
        id: user.id,
        email: user.email,
        name: user.full_name ?? user.display_name ?? user.email,
        roles: [...(rolesByUser.get(user.id) ?? [])].sort(),
      }))
      .filter((candidate) => {
        if (!search) return true;
        return [candidate.name, candidate.email, candidate.id, ...candidate.roles]
          .some((value) => value.toLocaleLowerCase().includes(search));
      })
      .sort((left, right) => left.name.localeCompare(right.name) || left.email.localeCompare(right.email))
      .slice(0, 20);

    return apiOk({ candidates });
  } catch {
    return apiFail("STAFF_CANDIDATES_UNAVAILABLE", "Unable to load eligible staff", 503);
  }
}
