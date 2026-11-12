import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail, parseBody } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';

interface Props {
  params: Promise<{ id: string }>;
}

const readSchema = z.object({
  surface: z.enum(['customer', 'admin']),
  lastDisplayedReplyId: z.string().uuid(),
}).strict();

export async function PATCH(request: Request, { params }: Props) {
  const { id } = await params;
  const parsed = await parseBody(request, readSchema);
  if (!parsed.ok) return parsed.response;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const service = createServiceClient();
  const { data: ticket, error: ticketError } = await service
    .from('support_tickets').select('id,user_id').eq('id', id).maybeSingle();
  if (ticketError) return apiFail('READ_UNAVAILABLE', 'Unable to update the ticket read status.', 503);
  if (!ticket) return apiFail('NOT_FOUND', 'Ticket not found', 404);

  const isAdminSurface = parsed.data.surface === 'admin';
  const canReadSurface = isAdminSurface
    ? await isSuperAdmin(supabase, user.id)
    : ticket.user_id === user.id;
  if (!canReadSurface) return apiFail('FORBIDDEN', 'Not your ticket', 403);
  const incomingRole = isAdminSurface ? 'customer' : 'admin';
  const column = isAdminSurface ? 'admin_last_read_at' : 'customer_last_read_at';
  const { data: reply, error: replyError } = await service
    .from('support_ticket_replies')
    .select('id,created_at,sender_role')
    .eq('id', parsed.data.lastDisplayedReplyId)
    .eq('ticket_id', id)
    .maybeSingle();
  if (replyError) return apiFail('READ_UNAVAILABLE', 'Unable to update the ticket read status.', 503);
  if (!reply || reply.sender_role !== incomingRole) return apiFail('BAD_REQUEST', 'The displayed reply could not be verified.', 422);

  const { data: updated, error } = await service.from('support_tickets')
    .update({ [column]: reply.created_at })
    .eq('id', id)
    .or(`${column}.is.null,${column}.lt.${reply.created_at}`)
    .select('id')
    .maybeSingle();
  if (error) return apiFail('READ_UNAVAILABLE', 'Unable to update the ticket read status.', 503);

  return apiOk({ id, column, changed: Boolean(updated) });
}
