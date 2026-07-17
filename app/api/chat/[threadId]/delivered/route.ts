import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';

interface Props {
  params: Promise<{ threadId: string }>;
}

export async function POST(_request: Request, { params }: Props) {
  const { threadId } = await params;
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  // chat_threads_participant RLS scopes this to threads the caller can see —
  // customer, vendor owner, outlet manager, or admin. A miss means not a participant.
  const { data: thread, error: threadError } = await authClient
    .from('chat_threads')
    .select('id')
    .eq('id', threadId)
    .maybeSingle();
  if (threadError) return apiFail('DB_ERROR', threadError.message, 500);
  if (!thread) return apiFail('NOT_FOUND', 'Conversation not found', 404);

  const service = createServiceClient();
  const { data: messages, error: messagesError } = await service
    .from('chat_messages')
    .select('id')
    .eq('thread_id', threadId)
    .neq('sender_id', user.id);
  if (messagesError) return apiFail('DB_ERROR', messagesError.message, 500);
  const messageIds = (messages ?? []).map((message) => message.id);
  if (messageIds.length === 0) return apiOk({ threadId, deliveredCount: 0 });

  const { data: alreadyDelivered, error: deliveredIdsError } = await service
    .from('chat_message_deliveries')
    .select('message_id')
    .eq('user_id', user.id)
    .in('message_id', messageIds);
  if (deliveredIdsError) return apiFail('DB_ERROR', deliveredIdsError.message, 500);
  const deliveredIds = new Set((alreadyDelivered ?? []).map((row) => row.message_id));
  const undeliveredIds = messageIds.filter((id) => !deliveredIds.has(id));
  if (undeliveredIds.length === 0) return apiOk({ threadId, deliveredCount: 0 });

  const { error: deliveredError } = await service
    .from('chat_message_deliveries')
    .upsert(undeliveredIds.map((id) => ({ message_id: id, user_id: user.id })), { onConflict: 'message_id,user_id' });
  if (deliveredError) return apiFail('DB_ERROR', deliveredError.message, 500);

  return apiOk({ threadId, deliveredCount: undeliveredIds.length });
}
