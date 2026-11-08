// GET /api/chat/unread-count — total unread chat messages across every thread
// the caller participates in. Explicitly scope threads because legacy RLS
// still grants Wallet Approver a broader administrative read permission.
//
// CLAUDE-SUPPORT-MUTE-REPORT.md Feature 2: messages in a thread the caller
// has muted don't count toward this badge — "no notifications for that
// thread for the muting user." The thread and its messages are otherwise
// untouched; this only affects what this one count reports.
//
// The count is one aggregate RPC (get_chat_unread_count applies the thread
// scope and mutes). There is deliberately no app-side fallback: the old one
// loaded every message in every thread on each refresh. If the RPC fails,
// the badge keeps its last-known count.

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: count, error } = await supabase.rpc('get_chat_unread_count');
  if (error || typeof count !== 'number') {
    console.error('[chat/unread-count] get_chat_unread_count failed', error?.message ?? 'non-numeric result');
    return apiFail('UNREAD_COUNT_UNAVAILABLE', 'Unread count is unavailable right now', 503);
  }
  return apiOk({ count });
}
