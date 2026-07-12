// P4 — Member 4: admin ticket list
// GET /api/admin/tickets?category=&status= — see CLAUDE.md Step 9.
// Gated on super_admin/approver, checked server-side.
//
// Reads support_tickets.category directly rather than going through
// identity.ts::getSupportTickets() — that function maps category: t.body
// (a leftover from before this column existed), which is now stale. See
// CLAUDE.md Step 8's note.

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdminOrApprover } from '@/lib/affiliate/admin-guard';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdminOrApprover(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only admin or approver can view support tickets', 403);
  }

  const url = new URL(request.url);
  const category = url.searchParams.get('category');
  const status = url.searchParams.get('status');

  let query = supabase
    .from('support_tickets')
    .select('id, user_id, session_id, subject, body, category, status, created_at, resolved_at')
    .order('created_at', { ascending: false });
  if (category) query = query.eq('category', category);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return apiFail('DB_ERROR', error.message, 500);

  const rows = data ?? [];
  const userIds = [...new Set(rows.map((t) => t.user_id).filter((id): id is string => Boolean(id)))];
  const { data: usersData } = userIds.length
    ? await supabase.from('users').select('id, full_name, email').in('id', userIds)
    : { data: [] as { id: string; full_name: string | null; email: string }[] };
  const usersById = new Map((usersData ?? []).map((u) => [u.id, u]));

  const tickets = rows.map((t) => {
    const requester = t.user_id ? usersById.get(t.user_id) : undefined;
    return {
      id: t.id,
      userId: t.user_id,
      userName: t.user_id ? (requester?.full_name ?? requester?.email ?? 'Unknown user') : 'Guest',
      sessionId: t.session_id,
      subject: t.subject,
      body: t.body,
      category: t.category,
      status: t.status,
      createdAt: t.created_at,
      resolvedAt: t.resolved_at,
    };
  });

  return apiOk(tickets);
}
