import { createHash, randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { cleanUserContent } from "@/lib/moderation/clean";
import { classifyTicket } from "@/lib/chatbot/classify";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import { z } from "zod";

const appealSchema = z.object({
  body: z.string().trim().min(10, "Appeal must be at least 10 characters").max(2000),
}).strict();

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const parsed = await parseBody(request, appealSchema, { maxBytes: 16_384 });
  if (!parsed.ok) return parsed.response;
  // Appeals can contain identity/bank information. Keep the entire free-text
  // path local; pattern redaction alone cannot make arbitrary text public.
  const service = createServiceClient();
  let body: string;
  try { body = (await cleanUserContent(parsed.data.body, service)).display.trim(); }
  catch { return apiFail("CONTENT_PROCESSING_UNAVAILABLE", "Unable to prepare your appeal; please try again", 503); }
  if (body.length < 10) return apiFail("APPEAL_TOO_SHORT", "Please add more details after sensitive numbers are hidden.", 422);
  if (body.length > 2000) return apiFail("APPEAL_TOO_LONG", "Please shorten your appeal after sensitive information is hidden.", 422);
  const category = classifyTicket(`Account suspension appeal ${body}`);

  // Signed-in users can no longer insert support tickets directly; the live
  // service-only function checks the account is suspended and writes the ticket.
  // ponytail: a fresh operation id per request (the form sends none), so a retried
  // submit can still make a second appeal, same as before; send one from the form
  // to make retries idempotent.
  const { data, error } = await service.rpc("create_account_suspension_appeal", {
    p_user_id: user.id,
    p_operation_id: randomUUID(),
    p_payload_hash: createHash("sha256").update(JSON.stringify({ userId: user.id, body }), "utf8").digest("hex"),
    p_body: body,
    p_category: category,
  });
  if (error) {
    if (error.message.includes("account_not_suspended")) {
      return apiFail("ACCOUNT_NOT_SUSPENDED", "This account is not currently suspended. Refresh your account status before submitting an appeal.", 409);
    }
    if (error.message.includes("account_appeal_user_not_found")) return apiFail("NOT_FOUND", "This account could not be verified.", 404);
    return apiFail("WRITE_UNAVAILABLE", "We could not confirm the appeal submission. Check its status before trying again.", 503);
  }
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id !== "string") return apiFail("WRITE_UNAVAILABLE", "We could not confirm the appeal submission. Check its status before trying again.", 503);
  return apiOk({ id, category }, { status: 201 });
}
