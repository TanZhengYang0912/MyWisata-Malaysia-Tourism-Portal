import { requireStaffRoleManagementSuperAdmin } from "@/lib/staff-permissions/server";
import { apiFail, apiOk } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";

export async function GET() {
  const { db, response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;

  const { data, error } = await db
    .from("staff_permissions")
    .select("id,key,module,action,description,is_system,created_at")
    .order("key", { ascending: true });

  if (error) {
    return apiFail(
      "STAFF_PERMISSIONS_UNAVAILABLE",
      "Unable to load staff permissions",
      503,
    );
  }

  return apiOk({ permissions: data ?? [] });
}
