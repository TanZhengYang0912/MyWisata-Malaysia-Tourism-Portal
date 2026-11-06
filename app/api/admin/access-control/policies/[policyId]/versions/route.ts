import { createPolicyVersion, listAccessControlPolicyVersions } from "@/lib/entitlements/admin";
import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";
import { apiOk, parseBody } from "@/lib/validation/schemas";
import { createPolicyVersionSchema, idParamSchema, parseSearchParams } from "@/lib/validation/entitlement-schemas";
import { z } from "zod";
import {
  accessControlFailure,
  mutationReceipt,
  validationFailure,
} from "@/app/api/admin/access-control/_shared";

type Context = { params: Promise<{ policyId: string }> };

export async function GET(request: Request, context: Context) {
  const { response } = await requireAccessControlSuperAdmin();
  if (response) return response;
  const { policyId } = await context.params;
  if (!idParamSchema.safeParse(policyId).success) return validationFailure();

  const parsed = parseSearchParams(request.url, z.object({
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    beforeVersion: z.coerce.number().int().positive().optional(),
  }).strict());
  if (!parsed.success) return validationFailure();
  try {
    const result = await listAccessControlPolicyVersions({ policyId, ...parsed.data });
    return apiOk(result);
  } catch (error) {
    return accessControlFailure(error);
  }
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
