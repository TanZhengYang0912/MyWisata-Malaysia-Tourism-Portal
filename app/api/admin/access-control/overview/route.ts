import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";
import { getAccessControlOverview } from "@/lib/entitlements/admin";
import { apiOk } from "@/lib/validation/schemas";
import { accessControlFailure } from "@/app/api/admin/access-control/_shared";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireAccessControlSuperAdmin();
  if (response) return response;

  try {
    return apiOk(await getAccessControlOverview());
  } catch (error) {
    return accessControlFailure(error);
  }
}
