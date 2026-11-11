import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk, parseBody } from '@/lib/validation/schemas';

const querySchema = z.object({
  sessionKey: z.string().min(1).max(64),
  beforeCreatedAt: z.string().datetime().optional(),
  beforeId: z.string().uuid().optional(),
}).strict().refine((value) => Boolean(value.beforeCreatedAt) === Boolean(value.beforeId));

export async function POST(request: Request) {
  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  const parsed = await parseBody(request, querySchema);
  if (!parsed.ok) return parsed.response;

  const service = createServiceClient();
  let sessionQuery = service.from('chatbot_sessions')
    .select('id')
    .eq('session_key', parsed.data.sessionKey)
    .eq('channel', 'customer');
  sessionQuery = user ? sessionQuery.eq('user_id', user.id) : sessionQuery.is('user_id', null);
  const { data: session, error: sessionError } = await sessionQuery.maybeSingle();
  if (sessionError) return apiFail('READ_UNAVAILABLE', 'Unable to restore this conversation.', 503);
  if (!session) return apiFail('NOT_FOUND', 'This conversation is no longer available.', 404);

  let query = service.from('chatbot_messages')
    .select('id, role, body, kb_matched, reply_to_message_id, created_at')
    .eq('session_id', session.id)
    .in('role', ['user', 'bot']);
  if (parsed.data.beforeCreatedAt && parsed.data.beforeId) {
    query = query.or(`created_at.lt.${parsed.data.beforeCreatedAt},and(created_at.eq.${parsed.data.beforeCreatedAt},id.lt.${parsed.data.beforeId})`);
  }
  const { data: rows, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(30);
  if (error) return apiFail('READ_UNAVAILABLE', 'Unable to restore this conversation.', 503);

  const messages = (rows ?? []).reverse();
  const questionById = new Map(messages.filter((row) => row.role === 'user').map((row) => [row.id, row.body]));
  const missingQuestionIds = [...new Set(messages
    .filter((row) => row.role === 'bot' && row.reply_to_message_id && !questionById.has(row.reply_to_message_id))
    .map((row) => row.reply_to_message_id as string))];
  if (missingQuestionIds.length) {
    const { data: linkedQuestions, error: linkedQuestionError } = await service.from('chatbot_messages')
      .select('id, body')
      .eq('session_id', session.id)
      .eq('role', 'user')
      .in('id', missingQuestionIds)
      .limit(30);
    if (linkedQuestionError) return apiFail('READ_UNAVAILABLE', 'Unable to restore this conversation.', 503);
    for (const question of linkedQuestions ?? []) questionById.set(question.id, question.body);
  }
  const botIds = messages.filter((row) => row.role === 'bot').map((row) => row.id);
  let feedbackByMessage = new Map<string, { helpful: boolean | null; opened_ticket: boolean }>();
  if (botIds.length) {
    const { data: feedback, error: feedbackError } = await service.from('chatbot_feedback')
      .select('message_id, helpful, opened_ticket')
      .eq('session_id', session.id)
      .in('message_id', botIds);
    if (feedbackError) return apiFail('READ_UNAVAILABLE', 'Unable to restore this conversation.', 503);
    feedbackByMessage = new Map((feedback ?? []).map((item) => [item.message_id, { helpful: item.helpful, opened_ticket: item.opened_ticket }]));
  }

  const oldest = messages[0];
  const response = apiOk({
    messages: messages.map((row) => {
      const feedback = feedbackByMessage.get(row.id);
      return {
        id: row.id,
        role: row.role,
        text: row.body,
        createdAt: row.created_at,
        question: row.role === 'bot' && row.reply_to_message_id ? questionById.get(row.reply_to_message_id) : undefined,
        feedbackStage: row.role !== 'bot' ? undefined
          : feedback?.opened_ticket ? 'ticket_created'
          : feedback?.helpful === true ? 'helpful_done'
          : feedback?.helpful === false ? 'awaiting_ticket'
          : row.kb_matched ? 'awaiting_helpful' : 'awaiting_ticket',
        botAnswered: row.role === 'bot' ? Boolean(row.kb_matched) : undefined,
      };
    }),
    nextCursor: messages.length === 30 && oldest ? { createdAt: oldest.created_at, id: oldest.id } : null,
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
