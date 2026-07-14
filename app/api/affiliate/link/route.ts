// P4 — Member 4: Affiliate link generation
// GET  /api/affiliate/link  — my code, or null if I don't have one yet
// POST /api/affiliate/link  — idempotent: returns existing code, or creates one
//                             (requires KYC-approved account)

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { affiliateUrl, getAffiliateLink, getOrCreateAffiliateLink } from '@/lib/affiliate/links';
import { meetsMinTier, REQUIRED_TIER } from '@/lib/constants';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const link = await getAffiliateLink(supabase, user.id);
  if (!link) return apiOk(null);

  const origin = new URL(request.url).origin;
  return apiOk({ affiliateCode: link.affiliateCode, affiliateUrl: affiliateUrl(origin, link.affiliateCode) });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const { data: profile, error: profileErr } = await supabase
    .from('users')
    .select('tier')
    .eq('id', user.id)
    .single();
  if (profileErr || !profile) return apiFail('NOT_FOUND', 'User profile not found', 404);
  if (!meetsMinTier(profile.tier, REQUIRED_TIER.AFFILIATE_FULL)) {
    return apiFail('TIER_INSUFFICIENT', 'KYC verification required to generate an affiliate link', 403);
  }

  let result: Awaited<ReturnType<typeof getOrCreateAffiliateLink>>;
  try {
    result = await getOrCreateAffiliateLink(supabase, user.id);
  } catch (error) {
    return apiFail('DB_ERROR', error instanceof Error ? error.message : 'Unable to create affiliate link', 500);
  }

  const origin = new URL(request.url).origin;
  const { link, created } = result;
  return apiOk(
    { affiliateCode: link.affiliateCode, affiliateUrl: affiliateUrl(origin, link.affiliateCode) },
    { status: created ? 201 : 200 },
  );
}
