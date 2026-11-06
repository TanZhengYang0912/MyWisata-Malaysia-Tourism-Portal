import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";
import { apiFail, apiOk } from "@/lib/validation/schemas";
import { staffJitFailure } from "@/lib/staff-permissions/jit";

export const dynamic = "force-dynamic";

function noStore(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: Request) {
  const { db, response } = await requireAccessControlSuperAdmin();
  if (response) return noStore(response);
  const params = new URL(request.url).searchParams;
  const page = Number(params.get("page") ?? 1);
  const pageSize = Number(params.get("pageSize") ?? 25);
  if (!Number.isInteger(page) || page < 1 || page > 1000 || ![25, 50, 100].includes(pageSize)) return noStore(apiFail("VALIDATION_FAILED", "Request failed validation", 422));
  const { data, error } = await db.rpc("list_staff_jit_requests", {
    p_page: page, p_page_size: pageSize, p_state: "pending", p_admin_queue: true,
  });
  if (error) {
    const failure = staffJitFailure(error);
    return noStore(apiFail(failure.code, "Unable to load temporary access approvals", failure.status));
  }
  return noStore(apiOk(data));
}
