import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { supportQueueQuery, supportQueueResponseSchema } from '@/lib/admin/support-queue';
import { teamForCategory } from '@/lib/support/team-routing';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can view support tickets', 403);
  }

  const parsed = supportQueueQuery(request);
  if (!parsed.success) return apiFail('VALIDATION_FAILED', 'Invalid support queue filters', 422);
  const { page, category, status, assignedToMe, unreadOnly, search, sort } = parsed.data;
  const { data, error } = await supabase.rpc('get_admin_support_queue', {
    p_page: page,
    p_category: category,
    p_status: status,
    p_assigned_to_me: assignedToMe,
    p_unread_only: unreadOnly,
    p_search: search,
    p_sort: sort,
  });
  const result = supportQueueResponseSchema.safeParse(data);
  if (error || !result.success) return apiFail('SUPPORT_QUEUE_UNAVAILABLE', 'Unable to load support tickets', 503);

  const response = apiOk({
    ...result.data,
    tickets: result.data.tickets.map((ticket) => ({ ...ticket, team: teamForCategory(ticket.category) })),
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}
