// P4 — Member 4: ticket detail (CLAUDE-FIXES.md Fix 2)
// GET /api/support/tickets/[id] — ticket + explicit reply thread in one
// payload. Used by BOTH the customer's ticket detail view
// and the admin ticket dialog (support_tickets' own SELECT RLS policy is
// already "owner OR is_admin()", so one route naturally serves both — no
// need for a separate admin-only version of this read).

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const service = createServiceClient();
  const { data: ticket, error: ticketErr } = await service
    .from('support_tickets')
    .select('id, user_id, session_id, withdrawal_id, subject, body, category, status, assigned_to, created_at, resolved_at, last_reply_at')
    .eq('id', id)
    .maybeSingle();
  if (ticketErr) return apiFail('READ_UNAVAILABLE', 'Unable to load this support request.', 503);
  if (!ticket) return apiFail('NOT_FOUND', 'Ticket not found', 404);

  const isOwner = ticket.user_id === user.id;
  const isAdmin = await isSuperAdmin(supabase, user.id);
  if (!isOwner && !isAdmin) return apiFail('FORBIDDEN', 'Not your ticket', 403);

  // The ticket thread contains only its submitted body and explicit replies.

  const { data: replies, error: repliesError } = await service
    .from('support_ticket_replies')
    .select('id, sender_id, sender_role, body, attachment_url, created_at')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true });
  if (repliesError) return apiFail('READ_UNAVAILABLE', 'Unable to load ticket replies.', 503);

  // ticket_mutes' own RLS already scopes this to the caller's own row — an
  // admin viewing someone else's ticket just gets no row, which is correct
  // (mute is "user side" only, an admin's own read of it is never relevant).
  const { data: muteRow } = await service.from('ticket_mutes').select('id').eq('ticket_id', id).eq('user_id', user.id).maybeSingle();

  return apiOk({
    id: ticket.id,
    viewerIsOwner: isOwner,
    withdrawalId: ticket.withdrawal_id,
    subject: ticket.subject,
    body: ticket.body,
    category: ticket.category,
    status: ticket.status,
    createdAt: ticket.created_at,
    resolvedAt: ticket.resolved_at,
    lastActivityAt: ticket.last_reply_at ?? ticket.created_at,
    muted: Boolean(muteRow),
    replies: (replies ?? []).map((reply) => {
      const extension = reply.attachment_url?.split('.').pop()?.toLowerCase() ?? null;
      return {
        id: reply.id,
        is_mine: reply.sender_id === user.id,
        sender_role: reply.sender_role,
        body: reply.body,
        created_at: reply.created_at,
        attachment_type: extension === 'jpg' || extension === 'jpeg' || extension === 'png' || extension === 'webp'
          ? 'image'
          : extension === 'pdf' ? 'document' : null,
      };
    }),
  });
}
