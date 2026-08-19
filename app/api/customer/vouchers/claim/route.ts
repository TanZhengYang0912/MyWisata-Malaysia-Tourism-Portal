import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";

const claimSchema = z.object({ voucherId: z.string().uuid() }).strict();

function claimError(error: { message?: string } | null) {
  const message = (error?.message ?? "").toLowerCase();
  if (message.includes("already_claimed")) return apiFail("ALREADY_CLAIMED", "You have already claimed this voucher.", 409);
  if (message.includes("claim_closed")) return apiFail("VOUCHER_CLAIM_CLOSED", "This voucher is no longer available to claim.", 409);
  if (message.includes("not_started")) return apiFail("VOUCHER_CLAIM_NOT_STARTED", "This voucher is not available to claim yet.", 409);
  if (message.includes("limit_reached")) return apiFail("VOUCHER_LIMIT_REACHED", "This voucher has reached its available limit.", 409);
  if (message.includes("expired")) return apiFail("VOUCHER_EXPIRED", "This voucher has expired.", 409);
  if (message.includes("not_claimable")) return apiFail("VOUCHER_NOT_CLAIMABLE", "This voucher is not available to claim.", 409);
  return apiFail("CLAIM_FAILED", "We could not claim this voucher. Please try again.", 500);
}

export async function POST(request: Request) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const parsed = await parseBody(request, claimSchema);
  if (!parsed.ok) return parsed.response;

  const { data, error } = await db.rpc("claim_voucher", { p_voucher_id: parsed.data.voucherId });
  if (error) return claimError(error);
  return apiOk({ claim: data }, { status: 201 });
}
