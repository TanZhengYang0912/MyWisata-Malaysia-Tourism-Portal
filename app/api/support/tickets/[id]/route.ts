// P4 — Member 4: ticket detail (CLAUDE-FIXES.md Fix 2)
// GET /api/support/tickets/[id] — ticket + its chatbot transcript + reply
// thread, in one payload. Used by BOTH the customer's ticket detail view
// and the admin ticket dialog (support_tickets' own SELECT RLS policy is
// already "owner OR is_admin()", so one route naturally serves both — no
// need for a separate admin-only version of this read).

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

  const { data: ticket, error: ticketErr } = await supabase
    .from('support_tickets')
    .select('id, user_id, session_id, subject, body, category, status, assigned_to, created_at, resolved_at, last_reply_at')
    .eq('id', id)
    .maybeSingle();
  if (ticketErr) return apiFail('DB_ERROR', ticketErr.message, 500);
  if (!ticket) return apiFail('NOT_FOUND', 'Ticket not found', 404);

  const isOwner = ticket.user_id === user.id;
  const isAdmin = await isSuperAdminOrApprover(supabase, user.id);
  if (!isOwner && !isAdmin) return apiFail('FORBIDDEN', 'Not your ticket', 403);

  let transcript: { id: string; role: string; body: string; created_at: string; kbRefs: { title: string; score: number | null }[] }[] = [];
  if (ticket.session_id) {
    // chatbot_sessions_own now ORs in is_admin() (migration 014's Feature A
    // RLS fix), and chatbot_messages_own's EXISTS subquery reads through
    // that — so this works for both the owner and an admin without needing
    // the service-role client.
    const { data: messages } = await supabase
      .from('chatbot_messages')
      .select('id, role, body, created_at')
      .eq('session_id', ticket.session_id)
      .order('created_at', { ascending: true });

    // Provenance (CLAUDE-PHASE2.md Feature A) — included for every caller,
    // not just the admin dialog that originally had this; harmless for the
    // customer view (it just won't render it), and this route replaces
    // what used to be a separate admin-only /transcript endpoint.
    const messageIds = (messages ?? []).map((m) => m.id);
    const refsByMessage = new Map<string, { title: string; score: number | null }[]>();
    if (messageIds.length > 0) {
      const { data: refs } = await supabase
        .from('chatbot_message_kb_refs')
        .select('message_id, score, chatbot_kb_documents(title)')
        .in('message_id', messageIds);
      for (const r of refs ?? []) {
        const doc = Array.isArray(r.chatbot_kb_documents) ? r.chatbot_kb_documents[0] : r.chatbot_kb_documents;
        const list = refsByMessage.get(r.message_id) ?? [];
        list.push({ title: doc?.title ?? 'Unknown doc', score: r.score !== null ? Number(r.score) : null });
        refsByMessage.set(r.message_id, list);
      }
    }

    transcript = (messages ?? []).map((m) => ({ ...m, kbRefs: refsByMessage.get(m.id) ?? [] }));
  }

  const { data: replies } = await supabase
    .from('support_ticket_replies')
    .select('id, sender_id, sender_role, body, created_at')
    .eq('ticket_id', id)
    .order('created_at', { ascending: true });

  return apiOk({
    id: ticket.id,
    userId: ticket.user_id,
    subject: ticket.subject,
    body: ticket.body,
    category: ticket.category,
    status: ticket.status,
    assignedTo: ticket.assigned_to,
    createdAt: ticket.created_at,
    resolvedAt: ticket.resolved_at,
    lastActivityAt: ticket.last_reply_at ?? ticket.created_at,
    transcript,
    replies: replies ?? [],
  });
}
