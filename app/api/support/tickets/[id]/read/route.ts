// P4 — Member 4: mark a ticket read (CLAUDE-FIXES-2.md item 1)
// PATCH /api/support/tickets/[id]/read — sets customer_last_read_at or
// admin_last_read_at depending on which the caller actually is. Call this
// when the thread is actually opened (ticket detail mount), not when a list
// merely renders a row — matches the doc's own instruction.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';

interface Props {
  params: Promise<{ id: string }>;
}

export async function PATCH(_request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const service = createServiceClient();
  const { data: ticket } = await service.from('support_tickets').select('id, user_id').eq('id', id).maybeSingle();
  if (!ticket) return apiFail('NOT_FOUND', 'Ticket not found', 404);

  const isAdmin = await isSuperAdmin(supabase, user.id);
  const isOwner = ticket.user_id === user.id;
  if (!isAdmin && !isOwner) return apiFail('FORBIDDEN', 'Not your ticket', 403);

  // Admin takes priority if somehow both — an admin viewing their own
  // ticket (unlikely, but not impossible on a demo account) is acting as
  // admin here, since that's the role-gated dashboard they're using.
  const column = isAdmin ? 'admin_last_read_at' : 'customer_last_read_at';
  const { error } = await service.from('support_tickets').update({ [column]: new Date().toISOString() }).eq('id', id);
  if (error) return apiFail('DB_ERROR', error.message, 500);

  return apiOk({ id, column });
}
