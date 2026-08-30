import { createPolicyVersion } from "@/lib/entitlements/admin";
import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";
import { apiOk, parseBody } from "@/lib/validation/schemas";
import { createPolicyVersionSchema, idParamSchema } from "@/lib/validation/entitlement-schemas";
import {
  accessControlFailure,
  loadAccessControlStateResponse,
  mutationReceipt,
  numberField,
  stringField,
  validationFailure,
} from "@/app/api/admin/access-control/_shared";

type Context = { params: Promise<{ policyId: string }> };

export async function GET(_request: Request, context: Context) {
  const { response } = await requireAccessControlSuperAdmin();
  if (response) return response;
  const { policyId } = await context.params;
  if (!idParamSchema.safeParse(policyId).success) return validationFailure();

  const result = await loadAccessControlStateResponse();
  if (result.response || !result.state) return result.response!;
  const policy = result.state.policies.find((row) => stringField(row, "id") === policyId);
  if (!policy) return Response.json({ data: null, error: { code: "NOT_FOUND", message: "Policy not found" } }, { status: 404 });

  const items = result.state.policyVersions
    .filter((version) => stringField(version, "policy_id", "policyId") === policyId)
    .sort((a, b) => (numberField(b, "version") ?? 0) - (numberField(a, "version") ?? 0))
    .map((version) => {
      const versionId = stringField(version, "id");
      return {
        id: versionId,
        version: numberField(version, "version"),
        status: stringField(version, "status"),
        effect: stringField(version, "effect"),
        effectiveFrom: stringField(version, "effective_from", "effectiveFrom"),
        effectiveUntil: stringField(version, "effective_until", "effectiveUntil"),
        createdBy: stringField(version, "created_by", "createdBy"),
        approvedBy: stringField(version, "approved_by", "approvedBy"),
        createdAt: stringField(version, "created_at", "createdAt"),
        activatedAt: stringField(version, "activated_at", "activatedAt"),
        requirements: result.state.policyRequirements.filter((requirement) =>
          stringField(requirement, "policy_version_id", "policyVersionId") === versionId),
        approvals: result.state.approvals.filter((approval) =>
          stringField(approval, "policy_version_id", "policyVersionId") === versionId),
      };
    });

  return apiOk({
    policy: {
      id: policyId,
      key: stringField(policy, "key"),
      capabilityKey: stringField(policy, "capability_key", "capabilityKey"),
      name: stringField(policy, "name"),
      scope: stringField(policy, "scope"),
    },
    items,
    generation: result.state.generation,
  });
}

export async function POST(request: Request, context: Context) {
  const { db, user, response } = await requireAccessControlSuperAdmin();
  if (response) return response;
  if (!user) return validationFailure();
  const { policyId } = await context.params;
  if (!idParamSchema.safeParse(policyId).success) return validationFailure();
  const parsed = await parseBody(request, createPolicyVersionSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const policyVersionId = await createPolicyVersion({ policyId, ...parsed.data });
    return mutationReceipt(
      db,
      user.id,
      "entitlement.policy_version.created",
      policyVersionId,
      { policyVersionId },
      201,
    );
  } catch (error) {
    return accessControlFailure(error);
  }
}
