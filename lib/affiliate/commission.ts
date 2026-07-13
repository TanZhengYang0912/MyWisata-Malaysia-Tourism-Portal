// P4 — Affiliate commission rate lookup.

import type { SupabaseClient } from '@supabase/supabase-js';

// Fallback when no tier rule matches (should not occur after migration 014 seeds Bronze).
const DEFAULT_COMMISSION_RATE = 0.03;

/**
 * Returns the active affiliate ongoing_rate for a specific user based on their
 * rolling 30-day confirmed conversions (tier: Bronze 3% / Silver 4% / Gold 5%).
 * Falls back to DEFAULT_COMMISSION_RATE if no matching rule exists.
 */
export async function computeAffiliateTier(service: SupabaseClient, userId: string): Promise<number> {
  const { data: link } = await service
    .from('affiliate_links')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (!link) return DEFAULT_COMMISSION_RATE;

  // Collect click IDs for this user's link
  const { data: clicks } = await service
    .from('affiliate_clicks')
    .select('id')
    .eq('link_id', link.id);
  const clickIds = (clicks ?? []).map((c: { id: string }) => c.id);
  if (clickIds.length === 0) return DEFAULT_COMMISSION_RATE;

  // Count confirmed attributions in the last 30 days
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { count: confirmedCount } = await service
    .from('affiliate_attributions')
    .select('id', { count: 'exact', head: true })
    .in('click_id', clickIds)
    .eq('status', 'confirmed')
    .gte('confirmed_at', since);

  const n = confirmedCount ?? 0;

  // Pick the tier rule with the highest min_conversions that the user qualifies for
  const { data: rules } = await service
    .from('commission_rules')
    .select('ongoing_rate, min_conversions')
    .eq('rule_type', 'affiliate')
    .eq('is_active', true)
    .lte('min_conversions', n)
    .order('min_conversions', { ascending: false })
    .limit(1);

  const rate = rules?.[0] ? Number(rules[0].ongoing_rate) : NaN;
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_COMMISSION_RATE;
}

/** Legacy flat-rate lookup — kept for backward-compat with any callers outside onOrderPaid. */
export async function getAffiliateCommissionRate(service: SupabaseClient): Promise<number> {
  const { data } = await service
    .from('commission_rules')
    .select('ongoing_rate')
    .eq('rule_type', 'affiliate')
    .eq('is_active', true)
    .order('min_conversions', { ascending: false })
    .limit(1)
    .maybeSingle();
  const rate = data ? Number(data.ongoing_rate) : NaN;
  return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_COMMISSION_RATE;
}
