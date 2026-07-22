// P4 — Member 4: chatbot feedback + opt-in escalation.
// CLAUDE-CHATBOT-FEEDBACK.md. POST /api/chatbot/feedback — body
// { sessionKey?, messageId, question?, botAnswered?, helpful?, openedTicket? }.
//
// Upserts on messageId, not a plain insert: the first call for a message
// (a helpful y/n click, or the widget's automatic record when the bot
// couldn't answer) creates the row and requires botAnswered. Every
// subsequent call (a later "open a ticket" click setting openedTicket)
// updates that same row instead of creating a second one — one feedback
// row per bot message, matching the schema's own UNIQUE(message_id).
//
// chatbot_feedback has RLS with a SELECT-only own-or-admin policy (same
// shape as chatbot_messages) — no INSERT/UPDATE policy, so this needs the
// service-role client, same reason as the ask/tickets routes.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { chatbotFeedbackSchema } from '@/lib/validation/chatbot-schemas';

export async function POST(request: Request) {
  const parsed = await parseBody(request, chatbotFeedbackSchema);
  if (!parsed.ok) return parsed.response;
  const { sessionKey, messageId, question, botAnswered, helpful, openedTicket } = parsed.data;

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  const service = createServiceClient();

  const { data: existing } = await service
    .from('chatbot_feedback')
    .select('id')
    .eq('message_id', messageId)
    .maybeSingle();

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (helpful !== undefined) patch.helpful = helpful;
    if (openedTicket !== undefined) patch.opened_ticket = openedTicket;
    if (Object.keys(patch).length === 0) return apiOk({ id: existing.id });
    const { error } = await service.from('chatbot_feedback').update(patch).eq('id', existing.id);
    if (error) return apiFail('DB_ERROR', error.message, 500);
    return apiOk({ id: existing.id });
  }

  if (botAnswered === undefined) {
    return apiFail('BAD_REQUEST', 'botAnswered is required to record feedback for a new message', 400);
  }

  let sessionId: string | null = null;
  if (sessionKey) {
    const { data: session } = await service.from('chatbot_sessions').select('id').eq('session_key', sessionKey).maybeSingle();
    sessionId = session?.id ?? null;
  }

  const { data: created, error } = await service
    .from('chatbot_feedback')
    .insert({
      session_id: sessionId,
      message_id: messageId,
      user_id: user?.id ?? null,
      question: question ?? null,
      bot_answered: botAnswered,
      helpful: helpful ?? null,
      opened_ticket: openedTicket ?? false,
    })
    .select('id')
    .single();
  if (error) return apiFail('DB_ERROR', error.message, 500);

  return apiOk({ id: created.id }, { status: 201 });
}
