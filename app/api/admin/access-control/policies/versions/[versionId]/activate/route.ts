import { activatePolicyVersion } from "@/lib/entitlements/admin";
import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";
import { parseBody } from "@/lib/validation/schemas";
import { idParamSchema, policyDecisionSchema } from "@/lib/validation/entitlement-schemas";
import { accessControlFailure, mutationReceipt, validationFailure } from "@/app/api/admin/access-control/_shared";

type Context = { params: Promise<{ versionId: string }> };

export async function POST(request: Request, context: Context) {
  const { db, user, response } = await requireAccessControlSuperAdmin();
  if (response) return response;
  if (!user) return validationFailure();
  const { versionId } = await context.params;
  if (!idParamSchema.safeParse(versionId).success) return validationFailure();
  const parsed = await parseBody(request, policyDecisionSchema);
  if (!parsed.ok) return parsed.response;

  try {
    await activatePolicyVersion(versionId, parsed.data.reason);
    return mutationReceipt(db, user.id, "entitlement.policy_version.activated", versionId, { policyVersionId: versionId });
  } catch (error) {
    return accessControlFailure(error);
  }
}
