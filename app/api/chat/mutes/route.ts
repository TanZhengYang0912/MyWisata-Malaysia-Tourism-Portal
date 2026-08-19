// P4 — CLAUDE-SUPPORT-MUTE-REPORT.md Feature 2: which of the caller's own
// threads are muted. Not explicitly named in the spec's API bullet, but the
// UI needs a way to know current mute state to render the icon/toggle at
// all — chat_thread_mutes_own_select already scopes this to the caller.

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data, error } = await supabase.from('chat_thread_mutes').select('thread_id').eq('user_id', user.id);
  if (error) return apiFail('DB_ERROR', error.message, 500);

  return apiOk((data ?? []).map((row) => row.thread_id));
}
