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

  const service = createServiceClient();
  const { data: thread, error: threadError } = await service
    .from('chat_threads')
    .select('id,customer_id')
    .eq('id', threadId)
    .maybeSingle();
  if (threadError) return apiFail('DB_ERROR', threadError.message, 500);
  if (!thread) return apiFail('NOT_FOUND', 'Conversation not found', 404);
  if (thread.customer_id !== user.id) return apiFail('FORBIDDEN', 'Not your conversation', 403);

  const { data: messages, error: messagesError } = await service
    .from('chat_messages')
    .select('id')
    .eq('thread_id', threadId)
    .neq('sender_id', user.id);
  if (messagesError) return apiFail('DB_ERROR', messagesError.message, 500);

  if ((messages ?? []).length > 0) {
    const { error: readError } = await service
      .from('chat_message_reads')
      .upsert((messages ?? []).map((message) => ({ message_id: message.id, user_id: user.id })), { onConflict: 'message_id,user_id' });
    if (readError) return apiFail('DB_ERROR', readError.message, 500);
  }

  return apiOk({ threadId, readCount: messages?.length ?? 0 });
}
