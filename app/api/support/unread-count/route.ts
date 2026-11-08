// P4 — Member 4: unread ticket count (CLAUDE-FIXES-2.md item 1)
// GET /api/support/unread-count — role-aware: a customer gets the count of
// their own tickets with an unread admin reply; an admin gets the count of
// ALL tickets with an unread customer reply (the queue-wide "there's stuff
// to look at" signal, not just their own assigned tickets).
//
// The count is one aggregate RPC. There is deliberately no app-side fallback:
// the old one loaded every open ticket and reply on each poll. If the RPC
// fails, the badge keeps its last-known count (every caller treats a non-200
// as "leave it").

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: count, error } = await supabase.rpc('get_support_unread_count');
  if (error || typeof count !== 'number') {
    console.error('[support/unread-count] get_support_unread_count failed', error?.message ?? 'non-numeric result');
    return apiFail('UNREAD_COUNT_UNAVAILABLE', 'Unread count is unavailable right now', 503);
  }
  return apiOk({ count });
}
