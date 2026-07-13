// P4 — Member 4: ticket reopen (CLAUDE-FIXES-2.md item 5)
// POST /api/support/tickets/[id]/reopen — customer-only (must own the
// ticket). A no-op 200 (not an error) if the ticket isn't actually
// resolved/closed — avoids a confusing failure on a stray double-click.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { notifyTicketReopened } from '@/lib/support/notify';

interface Props {
  params: Promise<{ id: string }>;
}

const LOCKED_STATUSES = new Set(['resolved', 'closed']);

export async function POST(_request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const service = createServiceClient();
  const { data: ticket } = await service
    .from('support_tickets')
    .select('id, subject, user_id, assigned_to, status')
    .eq('id', id)
    .maybeSingle();
  if (!ticket) return apiFail('NOT_FOUND', 'Ticket not found', 404);
  if (ticket.user_id !== user.id) return apiFail('FORBIDDEN', 'Not your ticket', 403);

  if (!LOCKED_STATUSES.has(ticket.status)) {
    return apiOk({ id: ticket.id, status: ticket.status });
  }

  const { data, error } = await service
    .from('support_tickets')
    .update({ status: 'in_progress', reopened_at: new Date().toISOString(), resolved_at: null })
    .eq('id', id)
    .select('id, status')
    .single();
  if (error) return apiFail('DB_ERROR', error.message, 500);

  await notifyTicketReopened(service, ticket);

  return apiOk(data);
}
