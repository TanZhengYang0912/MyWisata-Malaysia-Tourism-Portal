import { z } from "zod";
import { requireStaffRoleManagementSuperAdmin } from "@/lib/staff-permissions/server";
import { staffEmployeePageSchema } from "@/lib/staff-permissions/employee-access";
import { apiFail, apiOk } from "@/lib/validation/schemas";

export const dynamic = "force-dynamic";
const querySchema = z.object({
  search: z.string().trim().max(100).default(""),
  status: z.enum(["", "active", "suspended", "deleted"]).default(""),
  page: z.coerce.number().int().min(1).max(1_000_000).default(1),
  pageSize: z.coerce.number().int().refine((size) => [25, 50, 100].includes(size)).default(25),
});
export async function GET(request: Request) {
  const { db, response } = await requireStaffRoleManagementSuperAdmin();
  if (response) return response;
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return apiFail("VALIDATION_FAILED", "Invalid employee filters", 422);
  const { data, error } = await db.rpc("list_staff_employees", {
    p_search: query.data.search, p_status: query.data.status, p_page: query.data.page, p_page_size: query.data.pageSize,
  });
  const parsed = staffEmployeePageSchema.safeParse(data);
  if (error) {
    const databaseCode = typeof error.code === "string" && /^[A-Z0-9]+$/.test(error.code) ? error.code : undefined;
    return apiFail("STAFF_EMPLOYEES_RPC_UNAVAILABLE", "Unable to load employees", 503, {
      stage: "rpc",
      ...(databaseCode ? { databaseCode } : {}),
    });
  }
  if (!parsed.success) {
    return apiFail("STAFF_EMPLOYEES_RESPONSE_INVALID", "Unable to load employees", 503, {
      stage: "response_validation",
      fields: [...new Set(parsed.error.issues.map((issue) => issue.path.join(".")).filter(Boolean))],
    });
  }
  return apiOk(parsed.data);
}
