// P4 — Member 4: affiliate dashboard stats
// GET /api/affiliate/stats — clicks/referrals/earnings for the current user.
// See CLAUDE.md Step 6.

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { getAffiliateStats } from '@/lib/affiliate/stats';
import { affiliateUrl } from '@/lib/affiliate/links';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const stats = await getAffiliateStats(supabase, user.id);
  const origin = new URL(request.url).origin;

  return apiOk({
    ...stats,
    affiliateUrl: stats.affiliateCode ? affiliateUrl(origin, stats.affiliateCode) : null,
  });
}
