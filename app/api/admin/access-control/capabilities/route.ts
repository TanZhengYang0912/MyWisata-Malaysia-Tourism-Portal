import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";
import { apiOk } from "@/lib/validation/schemas";
import { capabilitiesFiltersSchema, parseSearchParams } from "@/lib/validation/entitlement-schemas";
import {
  booleanField,
  loadAccessControlStateResponse,
  paginate,
  stringField,
  validationFailure,
} from "@/app/api/admin/access-control/_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireAccessControlSuperAdmin();
  if (response) return response;
  const parsed = parseSearchParams(request.url, capabilitiesFiltersSchema);
  if (!parsed.success) return validationFailure();

  const result = await loadAccessControlStateResponse();
  if (result.response || !result.state) return result.response!;
  const filters = parsed.data;
  const search = filters.search?.toLowerCase();
  const items = result.state.capabilities
    .map((row) => ({
      key: stringField(row, "key"),
      category: stringField(row, "category"),
      riskLevel: stringField(row, "risk_level", "riskLevel"),
      customerVisible: booleanField(row, "customer_visible", "customerVisible"),
      manuallyAssignable: booleanField(row, "manually_assignable", "manuallyAssignable"),
      enabled: booleanField(row, "enabled"),
      createdAt: stringField(row, "created_at", "createdAt"),
      updatedAt: stringField(row, "updated_at", "updatedAt"),
    }))
    .filter((item) => (!search || item.key?.toLowerCase().includes(search))
      && (!filters.category || item.category === filters.category)
      && (!filters.riskLevel || item.riskLevel === filters.riskLevel)
      && (filters.enabled === undefined || item.enabled === filters.enabled)
      && (filters.customerVisible === undefined || item.customerVisible === filters.customerVisible));

  return apiOk({ ...paginate(items, filters.page, filters.pageSize), generation: result.state.generation });
}
