import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";
import { apiOk } from "@/lib/validation/schemas";
import { parseSearchParams, policiesFiltersSchema } from "@/lib/validation/entitlement-schemas";
import {
  loadAccessControlStateResponse,
  numberField,
  paginate,
  stringField,
  validationFailure,
} from "@/app/api/admin/access-control/_shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await requireAccessControlSuperAdmin();
  if (response) return response;
  const parsed = parseSearchParams(request.url, policiesFiltersSchema);
  if (!parsed.success) return validationFailure();

  const result = await loadAccessControlStateResponse();
  if (result.response || !result.state) return result.response!;
  const filters = parsed.data;
  const search = filters.search?.toLowerCase();
  const items = result.state.policies.map((policy) => {
    const id = stringField(policy, "id");
    const versions = result.state.policyVersions
      .filter((version) => stringField(version, "policy_id", "policyId") === id)
      .sort((a, b) => (numberField(b, "version") ?? 0) - (numberField(a, "version") ?? 0));
    const latestVersion = versions[0] ?? null;
    return {
      id,
      key: stringField(policy, "key"),
      capabilityKey: stringField(policy, "capability_key", "capabilityKey"),
      name: stringField(policy, "name"),
      scope: stringField(policy, "scope"),
      createdAt: stringField(policy, "created_at", "createdAt"),
      latestVersion: latestVersion ? {
        id: stringField(latestVersion, "id"),
        version: numberField(latestVersion, "version"),
        status: stringField(latestVersion, "status"),
        effect: stringField(latestVersion, "effect"),
        effectiveFrom: stringField(latestVersion, "effective_from", "effectiveFrom"),
        effectiveUntil: stringField(latestVersion, "effective_until", "effectiveUntil"),
      } : null,
      versionCount: versions.length,
    };
  }).filter((item) => (!search || item.key?.toLowerCase().includes(search) || item.name?.toLowerCase().includes(search))
    && (!filters.capabilityKey || item.capabilityKey === filters.capabilityKey)
    && (!filters.scope || item.scope === filters.scope)
    && (!filters.status || item.latestVersion?.status === filters.status));

  return apiOk({ ...paginate(items, filters.page, filters.pageSize), generation: result.state.generation });
}
