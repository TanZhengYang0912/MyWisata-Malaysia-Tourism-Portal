// P4 — Member 4: ticket replies (CLAUDE-FIXES.md Fix 2, CLAUDE-FIXES-2.md item 5)
// POST /api/support/tickets/[id]/replies — body { body }. Used by both the
// ticket owner and an admin — sender_role is resolved SERVER-SIDE from
// which one the caller actually is, never trusted from the request body.
//
// ⚠️ CLAUDE-FIXES-2.md item 5 OVERRIDES CLAUDE-FIXES.md's original behavior:
// a customer reply used to auto-reopen a resolved/closed ticket. It no
// longer does — a resolved/closed ticket now BLOCKS customer replies (403)
// until they explicitly hit Reopen (POST .../reopen, a separate route).
// Admins are exempt from the lock and can always reply regardless of status.
//
// Side effects:
//   - customer reply while status is resolved/closed -> 403, blocked
//   - first admin reply on an unassigned ticket -> assigned_to = that admin,
//     status 'open' -> 'in_progress' (CLAUDE-FIXES-2.md item 4). Done in the
//     same update as the reply insert's follow-up write, so status/assignment
//     can never drift out of sync with "an admin actually replied."
//   - always: last_reply_at = now()
//   - notify the other side (lib/support/notify.ts)

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { createTicketReplySchema } from '@/lib/validation/chatbot-schemas';
import { isSuperAdminOrApprover } from '@/lib/affiliate/admin-guard';
import { notifyTicketReply } from '@/lib/support/notify';

interface Props {
  params: Promise<{ id: string }>;
}

const LOCKED_STATUSES = new Set(['resolved', 'closed']);

export async function POST(request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, createTicketReplySchema);
  if (!parsed.ok) return parsed.response;
  const { body } = parsed.data;

  const service = createServiceClient();
  const { data: ticket } = await service
    .from('support_tickets')
    .select('id, subject, user_id, assigned_to, status')
    .eq('id', id)
    .maybeSingle();
  if (!ticket) return apiFail('NOT_FOUND', 'Ticket not found', 404);

  const isAdmin = await isSuperAdminOrApprover(supabase, user.id);
  const isOwner = ticket.user_id === user.id;
  if (!isAdmin && !isOwner) return apiFail('FORBIDDEN', 'Not your ticket', 403);
  const senderRole: 'customer' | 'admin' = isAdmin ? 'admin' : 'customer';

  // Server-side enforcement — a disabled button on the client is not
  // security (CLAUDE-FIXES-2.md's own words). Admins are exempt.
  if (senderRole === 'customer' && LOCKED_STATUSES.has(ticket.status)) {
    return apiFail('TICKET_LOCKED', 'This ticket is resolved. Reopen it to reply.', 403);
  }

  const { data: reply, error: replyErr } = await service
    .from('support_ticket_replies')
    .insert({ ticket_id: id, sender_id: user.id, sender_role: senderRole, body })
    .select('id, sender_id, sender_role, body, created_at')
    .single();
  if (replyErr) return apiFail('DB_ERROR', replyErr.message, 500);

  const statusUpdate: { last_reply_at: string; status?: string; assigned_to?: string } = {
    last_reply_at: new Date().toISOString(),
  };
  if (senderRole === 'admin') {
    if (ticket.status === 'open') statusUpdate.status = 'in_progress';
    if (!ticket.assigned_to) statusUpdate.assigned_to = user.id;
  }
  await service.from('support_tickets').update(statusUpdate).eq('id', id);

  await notifyTicketReply(service, ticket, senderRole, body);

  return apiOk(
    {
      id: reply.id,
      senderId: reply.sender_id,
      senderRole: reply.sender_role,
      body: reply.body,
      createdAt: reply.created_at,
      newStatus: statusUpdate.status ?? ticket.status,
    },
    { status: 201 },
  );
}
