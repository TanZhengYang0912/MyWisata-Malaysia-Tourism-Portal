import { apiFail, apiOk } from '@/lib/validation/schemas';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) return apiFail('FORBIDDEN', 'Super Admin access required', 403);

  const cutoff = new Date().toISOString();
  const { data, error } = await createServiceClient().rpc('admin_rewards_pending_summary', { p_cutoff: cutoff });
  if (error || !data || typeof data !== 'object') return apiFail('DB_ERROR', 'Unable to load reward summary', 500);
  const summary = data as { count?: number; total_rm?: string | number };
  const count = Number(summary.count);
  const totalRM = Number(summary.total_rm);
  if (!Number.isInteger(count) || count < 0 || !Number.isFinite(totalRM) || totalRM < 0) {
    return apiFail('DB_ERROR', 'Unable to load reward summary', 500);
  }
  return apiOk({ count, totalRM });
}
