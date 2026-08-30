// P4 — Member 4: affiliate dashboard stats
// GET /api/affiliate/stats — clicks/referrals/earnings for the current user.
// See CLAUDE.md Step 6.

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { getAffiliateStats } from '@/lib/affiliate/stats';
import { affiliateUrl } from '@/lib/affiliate/links';
import {
  customerCapabilityFailure,
  resolveServerCustomerCapability,
} from '@/lib/auth/customer-capabilities.server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const fullDecision = await resolveServerCustomerCapability(user.id, 'affiliate.full');
  if (!fullDecision.allowed) {
    const limitedDecision = await resolveServerCustomerCapability(user.id, 'affiliate.limited');
    const failure = customerCapabilityFailure(
      'affiliate.limited',
      limitedDecision,
      'Complete your Profile or KYC verification to view Affiliate activity',
    );
    if (failure) return failure;
  }

  const stats = await getAffiliateStats(supabase, user.id);
  const origin = new URL(request.url).origin;

  return apiOk({
    ...stats,
    affiliateUrl: stats.affiliateCode ? affiliateUrl(origin, stats.affiliateCode) : null,
  });
}
