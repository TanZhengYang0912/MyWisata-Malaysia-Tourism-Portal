import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { accessibleChatThreadIds } from '@/lib/chat/authorization';

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
    .select('id,customer_id,outlet_id')
    .eq('id', threadId)
    .maybeSingle();
  if (threadError) return apiFail('DB_ERROR', threadError.message, 500);
  if (!thread) return apiFail('NOT_FOUND', 'Conversation not found', 404);
  if (!(await accessibleChatThreadIds(authClient, user.id, [thread])).has(thread.id)) {
    return apiFail('FORBIDDEN', 'Not a participant in this conversation', 403);
  }

  // One INSERT ... SELECT (mark_chat_thread_read, service-role only) instead
  // of loading every message ID and every existing read row first.
  const service = createServiceClient();
  const { data: readCount, error: readError } = await service.rpc('mark_chat_thread_read', { p_user_id: user.id, p_thread_id: threadId });
  if (readError) return apiFail('DB_ERROR', readError.message, 500);

  // lib/chat/notify.ts keeps one bell notification per (thread, recipient);
  // opening the conversation has read it, so clear the bell too. Best-effort:
  // the messages are already marked read, and the bell catches up on its own.
  const { error: notificationError } = await service
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('event_key', `chat:${threadId}:${user.id}`)
    .eq('user_id', user.id)
    .is('read_at', null);
  if (notificationError) console.error('[chat/read] notification clear failed', notificationError.message);

  return apiOk({ threadId, readCount: Number(readCount ?? 0) });
}
