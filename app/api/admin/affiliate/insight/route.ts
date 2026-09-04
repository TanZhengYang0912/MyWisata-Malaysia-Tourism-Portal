// P4 — Member 4: AI performance insight (admin, platform-wide).
// CLAUDE-FUNNEL-AI.md Part 2. Gated the same as the rest of /admin/affiliate
// (super_admin) — this reads the same aggregate data already
// visible on that page, just narrated.
//
// Anomalies are sourced from the existing zero_conversion fraud flags (the
// fraud sweep already detects "many clicks, zero referrals" — this just
// narrates it in words), not recomputed independently, so the insight never
// disagrees with the fraud panel sitting right next to it. Affiliates are
// identified to the LLM only by affiliate_code — never a name or email.

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { isSuperAdmin } from '@/lib/affiliate/admin-guard';
import { getAffiliateAdminStats } from '@/lib/affiliate/admin-stats';
import { getFraudFlags } from '@/lib/affiliate/fraud';
import { generateAdminInsight, ruleBasedAdminInsight, type AdminInsightStats, type AdminAnomaly } from '@/lib/affiliate/insight';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);
  if (!(await isSuperAdmin(supabase, user.id))) {
    return apiFail('FORBIDDEN', 'Only Super Admin can view affiliate insight', 403);
  }

  const [stats, flags] = await Promise.all([
    getAffiliateAdminStats(supabase),
    getFraudFlags(supabase),
  ]);

  const anomalies: AdminAnomaly[] = flags
    .filter((f) => f.flagType === 'zero_conversion' && f.status === 'open' && f.affiliateCode)
    .map((f) => ({
      affiliateCode: f.affiliateCode as string,
      clicks: Number((f.detail as Record<string, unknown> | null)?.totalClicks ?? 0),
      conversions: 0,
    }))
    .sort((a, b) => b.clicks - a.clicks);

  const insightStats: AdminInsightStats = {
    totalAffiliates: stats.totals.totalAffiliates,
    totalClicks: stats.totals.totalClicks,
    totalConversions: stats.totals.totalReferrals,
    totalCommission: stats.totals.totalCommission,
    byPlatform: stats.funnel.byPlatform,
    topAffiliates: stats.topEarners.map((e) => ({
      affiliateCode: e.affiliateCode,
      referrals: e.referrals,
      commission: e.commission,
      tierName: e.tierName,
    })),
    anomalies,
  };

  try {
    const insight = await generateAdminInsight(insightStats);
    return apiOk({ insight, mode: 'llm' as const });
  } catch (error) {
    console.error('[affiliate] admin insight generation failed, using rule-based fallback', error instanceof Error ? error.message : error);
    return apiOk({ insight: ruleBasedAdminInsight(insightStats), mode: 'rule-based' as const });
  }
}
