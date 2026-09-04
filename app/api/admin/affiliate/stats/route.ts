// P4 — Member 4: admin affiliate oversight
// GET /api/admin/affiliate/stats — platform totals, top earners, suspicious
// activity, current commission rate, and the full attribution list. See
// CLAUDE.md Step 9. Gated on super_admin, checked server-side.

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { getAffiliateAdminStats } from '@/lib/affiliate/admin-stats';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can view affiliate oversight', 403);
  }

  // Cookie-aware client is enough here — migration 009 gives super_admin/
  // approver an explicit is_admin() SELECT policy on affiliate_links,
  // affiliate_clicks, and affiliate_attributions.
  const stats = await getAffiliateAdminStats(supabase);
  return apiOk(stats);
}
