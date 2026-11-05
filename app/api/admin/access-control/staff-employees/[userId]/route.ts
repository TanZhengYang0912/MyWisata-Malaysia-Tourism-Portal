import { requireStaffRoleManagementSuperAdmin } from "@/lib/staff-permissions/server";
import { postgresUuidSchema, staffEmployeeAccessSchema } from "@/lib/staff-permissions/employee-access";
import { apiFail, apiOk } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  const { db, response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;
  const { userId } = await context.params;
  const excludedAssignmentId = new URL(request.url).searchParams.get("excludedAssignmentId");
  if (!postgresUuidSchema.safeParse(userId).success || (excludedAssignmentId && !postgresUuidSchema.safeParse(excludedAssignmentId).success)) {
    return apiFail("VALIDATION_FAILED", "Invalid employee or assignment", 422);
  }
  const { data, error } = await db.rpc("get_staff_employee_access", { p_user_id: userId, p_excluded_assignment_id: excludedAssignmentId });
  if (error) return apiFail("STAFF_ACCESS_UNAVAILABLE", "Unable to verify current employee access", 503);
  const parsed = staffEmployeeAccessSchema.safeParse(data);
  if (!parsed.success) return apiFail("STAFF_ACCESS_UNAVAILABLE", "Unable to verify current employee access", 503);
  return apiOk(parsed.data);
}
