// P4 — Member 4: Affiliate link generation
// GET  /api/affiliate/link  — my code, or null if I don't have one yet
// POST /api/affiliate/link  — idempotent: returns existing code, or creates one
//                             (requires KYC-approved account)

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { affiliateUrl, getAffiliateLink, getOrCreateAffiliateLink } from '@/lib/affiliate/links';

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
    .select('kyc_status')
    .eq('id', user.id)
    .single();
  if (profileErr || !profile) return apiFail('NOT_FOUND', 'User profile not found', 404);
  // 'kyc_verified', not 'approved' — the live kyc_status vocabulary doesn't
  // match supabase/migrations/001_initial_schema.sql's CHECK constraint.
  // See lib/affiliate/verification.ts.
  if (profile.kyc_status !== 'kyc_verified') {
    return apiFail('FORBIDDEN', 'Verify your account (KYC verified) before generating an affiliate link', 403);
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
