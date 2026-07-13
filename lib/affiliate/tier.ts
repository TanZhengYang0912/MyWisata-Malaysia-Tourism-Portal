// P4 — Member 4: tiered commission. CLAUDE-PHASE2.md Feature B.
//
// Rates are never hardcoded here — always read from commission_rules so an
// admin can change them. Replaces the old flat-rate lookup
// (lib/affiliate/commission.ts, deleted) in lib/affiliate/attribution.ts.

import type { SupabaseClient } from '@supabase/supabase-js';

export interface CommissionTier {
  id: string;
  tierName: string;
  rate: number; // 0..1 fraction
  minReferrals: number;
}

export interface TierInfo {
  tierName: string;
  rate: number;
  referralCount: number;
  nextTier: CommissionTier | null;
  referralsToNext: number | null;
}

// Only used if commission_rules has no active affiliate tier rows at all
// (e.g. migration 014 hasn't run yet) — never used to override real rates.
// id is a sentinel, not a real row — the admin tier editor should never
// try to PATCH this one.
const FALLBACK_TIER: CommissionTier = { id: '', tierName: 'bronze', rate: 0.03, minReferrals: 0 };

/** All active affiliate tiers, ascending by threshold. */
export async function getActiveTiers(service: SupabaseClient): Promise<CommissionTier[]> {
  const { data } = await service
    .from('commission_rules')
    .select('id, tier_name, ongoing_rate, min_conversions')
    .eq('rule_type', 'affiliate')
    .eq('is_active', true)
    .order('min_conversions', { ascending: true });

  const tiers = (data ?? [])
    .filter((r) => r.tier_name)
    .map((r) => ({
      id: r.id as string,
      tierName: r.tier_name as string,
      rate: Number(r.ongoing_rate),
      minReferrals: r.min_conversions ?? 0,
    }));

  return tiers.length ? tiers : [FALLBACK_TIER];
}

async function countConfirmedReferrals(service: SupabaseClient, userId: string): Promise<number> {
  const { data: link } = await service.from('affiliate_links').select('id').eq('user_id', userId).maybeSingle();
  if (!link) return 0;

  const { data: clicks } = await service.from('affiliate_clicks').select('id').eq('link_id', link.id);
  const clickIds = (clicks ?? []).map((c) => c.id);
  if (!clickIds.length) return 0;

  const { count } = await service
    .from('affiliate_attributions')
    .select('id', { count: 'exact', head: true })
    .in('click_id', clickIds)
    .eq('status', 'confirmed');
  return count ?? 0;
}

/**
 * Pure: picks the highest tier whose threshold `referralCount` has reached,
 * out of `tiers` (must already be sorted ascending by minReferrals — as
 * getActiveTiers() returns them). Exported so callers who already have
 * per-link attribution data in memory (e.g. the admin oversight page, which
 * loads every attribution at once) can resolve everyone's tier locally
 * instead of one getTierForUser() DB round-trip per affiliate.
 */
export function resolveTier(tiers: CommissionTier[], referralCount: number): TierInfo {
  let current = tiers[0];
  let currentIndex = 0;
  for (let i = 0; i < tiers.length; i++) {
    if (tiers[i].minReferrals <= referralCount) {
      current = tiers[i];
      currentIndex = i;
    }
  }

  const nextTier = tiers[currentIndex + 1] ?? null;
  const referralsToNext = nextTier ? Math.max(0, nextTier.minReferrals - referralCount) : null;

  return {
    tierName: current.tierName,
    rate: current.rate,
    referralCount,
    nextTier,
    referralsToNext,
  };
}

/**
 * Resolves userId's current tier from their lifetime CONFIRMED referral
 * count (not pending — a tier shouldn't be buyable with commissions that
 * might still reverse).
 */
export async function getTierForUser(service: SupabaseClient, userId: string): Promise<TierInfo> {
  const tiers = await getActiveTiers(service);
  const referralCount = await countConfirmedReferrals(service, userId);
  return resolveTier(tiers, referralCount);
}
