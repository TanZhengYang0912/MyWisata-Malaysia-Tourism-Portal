import { createClient } from "@/lib/supabase/server";
import { requireStaffAssurance } from "@/lib/auth/staff-assurance";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import { idParamSchema } from "@/lib/validation/entitlement-schemas";
import { staffJitActionSchema, staffJitFailure } from "@/lib/staff-permissions/jit";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ requestId: string }> };

function noStore(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function PATCH(request: Request, context: Context) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return noStore(apiFail("UNAUTHORIZED", "Sign in required", 401));
  const assurance = await requireStaffAssurance(db);
  if (assurance) return noStore(assurance);
  const { requestId } = await context.params;
  if (!idParamSchema.safeParse(requestId).success) return noStore(apiFail("VALIDATION_FAILED", "Request failed validation", 422));
  const parsed = await parseBody(request, staffJitActionSchema, { maxBytes: 4096 });
  if (!parsed.ok) return noStore(parsed.response);

  const result = parsed.data.action === "activate"
    ? await db.rpc("activate_staff_jit_access", { p_request_id: requestId, p_proof_id: parsed.data.proofId })
    : await db.rpc("end_staff_jit_access", {
      p_request_id: requestId,
      p_reason: parsed.data.reason,
      p_revoke: false,
    });
  if (result.error) {
    const failure = staffJitFailure(result.error);
    return noStore(apiFail(failure.code, "Unable to update temporary access", failure.status));
  }
  return noStore(apiOk(result.data));
}
