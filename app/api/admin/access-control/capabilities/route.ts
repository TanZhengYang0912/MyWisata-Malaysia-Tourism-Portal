import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";
import { listAccessControlCapabilities, updateEntitlementCapability } from "@/lib/entitlements/admin";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import { capabilitiesFiltersSchema, parseSearchParams, updateCapabilitySchema } from "@/lib/validation/entitlement-schemas";
import {
  accessControlFailure,
  booleanField,
  mutationReceipt,
  stringField,
  validationFailure,
} from "@/app/api/admin/access-control/_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireAccessControlSuperAdmin();
  if (response) return response;
  const parsed = parseSearchParams(request.url, capabilitiesFiltersSchema);
  if (!parsed.success) return validationFailure();

  try {
    const result = await listAccessControlCapabilities(parsed.data);
    return apiOk({
      ...result,
      items: result.items.map((row) => ({
        key: stringField(row, "key"),
        category: stringField(row, "category"),
        riskLevel: stringField(row, "risk_level"),
        customerVisible: booleanField(row, "customer_visible"),
        manuallyAssignable: booleanField(row, "manually_assignable"),
        enabled: booleanField(row, "enabled"),
        createdAt: stringField(row, "created_at"),
        updatedAt: stringField(row, "updated_at"),
      })),
    });
  } catch (error) {
    return accessControlFailure(error);
  }
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
