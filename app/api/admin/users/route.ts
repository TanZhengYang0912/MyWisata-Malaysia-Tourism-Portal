import { createClient } from "@/lib/supabase/server";
import { apiFail, apiOk } from "@/lib/validation/schemas";
import { parseUserManagementFilters } from "@/lib/user-management/filters";

function rpcFailure(message: string) {
  if (message.includes("super_admin_required")) return apiFail("FORBIDDEN", "Super Admin access required", 403);
  return apiFail("USER_MANAGEMENT_UNAVAILABLE", "Unable to load users", 500);
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const { data: isSuperAdmin, error: roleError } = await supabase.rpc("is_super_admin", { uid: user.id });
  if (roleError || !isSuperAdmin) return apiFail("FORBIDDEN", "Super Admin access required", 403);

  const filters = parseUserManagementFilters(new URL(request.url).searchParams);
  const { data, error } = await supabase.rpc("admin_list_users", {
    p_search: filters.search || null,
    p_role: filters.role,
    p_status: filters.status,
    p_kyc_status: filters.kycStatus,
    p_bio_locked: filters.bioLocked,
    p_page: filters.page,
    p_page_size: filters.pageSize,
  });
  if (error) return rpcFailure(error.message);
  return apiOk(data);
}
