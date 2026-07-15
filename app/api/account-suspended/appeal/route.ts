import { createClient } from "@/lib/supabase/server";
import { moderateAccountText } from "@/lib/moderation";
import { classifyTicketSmart } from "@/lib/chatbot/classify-ai";
import { apiFail, apiOk, parseBody } from "@/lib/validation/schemas";
import { z } from "zod";

const appealSchema = z.object({
  body: z.string().trim().min(10, "Appeal must be at least 10 characters").max(2000),
}).strict();

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail("UNAUTHORIZED", "Sign in required", 401);

  const parsed = await parseBody(request, appealSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data.body;

  const moderation = await moderateAccountText(body, "suspension_appeal");
  if (moderation.error === "api_unavailable") {
    return apiFail("MODERATION_UNAVAILABLE", "Content review is temporarily unavailable; please try again", 503);
  }
  if (moderation.flagged) {
    return apiFail("CONTENT_REJECTED", "This appeal contains disallowed content", 422);
  }

  const { category, method } = await classifyTicketSmart("Account suspension appeal", body);
  const { data, error } = await supabase
    .from("support_tickets")
    .insert({
      user_id: user.id,
      session_id: null,
      subject: "Account suspension appeal",
      body,
      category,
      classification_method: method,
      status: "open",
    })
    .select("id")
    .single();

  if (error) return apiFail("DB_ERROR", error.message, 500);
  return apiOk({ id: data.id, category }, { status: 201 });
}
