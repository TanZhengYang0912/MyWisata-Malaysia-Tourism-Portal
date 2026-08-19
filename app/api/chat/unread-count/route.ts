// GET /api/chat/unread-count — total unread chat messages across every thread
// the caller participates in. RLS (chat_messages_participant) already scopes
// "every thread the caller participates in" per role, so no role branching
// is needed here — customer, vendor owner, and outlet manager all just work.
//
// CLAUDE-SUPPORT-MUTE-REPORT.md Feature 2: messages in a thread the caller
// has muted don't count toward this badge — "no notifications for that
// thread for the muting user." The thread and its messages are otherwise
// untouched; this only affects what this one count reports.

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: messages, error } = await supabase
    .from('chat_messages')
    .select('id, thread_id')
    .neq('sender_id', user.id);
  if (error) return apiFail('DB_ERROR', error.message, 500);

  const { data: mutes, error: mutesError } = await supabase.from('chat_thread_mutes').select('thread_id').eq('user_id', user.id);
  if (mutesError) return apiFail('DB_ERROR', mutesError.message, 500);
  const mutedThreadIds = new Set((mutes ?? []).map((m) => m.thread_id));

  const messageIds = (messages ?? []).filter((m) => !mutedThreadIds.has(m.thread_id)).map((m) => m.id);
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
