import { createClient } from '@/lib/supabase/server';
import { apiFail, apiOk } from '@/lib/validation/schemas';
import { createServiceClient } from '@/lib/supabase/service';
import { z } from 'zod';

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  pageSize: z.coerce.number().int().refine((value) => [10, 25, 50].includes(value)).default(10),
  tab: z.enum(['open', 'closed']).default('open'),
  closedStatus: z.enum(['all', 'resolved', 'dismissed']).default('all'),
  reason: z.enum(['all', 'scam', 'abuse', 'spam', 'other']).default('all'),
  sort: z.enum(['newest', 'oldest', 'reason']).default('newest'),
  search: z.string().trim().max(200).default(''),
});

// chat_reports_admin_select RLS already scopes this to admins only — the
// is_admin() check here just turns "empty because not admin" into a clear 403.
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: isAdmin, error: roleError } = await supabase.rpc('is_super_admin', { uid: user.id });
  if (roleError || isAdmin !== true) return apiFail('FORBIDDEN', 'Admin role required', 403);

  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return apiFail('VALIDATION_FAILED', 'Invalid chat report filters', 422);
  const { data, error } = await createServiceClient().rpc('list_admin_chat_reports', {
    p_page: parsed.data.page,
    p_page_size: parsed.data.pageSize,
    p_tab: parsed.data.tab,
    p_closed_status: parsed.data.closedStatus,
    p_reason: parsed.data.reason,
    p_sort: parsed.data.sort,
    p_search: parsed.data.search,
  });
  if (error || !data || typeof data !== 'object') return apiFail('DB_ERROR', 'Unable to load chat reports', 500);
  const result = data as { reports?: unknown[]; page?: number; pageSize?: number; total?: number; summary?: { openCount?: number; closedCount?: number } };
  if (!Array.isArray(result.reports) || typeof result.total !== 'number' || !result.summary) return apiFail('DB_ERROR', 'Unable to load chat reports', 500);
  return apiOk(result);
}
