// P4 — Member 4: affiliate dashboard stats. See CLAUDE.md Step 6.
//
// Vocabulary (use these words, and only these, in any UI built on top of this):
//   Click     = someone opened my link (any affiliate_clicks row on my link)
//   Referral  = a click that became a paid order (a non-reversed affiliate_attributions row)
//   Earnings  = commission from referrals: Pending (status='pending') -> Available (status='confirmed')
//
// Note: nothing in this codebase yet transitions an attribution from
// 'pending' to 'confirmed' (no clearance job exists — see CLAUDE.md). Until
// one does, "Available earnings" will always read RM 0.00. That's accurate
// given the current system, not a bug in this file.

import type { SupabaseClient } from '@supabase/supabase-js';
import { add } from '@/lib/money';

const CHART_DAYS = 30;

export interface AffiliateProductStat {
  productId: string;
  productName: string;
  clicks: number;
  referrals: number;
  earnings: number;
}

export interface AffiliateDailyClicks {
  date: string; // YYYY-MM-DD
  clicks: number;
}

export interface AffiliateStats {
  affiliateCode: string | null;
  totals: {
    clicks: number;
    referrals: number;
    pendingEarnings: number;
    availableEarnings: number;
  };
  byProduct: AffiliateProductStat[];
  clicksByDay: AffiliateDailyClicks[];
}

function zeroFilledDays(): AffiliateDailyClicks[] {
  const days: AffiliateDailyClicks[] = [];
  const today = new Date();
  for (let i = CHART_DAYS - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push({ date: d.toISOString().slice(0, 10), clicks: 0 });
  }
  return days;
}

function emptyStats(): AffiliateStats {
  return {
    affiliateCode: null,
    totals: { clicks: 0, referrals: 0, pendingEarnings: 0, availableEarnings: 0 },
    byProduct: [],
    clicksByDay: zeroFilledDays(),
  };
}

/** `service` may be the cookie-aware client — affiliate_clicks/affiliate_attributions
 * now carry own-link-only SELECT RLS policies (migration 009), and affiliate_links
 * itself only allows reading your own row, so a plain per-user read is correctly scoped. */
export async function getAffiliateStats(service: SupabaseClient, userId: string): Promise<AffiliateStats> {
  const { data: link } = await service
    .from('affiliate_links')
    .select('id, affiliate_code')
    .eq('user_id', userId)
    .maybeSingle();

  if (!link) return emptyStats();

  const { data: clicksData } = await service
    .from('affiliate_clicks')
    .select('id, target_type, target_id, created_at')
    .eq('link_id', link.id);
  const clickRows = clicksData ?? [];
  const clickIds = clickRows.map((c) => c.id);

  const { data: attributionsData } = clickIds.length
    ? await service
        .from('affiliate_attributions')
        .select('click_id, commission_amount, status')
        .in('click_id', clickIds)
    : { data: [] as { click_id: string; commission_amount: number; status: string }[] };
  const attributionRows = attributionsData ?? [];
  const activeAttributions = attributionRows.filter((a) => a.status !== 'reversed');

  const pendingEarnings = attributionRows
    .filter((a) => a.status === 'pending')
    .reduce((sum, a) => add(sum, Number(a.commission_amount)), 0);
  const availableEarnings = attributionRows
    .filter((a) => a.status === 'confirmed')
    .reduce((sum, a) => add(sum, Number(a.commission_amount)), 0);

  // Map click id -> target product id, to group attributions by product below.
  const clickTarget = new Map(
    clickRows.map((c) => [c.id, c.target_type === 'product' ? c.target_id : null]),
  );

  const byProductMap = new Map<string, { clicks: number; referrals: number; earnings: number }>();
  for (const click of clickRows) {
    if (click.target_type !== 'product' || !click.target_id) continue;
    const entry = byProductMap.get(click.target_id) ?? { clicks: 0, referrals: 0, earnings: 0 };
    entry.clicks += 1;
    byProductMap.set(click.target_id, entry);
  }
  for (const attribution of activeAttributions) {
    const productId = clickTarget.get(attribution.click_id);
    if (!productId) continue;
    const entry = byProductMap.get(productId) ?? { clicks: 0, referrals: 0, earnings: 0 };
    entry.referrals += 1;
    entry.earnings = add(entry.earnings, Number(attribution.commission_amount));
    byProductMap.set(productId, entry);
  }

  const productIds = [...byProductMap.keys()];
  const { data: productsData } = productIds.length
    ? await service.from('products').select('id, name').in('id', productIds)
    : { data: [] as { id: string; name: string }[] };
  const productNames = new Map((productsData ?? []).map((p) => [p.id, p.name]));

  const byProduct: AffiliateProductStat[] = productIds.map((id) => {
    const entry = byProductMap.get(id)!;
    return {
      productId: id,
      productName: productNames.get(id) ?? 'Unknown activity',
      clicks: entry.clicks,
      referrals: entry.referrals,
      earnings: entry.earnings,
    };
  });

  const clicksByDay = zeroFilledDays();
  const dayIndex = new Map(clicksByDay.map((d, i) => [d.date, i]));
  for (const click of clickRows) {
    const day = String(click.created_at).slice(0, 10);
    const idx = dayIndex.get(day);
    if (idx !== undefined) clicksByDay[idx].clicks += 1;
  }

  return {
    affiliateCode: link.affiliate_code,
    totals: {
      clicks: clickRows.length,
      referrals: activeAttributions.length,
      pendingEarnings,
      availableEarnings,
    },
    byProduct,
    clicksByDay,
  };
}
