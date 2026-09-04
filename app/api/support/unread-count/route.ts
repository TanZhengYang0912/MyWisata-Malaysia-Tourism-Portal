// P4 — Member 4: unread ticket count (CLAUDE-FIXES-2.md item 1)
// GET /api/support/unread-count — role-aware: a customer gets the count of
// their own tickets with an unread admin reply; an admin gets the count of
// ALL tickets with an unread customer reply (the queue-wide "there's stuff
// to look at" signal, not just their own assigned tickets).

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { getLatestReplyTimestamps, isUnread } from '@/lib/support/unread';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const service = createServiceClient();
  const isAdmin = await isSuperAdmin(supabase, user.id);

  if (isAdmin) {
    const { data: tickets } = await service
      .from('support_tickets')
      .select('id, admin_last_read_at')
      .not('status', 'in', '(resolved,closed)');
    const rows = tickets ?? [];
    const latestCustomerReplies = await getLatestReplyTimestamps(service, rows.map((t) => t.id), 'customer');
    const count = rows.filter((t) => isUnread(t.admin_last_read_at, latestCustomerReplies.get(t.id))).length;
    return apiOk({ count });
  }

  const { data: tickets } = await service
    .from('support_tickets')
    .select('id, customer_last_read_at')
    .eq('user_id', user.id);
  const rows = tickets ?? [];
  const latestAdminReplies = await getLatestReplyTimestamps(service, rows.map((t) => t.id), 'admin');
  const count = rows.filter((t) => isUnread(t.customer_last_read_at, latestAdminReplies.get(t.id))).length;
  return apiOk({ count });
}
