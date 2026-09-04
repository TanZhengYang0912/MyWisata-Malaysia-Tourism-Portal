// P4 — Member 4: fraud flags list (CLAUDE-PHASE2.md Feature C)
// GET /api/admin/affiliate/fraud-flags — every flag ever raised, newest
// first, plus the "X self-referrals blocked, Y duplicate payouts prevented"
// counters. Gated on super_admin, checked server-side. Filtering
// by type/severity/status happens client-side, same pattern as the
// attributions table on this same admin page.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { getFraudFlags, getFraudCounters, getDisabledLinks } from '@/lib/affiliate/fraud';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can view fraud flags', 403);
  }

  const service = createServiceClient();
  const [flags, counters, disabledLinks] = await Promise.all([
    getFraudFlags(service),
    getFraudCounters(service),
    getDisabledLinks(service),
  ]);
  return apiOk({ flags, counters, disabledLinks });
}
