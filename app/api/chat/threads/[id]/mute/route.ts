// P4 — CLAUDE-SUPPORT-MUTE-REPORT.md Feature 2: mute/unmute a vendor<->user
// chat thread for the current user only. The cookie-aware client is enough —
// chat_thread_mutes' own RLS (migration 20260813000000) already enforces
// "caller must be a participant" (insert) and "only your own row" (delete),
// so there's nothing left for the route to re-check.

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(_request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { error } = await supabase.from('chat_thread_mutes').insert({ thread_id: id, user_id: user.id });
  if (error) {
    if (error.code === '23505') return apiOk({ threadId: id, muted: true }); // already muted — idempotent
    if (error.code === '42501') return apiFail('FORBIDDEN', 'Not a participant in this chat', 403);
    return apiFail('DB_ERROR', error.message, 500);
  }

  return apiOk({ threadId: id, muted: true }, { status: 201 });
}

export async function DELETE(_request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { error } = await supabase.from('chat_thread_mutes').delete().eq('thread_id', id).eq('user_id', user.id);
  if (error) return apiFail('DB_ERROR', error.message, 500);

  return apiOk({ threadId: id, muted: false });
}
