import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";
import { listAccessControlPolicies } from "@/lib/entitlements/admin";
import { apiOk } from "@/lib/validation/schemas";
import { parseSearchParams, policiesFiltersSchema } from "@/lib/validation/entitlement-schemas";
import {
  accessControlFailure,
  isRecord,
  numberField,
  stringField,
  validationFailure,
} from "@/app/api/admin/access-control/_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireAccessControlSuperAdmin();
  if (response) return response;
  const parsed = parseSearchParams(request.url, policiesFiltersSchema);
  if (!parsed.success) return validationFailure();

  try {
    const result = await listAccessControlPolicies(parsed.data);
    return apiOk({
      ...result,
      items: result.items.map((policy) => {
        const latestVersion = isRecord(policy.latest_version) ? policy.latest_version : null;
        return {
          id: stringField(policy, "id"),
          key: stringField(policy, "key"),
          capabilityKey: stringField(policy, "capability_key"),
          name: stringField(policy, "name"),
          scope: stringField(policy, "scope"),
          createdAt: stringField(policy, "created_at"),
          latestVersion: latestVersion ? {
            id: stringField(latestVersion, "id"),
            version: numberField(latestVersion, "version"),
            status: stringField(latestVersion, "status"),
            effect: stringField(latestVersion, "effect"),
            effectiveFrom: stringField(latestVersion, "effective_from"),
            effectiveUntil: stringField(latestVersion, "effective_until"),
          } : null,
          versionCount: numberField(policy, "version_count") ?? 0,
        };
      }),
    });
  } catch (error) {
    return accessControlFailure(error);
  }
}
