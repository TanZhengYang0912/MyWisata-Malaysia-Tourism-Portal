// P4 — Member 4: mute/unmute a support ticket for the current user (ticket
// owner only — the "user side" of the ticket). Same shape as
// app/api/chat/threads/[id]/mute/route.ts: the cookie-aware client is
// enough, ticket_mutes' own RLS (migration 20260821000000) already enforces
// "caller must own the ticket" (insert) and "only your own row" (delete).

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

  const { error } = await supabase.from('ticket_mutes').insert({ ticket_id: id, user_id: user.id });
  if (error) {
    if (error.code === '23505') return apiOk({ ticketId: id, muted: true }); // already muted — idempotent
    if (error.code === '42501') return apiFail('FORBIDDEN', 'Not your ticket', 403);
    return apiFail('DB_ERROR', error.message, 500);
  }

  return apiOk({ ticketId: id, muted: true }, { status: 201 });
}

export async function DELETE(_request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { error } = await supabase.from('ticket_mutes').delete().eq('ticket_id', id).eq('user_id', user.id);
  if (error) return apiFail('DB_ERROR', error.message, 500);

  return apiOk({ ticketId: id, muted: false });
}
