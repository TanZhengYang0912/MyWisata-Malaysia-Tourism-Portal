// P4 — Member 4: admin ticket chatbot transcript
// GET /api/admin/tickets/[id]/transcript — see CLAUDE.md Step 9.
// Gated on super_admin/approver, checked server-side.

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdminOrApprover } from '@/lib/affiliate/admin-guard';

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: Props) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdminOrApprover(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only admin or approver can view chatbot transcripts', 403);
  }

  const { data: ticket, error: ticketErr } = await supabase
    .from('support_tickets')
    .select('session_id')
    .eq('id', id)
    .maybeSingle();
  if (ticketErr) return apiFail('DB_ERROR', ticketErr.message, 500);
  if (!ticket) return apiFail('NOT_FOUND', 'Ticket not found', 404);
  if (!ticket.session_id) return apiOk([]);

  // chatbot_messages_own's SELECT policy explicitly OR's in is_admin(auth.uid()),
  // so the cookie-aware client can read any session's transcript here.
  const { data: messages, error: msgErr } = await supabase
    .from('chatbot_messages')
    .select('id, role, body, kb_matched, created_at')
    .eq('session_id', ticket.session_id)
    .order('created_at', { ascending: true });
  if (msgErr) return apiFail('DB_ERROR', msgErr.message, 500);

  return apiOk(messages ?? []);
}
