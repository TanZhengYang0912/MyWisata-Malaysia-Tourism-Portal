import { z } from 'zod';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';
import { cleanUserContent } from '@/lib/moderation/clean';
import { createClient } from '@/lib/supabase/server';
import { createHandoffToken, type HandoffSource } from '@/lib/support/handoff-token';

const schema = z.object({
  subject: z.string().trim().min(1).max(255),
  summary: z.string().trim().min(1).max(2000),
  sessionKey: z.string().min(1).max(64).optional(),
  messageId: z.string().uuid().optional(),
}).strict();

export async function POST(request: Request) {
  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  try {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();
    if (!user) return apiFail('UNAUTHORIZED', 'Sign in to prepare a support ticket.', 401);
    const service = createServiceClient();
    let source: HandoffSource = { sessionId: null, botMessageId: null, userMessageId: null, userMessageBody: null };
    if (parsed.data.messageId && !parsed.data.sessionKey) {
      return apiFail('HANDOFF_REVIEW_REQUIRED', 'Review the ticket details again before submitting.', 409);
    }
    if (parsed.data.messageId && parsed.data.sessionKey) {
      const { data: session, error: sessionError } = await service
        .from('chatbot_sessions')
        .select('id, user_id')
        .eq('session_key', parsed.data.sessionKey)
        .maybeSingle();
      if (sessionError) return apiFail('READ_UNAVAILABLE', 'Unable to verify the selected conversation.', 503);
      if (!session || session.user_id !== user.id) return apiFail('FORBIDDEN', 'This conversation is not available to this account.', 403);
      const { data: botMessage, error: botMessageError } = await service
        .from('chatbot_messages')
        .select('id, reply_to_message_id')
        .eq('id', parsed.data.messageId)
        .eq('session_id', session.id)
        .eq('role', 'bot')
        .maybeSingle();
      if (botMessageError) return apiFail('READ_UNAVAILABLE', 'Unable to verify the selected conversation.', 503);
      if (!botMessage?.reply_to_message_id) return apiFail('HANDOFF_REVIEW_REQUIRED', 'Review the ticket details again before submitting.', 409);
      const { data: userMessage, error: userMessageError } = await service
        .from('chatbot_messages')
        .select('id, body')
        .eq('id', botMessage.reply_to_message_id)
        .eq('session_id', session.id)
        .eq('role', 'user')
        .maybeSingle();
      if (userMessageError) return apiFail('READ_UNAVAILABLE', 'Unable to verify the selected conversation.', 503);
      if (!userMessage) return apiFail('HANDOFF_REVIEW_REQUIRED', 'Review the ticket details again before submitting.', 409);
      source = {
        sessionId: session.id,
        botMessageId: botMessage.id,
        userMessageId: userMessage.id,
        userMessageBody: userMessage.body,
      };
    }
    const [subject, summary] = await Promise.all([
      cleanUserContent(parsed.data.subject, service),
      cleanUserContent(parsed.data.summary, service),
    ]);
    const handoffToken = await createHandoffToken(user.id, subject.display, summary.display, source);
    const response = apiOk({
      subject: subject.display,
      summary: summary.display,
      handoffToken,
      sourceMessageId: source.userMessageId,
      sourceMessage: source.userMessageBody,
    });
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  } catch {
    return apiFail('PREVIEW_UNAVAILABLE', 'The ticket preview is temporarily unavailable. Try again.', 503);
  }
}
