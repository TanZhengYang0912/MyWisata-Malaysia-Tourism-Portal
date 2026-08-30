// P4 — Member 4: Affiliate link generation
// GET  /api/affiliate/link  — my code, or null if I don't have one yet
// POST /api/affiliate/link  — idempotent: returns existing code, or creates one
//                             (profile-complete limited; KYC-approved full)

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { affiliateUrl, getAffiliateLink, getOrCreateAffiliateLink } from '@/lib/affiliate/links';
import { getMonthlyClickCap } from '@/lib/affiliate/settings';
import { CUSTOMER_CAPABILITY, resolveCustomerCapability } from '@/lib/auth/customer-capabilities';
import { customerCapabilityFailure, resolveServerCustomerCapability } from '@/lib/auth/customer-capabilities.server';

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return customerCapabilityFailure(
    CUSTOMER_CAPABILITY.AFFILIATE_LIMITED,
    resolveCustomerCapability(null, CUSTOMER_CAPABILITY.AFFILIATE_LIMITED),
    'Sign in before generating an affiliate link',
  )!;

  const link = await getAffiliateLink(supabase, user.id);
  if (!link) return apiOk(null);

  const fullDecision = await resolveServerCustomerCapability(user.id, CUSTOMER_CAPABILITY.AFFILIATE_FULL);
  const limitedDecision = fullDecision.allowed
    ? null
    : await resolveServerCustomerCapability(user.id, CUSTOMER_CAPABILITY.AFFILIATE_LIMITED);
  if (!fullDecision.allowed && !limitedDecision?.allowed) return apiOk(null);

  const origin = new URL(request.url).origin;
  const full = fullDecision.allowed;
  // Reads the same platform_settings value lib/affiliate/redirect.ts enforces
  // (getMonthlyClickCap) — was hardcoded 50 here while the redirect enforced
  // a different hardcoded 50, two numbers that could only agree by accident.
  const clicksPerMonth = full ? null : await getMonthlyClickCap(createServiceClient());
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
  if (!user) return customerCapabilityFailure(
    CUSTOMER_CAPABILITY.AFFILIATE_LIMITED,
    resolveCustomerCapability(null, CUSTOMER_CAPABILITY.AFFILIATE_LIMITED),
    'Sign in before generating an affiliate link',
  )!;

  const fullDecision = await resolveServerCustomerCapability(user.id, CUSTOMER_CAPABILITY.AFFILIATE_FULL);
  const affiliateDecision = fullDecision.allowed
    ? fullDecision
    : await resolveServerCustomerCapability(user.id, CUSTOMER_CAPABILITY.AFFILIATE_LIMITED);
  const requiredCapability = fullDecision.allowed
    ? CUSTOMER_CAPABILITY.AFFILIATE_FULL
    : CUSTOMER_CAPABILITY.AFFILIATE_LIMITED;
  const affiliateFailure = customerCapabilityFailure(
    requiredCapability,
    affiliateDecision,
    'Complete your Profile or receive KYC approval before generating an affiliate link',
  );
  if (affiliateFailure) return affiliateFailure;

  let result: Awaited<ReturnType<typeof getOrCreateAffiliateLink>>;
  try {
    result = await getOrCreateAffiliateLink(supabase, user.id);
  } catch (error) {
    return apiFail('DB_ERROR', error instanceof Error ? error.message : 'Unable to create affiliate link', 500);
  }

  const origin = new URL(request.url).origin;
  const { link, created } = result;
  const full = fullDecision.allowed;
  const clicksPerMonth = full ? null : await getMonthlyClickCap(createServiceClient());
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
