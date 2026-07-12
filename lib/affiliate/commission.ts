// P4 — Affiliate commission rate lookup.

import type { SupabaseClient } from '@supabase/supabase-js';

// Fallback only — used if no active affiliate commission_rules row exists.
// Migration 009 seeds a 5% standard rule, matching the scope doc's flat rate.
const DEFAULT_COMMISSION_RATE = 0.05;

/** Returns the active affiliate ongoing_rate as a 0..1 fraction (e.g. 0.05 = 5%). */
export async function getAffiliateCommissionRate(service: SupabaseClient): Promise<number> {
  const { data } = await service
    .from('commission_rules')
    .select('ongoing_rate')
    .eq('rule_type', 'affiliate')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const rate = data ? Number(data.ongoing_rate) : NaN;
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_COMMISSION_RATE;
}
