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
  if (!sessionKey) return apiFail('BAD_REQUEST', 'Chat session is required for feedback.', 400);

  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  const service = createServiceClient();

  const { data: message, error: messageError } = await service
    .from('chatbot_messages')
    .select('id,role,session_id,chatbot_sessions(id,session_key,user_id)')
    .eq('id', messageId)
    .maybeSingle();
  if (messageError) return apiFail('DB_ERROR', 'Unable to verify this chat message.', 503);
  if (!message) return apiFail('NOT_FOUND', 'Chat message not found.', 404);
  if (message.role !== 'bot') return apiFail('BAD_REQUEST', 'Feedback can only be attached to a bot reply.', 422);

  const relatedSession = Array.isArray(message.chatbot_sessions)
    ? message.chatbot_sessions[0]
    : message.chatbot_sessions;
  if (
    !relatedSession
    || relatedSession.id !== message.session_id
    || relatedSession.session_key !== sessionKey
    || (relatedSession.user_id === null ? Boolean(user) : relatedSession.user_id !== user?.id)
  ) {
    return apiFail('FORBIDDEN', 'This chat session does not belong to you.', 403);
  }

  const { data: existing, error: existingError } = await service
    .from('chatbot_feedback')
    .select('id,session_id,user_id,opened_ticket')
    .eq('message_id', messageId)
    .maybeSingle();
  if (existingError) return apiFail('DB_ERROR', 'Unable to load chat feedback.', 503);

  if (existing) {
    if (existing.session_id !== message.session_id || existing.user_id !== relatedSession.user_id) {
      return apiFail('FORBIDDEN', 'This chat feedback does not belong to the current session.', 403);
    }
    const patch: Record<string, unknown> = {};
    if (helpful !== undefined) patch.helpful = helpful;
    if (openedTicket === true && existing.opened_ticket !== true) patch.opened_ticket = true;
    if (Object.keys(patch).length === 0) return apiOk({ id: existing.id });
    const { data: updated, error } = await service.from('chatbot_feedback')
      .update(patch)
      .eq('id', existing.id)
      .eq('message_id', messageId)
      .eq('session_id', message.session_id)
      .select('id')
      .maybeSingle();
    if (error) return apiFail('DB_ERROR', error.message, 500);
    if (!updated) return apiFail('CONFLICT', 'Chat feedback changed. Refresh and try again.', 409);
    return apiOk({ id: existing.id });
  }

  if (botAnswered === undefined) {
    return apiFail('BAD_REQUEST', 'botAnswered is required to record feedback for a new message', 400);
  }

  const { data: created, error } = await service
    .from('chatbot_feedback')
    .insert({
      session_id: message.session_id,
      message_id: messageId,
      user_id: relatedSession.user_id,
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
