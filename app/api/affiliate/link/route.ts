// P4 — Member 4: Affiliate link generation
// GET  /api/affiliate/link  — my code, or null if I don't have one yet
// POST /api/affiliate/link  — idempotent: returns existing code, or creates one
//                             (profile-complete limited; KYC-approved full)

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { affiliateUrl, getAffiliateLink, getOrCreateAffiliateLink } from '@/lib/affiliate/links';
import { meetsMinTier, REQUIRED_TIER } from '@/lib/constants';
import { getMonthlyClickCap } from '@/lib/affiliate/settings';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const link = await getAffiliateLink(supabase, user.id);
  if (!link) return apiOk(null);

  const { data: profile } = await supabase.from('users').select('tier,kyc_status').eq('id', user.id).maybeSingle();
  if (!profile || profile.kyc_status === 'rejected' || !meetsMinTier(profile.tier, REQUIRED_TIER.AFFILIATE_BASIC)) return apiOk(null);

  const origin = new URL(request.url).origin;
  const full = profile.tier === 'kyc_verified' && profile.kyc_status === 'approved';
  // Reads the same platform_settings value lib/affiliate/redirect.ts enforces
  // (getMonthlyClickCap) — was hardcoded 50 here while the redirect enforced
  // a different hardcoded 50, two numbers that could only agree by accident.
  const clicksPerMonth = full ? null : await getMonthlyClickCap(supabase);
  return apiOk({
    affiliateCode: link.affiliateCode,
    affiliateUrl: affiliateUrl(origin, link.affiliateCode),
    mode: full ? 'full' : 'limited',
    limits: full ? null : { clicksPerMonth, commissionRmPerMonth: 100 },
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('tier, kyc_status')
    .eq('id', user.id)
    .single();
  if (profileErr || !profile) return apiFail('NOT_FOUND', 'User profile not found', 404);
  if (profile.kyc_status === 'rejected') {
    return apiFail('KYC_REJECTED', 'Affiliate earnings are unavailable until KYC is resubmitted and approved', 403);
  }
  if (!meetsMinTier(profile.tier, REQUIRED_TIER.AFFILIATE_BASIC)) {
    return apiFail('TIER_INSUFFICIENT', 'Complete your verified profile before generating an affiliate link', 403);
  }

  let result: Awaited<ReturnType<typeof getOrCreateAffiliateLink>>;
  try {
    result = await getOrCreateAffiliateLink(supabase, user.id);
  } catch (error) {
    return apiFail('DB_ERROR', error instanceof Error ? error.message : 'Unable to create affiliate link', 500);
  }

  const origin = new URL(request.url).origin;
  const { link, created } = result;
  const full = profile.tier === 'kyc_verified' && profile.kyc_status === 'approved';
  const clicksPerMonth = full ? null : await getMonthlyClickCap(supabase);
  return apiOk(
    {
      affiliateCode: link.affiliateCode,
      affiliateUrl: affiliateUrl(origin, link.affiliateCode),
      mode: full ? 'full' : 'limited',
      limits: full ? null : { clicksPerMonth, commissionRmPerMonth: 100 },
    },
    { status: created ? 201 : 200 },
  );
}
