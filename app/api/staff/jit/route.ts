import { createClient } from "@/lib/supabase/server";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import { requireStaffAssurance } from "@/lib/auth/staff-assurance";
import { staffJitFailure, staffJitRequestSchema } from "@/lib/staff-permissions/jit";

export const dynamic = "force-dynamic";

function noStore(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request: Request) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return noStore(apiFail("UNAUTHORIZED", "Sign in required", 401));
  const assurance = await requireStaffAssurance(db);
  if (assurance) return noStore(assurance);
  const params = new URL(request.url).searchParams;
  const page = Number(params.get("page") ?? 1);
  const pageSize = Number(params.get("pageSize") ?? 25);
  if (!Number.isInteger(page) || page < 1 || page > 1000 || ![25, 50, 100].includes(pageSize)) return noStore(apiFail("VALIDATION_FAILED", "Request failed validation", 422));
  const [{ data, error: queryError }, { data: status, error: statusError }] = await Promise.all([
    db.rpc("list_staff_jit_requests", {
    p_page: page, p_page_size: pageSize, p_state: params.get("state"), p_admin_queue: false,
    }),
    db.rpc("get_my_staff_jit_status"),
  ]);
  if (queryError || statusError) {
    const failure = staffJitFailure(queryError ?? statusError);
    return noStore(apiFail(failure.code, "Unable to load temporary access requests", failure.status));
  }
  return noStore(apiOk({ ...(data as Record<string, unknown>), ...(status as Record<string, unknown>), actorId: user.id }));
}

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return noStore(apiFail("UNAUTHORIZED", "Sign in required", 401));
  const assurance = await requireStaffAssurance(db);
  if (assurance) return noStore(assurance);
  const parsed = await parseBody(request, staffJitRequestSchema, { maxBytes: 4096 });
  if (!parsed.ok) return noStore(parsed.response);
  const { data, error: requestError } = await db.rpc("request_staff_jit_access", {
    p_request_key: parsed.data.requestKey,
    p_permission_key: parsed.data.permissionKey,
    p_duration_minutes: parsed.data.durationMinutes,
    p_reason: parsed.data.reason,
  });
  if (requestError) {
    const failure = staffJitFailure(requestError);
    return noStore(apiFail(failure.code, "Unable to request temporary access", failure.status));
  }
  return noStore(apiOk(data, { status: 201 }));
}
