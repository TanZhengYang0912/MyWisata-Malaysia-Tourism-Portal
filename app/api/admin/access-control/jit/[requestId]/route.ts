import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import { idParamSchema } from "@/lib/validation/entitlement-schemas";
import { adminStaffJitDecisionSchema, staffJitFailure } from "@/lib/staff-permissions/jit";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ requestId: string }> };

function noStore(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function PATCH(request: Request, context: Context) {
  const { db, response } = await requireAccessControlSuperAdmin();
  if (response) return noStore(response);
  const { requestId } = await context.params;
  if (!idParamSchema.safeParse(requestId).success) return noStore(apiFail("VALIDATION_FAILED", "Request failed validation", 422));
  const parsed = await parseBody(request, adminStaffJitDecisionSchema, { maxBytes: 4096 });
  if (!parsed.ok) return noStore(parsed.response);

  const result = parsed.data.decision === "revoke"
    ? await db.rpc("end_staff_jit_access", { p_request_id: requestId, p_reason: parsed.data.reason, p_revoke: true })
    : await db.rpc("decide_staff_jit_request", {
      p_request_id: requestId,
      p_approve: parsed.data.decision === "approve",
      p_reason: parsed.data.reason,
    });
  if (result.error) {
    const failure = staffJitFailure(result.error);
    return noStore(apiFail(failure.code, "Unable to update temporary access request", failure.status));
  }
  return noStore(apiOk(result.data));
}
