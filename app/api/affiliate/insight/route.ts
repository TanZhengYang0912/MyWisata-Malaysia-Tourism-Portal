// P4 — Member 4: AI performance insight (user). CLAUDE-FUNNEL-AI.md Part 2.
// GET /api/affiliate/insight — a 2-3 sentence AI summary of the current
// user's affiliate performance, with a rule-based fallback if Gemini is
// unavailable. Never a 500 for "the LLM is down" — that's a normal,
// expected mode, not an API failure.

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { getAffiliateStats } from '@/lib/affiliate/stats';
import { generateUserInsight, ruleBasedUserInsight, type UserInsightStats } from '@/lib/affiliate/insight';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const stats = await getAffiliateStats(supabase, user.id);

  const insightStats: UserInsightStats = {
    totalShares: stats.funnel.shares,
    totalClicks: stats.funnel.clicks,
    totalConversions: stats.funnel.conversions,
    conversionRate: stats.funnel.clickToConversionRate,
    earningsPending: stats.totals.pendingEarnings,
    earningsAvailable: stats.totals.availableToWithdraw,
    tierName: stats.tier.tierName,
    referralsToNextTier: stats.tier.referralsToNext,
    byPlatform: stats.funnel.byPlatform,
    byProduct: stats.byProduct.map((p) => ({
      productName: p.productName,
      clicks: p.clicks,
      conversions: p.referrals,
      earned: p.earnings,
    })),
  };

  try {
    const insight = await generateUserInsight(insightStats);
    return apiOk({ insight, mode: 'llm' as const });
  } catch (error) {
    console.error('[affiliate] user insight generation failed, using rule-based fallback', error instanceof Error ? error.message : error);
    return apiOk({ insight: ruleBasedUserInsight(insightStats), mode: 'rule-based' as const });
  }
}
