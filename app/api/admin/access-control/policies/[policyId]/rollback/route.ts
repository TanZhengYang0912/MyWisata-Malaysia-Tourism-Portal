import { rollbackEntitlementPolicy } from "@/lib/entitlements/admin";
import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";
import { parseBody } from "@/lib/validation/schemas";
import { idParamSchema, rollbackPolicySchema } from "@/lib/validation/entitlement-schemas";
import { accessControlFailure, mutationReceipt, validationFailure } from "@/app/api/admin/access-control/_shared";

type Context = { params: Promise<{ policyId: string }> };

export async function POST(request: Request, context: Context) {
  const { db, user, response } = await requireAccessControlSuperAdmin();
  if (response) return response;
  if (!user) return validationFailure();
  const { policyId } = await context.params;
  if (!idParamSchema.safeParse(policyId).success) return validationFailure();
  const parsed = await parseBody(request, rollbackPolicySchema);
  if (!parsed.ok) return parsed.response;

  try {
    const policyVersionId = await rollbackEntitlementPolicy(policyId, parsed.data.targetVersion, parsed.data.reason);
    return mutationReceipt(
      db,
      user.id,
      "entitlement.policy.rollback_requested",
      policyVersionId,
      { policyId, policyVersionId },
      201,
    );
  } catch (error) {
    return accessControlFailure(error);
  }
}
