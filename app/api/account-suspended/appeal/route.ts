import { createHash } from "node:crypto";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { cleanUserContent } from "@/lib/moderation/clean";
import { classifyTicket } from "@/lib/chatbot/classify";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";

const appealSchema = z.object({
  body: z.string().trim().min(10, "Appeal must be at least 10 characters").max(2000),
  operationId: z.string().uuid(),
}).strict();

const appealResultSchema = z.object({
  id: z.string().uuid(),
  category: z.string(),
  created: z.boolean(),
});

const allowedCategories = new Set(["booking", "payment", "vendor", "withdrawal", "kyc", "technical", "affiliate", "general"]);

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
  if (body.length < 10) {
    return apiFail("APPEAL_TOO_SHORT", "Please add more details after sensitive numbers are hidden.", 422);
  }
  if (body.length > 2000) {
    return apiFail("APPEAL_TOO_LONG", "Please shorten your appeal after sensitive information is hidden.", 422);
  }

  const category = classifyTicket(`Account suspension appeal ${body}`);
  const payloadHash = createHash("sha256")
    .update(JSON.stringify({ userId: user.id, body }), "utf8")
    .digest("hex");
  const { data, error } = await service.rpc("create_account_suspension_appeal", {
    p_user_id: user.id,
    p_operation_id: parsed.data.operationId,
    p_payload_hash: payloadHash,
    p_body: body,
    p_category: category,
  });

  if (error) {
    if (error.message.includes("account_not_suspended")) {
      return apiFail("ACCOUNT_NOT_SUSPENDED", "This account is not currently suspended. Refresh your account status before submitting an appeal.", 409);
    }
    if (error.message.includes("support_ticket_operation_conflict")) {
      return apiFail("OPERATION_CONFLICT", "This appeal reference was already used for different details. Check the submission result before starting a new appeal.", 409);
    }
    if (error.message.includes("account_appeal_user_not_found")) {
      return apiFail("NOT_FOUND", "This account could not be verified.", 404);
    }
    return apiFail("WRITE_UNAVAILABLE", "We could not confirm the appeal submission. Check its status before trying again.", 503);
  }

  const result = appealResultSchema.safeParse(data);
  if (!result.success || !allowedCategories.has(result.data.category)) {
    return apiFail("WRITE_UNAVAILABLE", "We could not confirm the appeal submission. Check its status before trying again.", 503);
  }
  return apiOk({ id: result.data.id, category: result.data.category }, { status: result.data.created ? 201 : 200 });
}
