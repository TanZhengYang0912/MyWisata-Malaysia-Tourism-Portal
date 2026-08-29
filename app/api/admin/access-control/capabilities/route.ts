import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";
import { updateEntitlementCapability } from "@/lib/entitlements/admin";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import { capabilitiesFiltersSchema, parseSearchParams, updateCapabilitySchema } from "@/lib/validation/entitlement-schemas";
import {
  accessControlFailure,
  booleanField,
  loadAccessControlStateResponse,
  mutationReceipt,
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

export async function PATCH(request: Request) {
  const { db, user, response } = await requireAccessControlSuperAdmin();
  if (response) return response;
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);
  const parsed = await parseBody(request, updateCapabilitySchema);
  if (!parsed.ok) return parsed.response;

  try {
    const capabilityId = await updateEntitlementCapability(parsed.data);
    return mutationReceipt(
      db,
      user.id,
      "entitlement.capability.updated",
      capabilityId,
      { capabilityId, capabilityKey: parsed.data.key },
    );
  } catch (error) {
    if (error instanceof Error && error.message.includes("capability_no_changes")) {
      return apiFail("NO_CHANGES", "Capability metadata is unchanged", 409);
    }
    return accessControlFailure(error);
  }
}
