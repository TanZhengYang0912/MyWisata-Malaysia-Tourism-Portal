// GET /api/chat/unread-count — total unread chat messages across every thread
// the caller participates in. Explicitly scope threads because legacy RLS
// still grants Wallet Approver a broader administrative read permission.
//
// CLAUDE-SUPPORT-MUTE-REPORT.md Feature 2: messages in a thread the caller
// has muted don't count toward this badge — "no notifications for that
// thread for the muting user." The thread and its messages are otherwise
// untouched; this only affects what this one count reports.

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { accessibleChatThreadIds } from '@/lib/chat/authorization';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: rpcCount, error: countError } = await supabase.rpc('get_chat_unread_count');
  if (!countError && typeof rpcCount === 'number') return apiOk({ count: rpcCount });

  // Keep the established read path during staged deployments before the
  // aggregate RPC migration has reached the database.

  const { data: threads, error: threadError } = await supabase.from('chat_threads').select('id,customer_id,outlet_id');
  if (threadError) return apiFail('DB_ERROR', 'Unable to load conversations', 500);
  const threadIds = [...await accessibleChatThreadIds(supabase, user.id, threads ?? [])];
  if (!threadIds.length) return apiOk({ count: 0 });

  const { data: messages, error } = await supabase
    .from('chat_messages')
    .select('id, thread_id')
    .in('thread_id', threadIds)
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
