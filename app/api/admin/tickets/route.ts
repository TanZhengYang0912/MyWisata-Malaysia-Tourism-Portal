// P4 — Member 4: admin ticket list + queue stats
// GET /api/admin/tickets?category=&status=&assignedToMe=&unreadOnly= — see
// CLAUDE.md Step 9, extended with dashboard stats + more filters per
// CLAUDE-FIXES-2.md item 3. Gated on super_admin/approver, checked server-side.
//
// Reads support_tickets.category directly rather than going through
// identity.ts::getSupportTickets() — that function maps category: t.body
// (a leftover from before this column existed), which is now stale. See
// CLAUDE.md Step 8's note.
//
// Stats (open/in_progress/resolved/unanswered counts, avg first-response
// time) are always computed over the FULL ticket set, independent of the
// filters applied to the returned `tickets` list — the stat cards describe
// the whole queue, not whatever's currently filtered into view.

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdminOrApprover } from '@/lib/affiliate/admin-guard';
import { getLatestReplyTimestamps, getEarliestReplyTimestamps, isUnread } from '@/lib/support/unread';

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
  const assignedToMe = url.searchParams.get('assignedToMe') === 'true';
  const unreadOnly = url.searchParams.get('unreadOnly') === 'true';

  const { data, error } = await supabase
    .from('support_tickets')
    .select('id, user_id, session_id, subject, body, category, classification_method, status, assigned_to, created_at, resolved_at, last_reply_at, admin_last_read_at')
    .order('created_at', { ascending: false });
  if (error) return apiFail('DB_ERROR', error.message, 500);

  const rows = data ?? [];
  const userIds = [...new Set(rows.map((t) => t.user_id).filter((id): id is string => Boolean(id)))];
  const { data: usersData } = userIds.length
    ? await supabase.from('users').select('id, full_name, email').in('id', userIds)
    : { data: [] as { id: string; full_name: string | null; email: string }[] };
  const usersById = new Map((usersData ?? []).map((u) => [u.id, u]));

  const ticketIds = rows.map((t) => t.id);
  const [latestCustomerReplies, earliestAdminReplies] = await Promise.all([
    getLatestReplyTimestamps(supabase, ticketIds, 'customer'),
    getEarliestReplyTimestamps(supabase, ticketIds, 'admin'),
  ]);

  const allTickets = rows.map((t) => {
    const requester = t.user_id ? usersById.get(t.user_id) : undefined;
    const firstAdminReplyAt = earliestAdminReplies.get(t.id) ?? null;
    return {
      id: t.id,
      userId: t.user_id,
      userName: t.user_id ? (requester?.full_name ?? requester?.email ?? 'Unknown user') : 'Guest',
      sessionId: t.session_id,
      subject: t.subject,
      body: t.body,
      category: t.category,
      classificationMethod: t.classification_method,
      status: t.status,
      assignedTo: t.assigned_to,
      createdAt: t.created_at,
      resolvedAt: t.resolved_at,
      lastActivityAt: t.last_reply_at ?? t.created_at,
      unread: isUnread(t.admin_last_read_at, latestCustomerReplies.get(t.id)),
      unanswered: !firstAdminReplyAt,
      firstAdminReplyAt,
    };
  });

  const answered = allTickets.filter((t) => t.firstAdminReplyAt);
  const avgFirstResponseHours = answered.length
    ? answered.reduce((sum, t) => sum + (new Date(t.firstAdminReplyAt as string).getTime() - new Date(t.createdAt).getTime()), 0) /
      answered.length /
      3_600_000
    : null;

  const stats = {
    open: allTickets.filter((t) => t.status === 'open').length,
    inProgress: allTickets.filter((t) => t.status === 'in_progress').length,
    resolved: allTickets.filter((t) => t.status === 'resolved').length,
    unanswered: allTickets.filter((t) => t.unanswered).length,
    avgFirstResponseHours,
  };

  let filtered = allTickets;
  if (category) filtered = filtered.filter((t) => t.category === category);
  if (status) filtered = filtered.filter((t) => t.status === status);
  if (assignedToMe) filtered = filtered.filter((t) => t.assignedTo === user.id);
  if (unreadOnly) filtered = filtered.filter((t) => t.unread);

  return apiOk({ tickets: filtered, stats });
}
