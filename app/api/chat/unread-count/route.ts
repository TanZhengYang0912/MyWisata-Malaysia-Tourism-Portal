// GET /api/chat/unread-count — total unread chat messages across every thread
// the caller participates in. RLS (chat_messages_participant) already scopes
// "every thread the caller participates in" per role, so no role branching
// is needed here — customer, vendor owner, and outlet manager all just work.

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: messages, error } = await supabase
    .from('chat_messages')
    .select('id')
    .neq('sender_id', user.id);
  if (error) return apiFail('DB_ERROR', error.message, 500);
  const messageIds = (messages ?? []).map((m) => m.id);
  if (messageIds.length === 0) return apiOk({ count: 0 });

  const { data: reads, error: readsError } = await supabase
    .from('chat_message_reads')
    .select('message_id')
    .eq('user_id', user.id)
    .in('message_id', messageIds);
  if (readsError) return apiFail('DB_ERROR', readsError.message, 500);
  const readIds = new Set((reads ?? []).map((row) => row.message_id));
  const count = messageIds.filter((id) => !readIds.has(id)).length;
  return apiOk({ count });
}
