// P4 — Member 4: affiliate dashboard stats. See CLAUDE.md Step 6, rebuilt
// per CLAUDE-FIXES.md Fix 3c around "earnings grouped by product" as the
// core ask.
//
// Vocabulary (use these words, and only these, in any UI built on top of this):
//   Click      = someone opened my link (any affiliate_clicks row on my link)
//   Referral   = a click that became a paid order (a non-reversed affiliate_attributions row) —
//                CLAUDE-FIXES.md prefers "people who ordered" in user-facing copy; same concept.
//   Earnings   = commission from referrals: Pending (status='pending') -> cleared into the real wallet
//
// Phase 2 (migration 014): a real clearing job now exists
// (lib/affiliate/clearing.ts) — pending commission eventually clears once
// /api/admin/affiliate/run-clearing (or the dev force-clear route)
// processes it past platform_settings['wallet.clearance_days'].
//
// ⚠️ Fix 3c deviation: "Available to withdraw" now reads wallets.earnings_sen
// directly instead of summing 'confirmed' affiliate_attributions, per the
// doc's own instruction ("read the same column their wallet page reads").
// These aren't always equal: earnings_sen also includes any non-affiliate
// earnings (e.g. the recommendation-reward system uses the same
// credit_earnings() RPC) and is reduced by anything already withdrawn — it's
// the actual spendable/withdrawable balance, not a historical affiliate-only
// sum. The Cash Out button's enabled/disabled state has to match reality,
// not a derived number that can drift from it.
//
// ⚠️ Also found while adding "order amount" to the earnings history:
// orders_own_or_admin (007_public_read_policies.sql) grants SELECT to the
// buyer, an admin, or the vendor who owns the product — NOT the affiliate
// who earned a commission from it. Under the cookie-aware client (which
// this function is normally called with — see app/api/affiliate/stats/route.ts),
// an affiliate's own dashboard would see every order's total silently come
// back empty, since RLS has no concept of "this order generated a
// commission you're entitled to see the total of." The order lookup below
// uses the service-role client specifically for that reason — everything
// else in this function stays on whatever client the caller passed in.

import type { SupabaseClient } from '@supabase/supabase-js';
import { add } from '@/lib/money';
import { getClearanceDays } from './settings';
import { getTierForUser, type TierInfo } from './tier';
import { createServiceClient } from '@/lib/supabase/service';
import { computeFunnel, type Funnel } from './funnel';

const CHART_DAYS = 30;

export interface AffiliateProductStat {
  productId: string;
  productName: string;
  shares: number;
  clicks: number;
  referrals: number;
  earnings: number;
}

export interface AffiliateDailyClicks {
  date: string; // YYYY-MM-DD
  clicks: number;
}

export interface AffiliateCommission {
  id: string;
  productName: string | null;
  orderAmount: number | null;
  /** The rate stamped onto this attribution at the time it was created — never recomputed from the current tier. */
  rate: number;
  amount: number;
  status: 'pending' | 'confirmed' | 'reversed';
  createdAt: string;
  clearedAt: string | null;
  /** Days until this clears, floored at 0. null once it's no longer pending. */
  clearsInDays: number | null;
}

export interface AffiliateStats {
  affiliateCode: string | null;
  totals: {
    clicks: number;
    referrals: number;
    pendingEarnings: number;
    availableToWithdraw: number;
  };
  byProduct: AffiliateProductStat[];
  clicksByDay: AffiliateDailyClicks[];
  commissions: AffiliateCommission[];
  /**
   * CLAUDE-FUNNEL-AI.md §12.3: share_events -> affiliate_clicks ->
   * affiliate_attributions, connected. Per-platform clicks/conversions are
   * only real once affiliate_clicks.source is populated (migration 035,
   * written going forward) — see lib/affiliate/funnel.ts for the honest
   * degrade-gracefully behavior before that.
   */
  funnel: Funnel;
  tier: TierInfo;
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

function emptyStats(tier: TierInfo): AffiliateStats {
  return {
    affiliateCode: null,
    totals: { clicks: 0, referrals: 0, pendingEarnings: 0, availableToWithdraw: 0 },
    byProduct: [],
    clicksByDay: zeroFilledDays(),
    commissions: [],
    funnel: computeFunnel([], [], []),
    tier,
  };
}

/** `service` may be the cookie-aware client — affiliate_clicks/affiliate_attributions
 * now carry own-link-only SELECT RLS policies (migration 011), and affiliate_links
 * itself only allows reading your own row, so a plain per-user read is correctly scoped.
 * wallets and share_events also both carry real own-row RLS policies
 * (003_rls_policies.sql / 007_public_read_policies.sql). */
export async function getAffiliateStats(service: SupabaseClient, userId: string): Promise<AffiliateStats> {
  // Resolved once up front since both the empty-state early return and the
  // full return below need it — see lib/affiliate/tier.ts.
  const tier = await getTierForUser(service, userId);

  const { data: link } = await service
    .from('affiliate_links')
    .select('id, affiliate_code')
    .eq('user_id', userId)
    .maybeSingle();

  if (!link) return emptyStats(tier);

  const [{ data: clicksData }, { data: sharesData }, { data: walletData }] = await Promise.all([
    service.from('affiliate_clicks').select('id, target_type, target_id, source, created_at').eq('link_id', link.id),
    service.from('share_events').select('content_type, content_id, platform').eq('affiliate_id', link.id),
    service.from('wallets').select('earnings_sen').eq('user_id', userId).maybeSingle(),
  ]);
  const clickRows = clicksData ?? [];
  const shareRows = sharesData ?? [];
  const clickIds = clickRows.map((c) => c.id);
  // Fix 3c: "Available to withdraw" reads the real wallet balance, not a
  // derived sum of 'confirmed' attributions — see the file header note.
  const availableToWithdraw = ((walletData?.earnings_sen as number | undefined) ?? 0) / 100;

  const { data: attributionsData } = clickIds.length
    ? await service
        .from('affiliate_attributions')
        .select('id, click_id, order_id, commission_rate, commission_amount, status, created_at, cleared_at')
        .in('click_id', clickIds)
    : {
        data: [] as {
          id: string; click_id: string; order_id: string; commission_rate: number; commission_amount: number;
          status: string; created_at: string; cleared_at: string | null;
        }[],
      };
  const attributionRows = attributionsData ?? [];
  const activeAttributions = attributionRows.filter((a) => a.status !== 'reversed');
  const clearanceDays = await getClearanceDays(service);

  const pendingEarnings = attributionRows
    .filter((a) => a.status === 'pending')
    .reduce((sum, a) => add(sum, Number(a.commission_amount)), 0);

  // Order amounts for the earnings history's "order amount" column — one
  // extra lookup, not worth folding into the attribution row itself since
  // it's display-only.
  const orderIds = [...new Set(attributionRows.map((a) => a.order_id))];
  const { data: ordersData } = orderIds.length
    ? await createServiceClient().from('orders').select('id, total_amount').in('id', orderIds)
    : { data: [] as { id: string; total_amount: number }[] };
  const orderAmounts = new Map((ordersData ?? []).map((o) => [o.id, Number(o.total_amount)]));

  // Map click id -> target product id, to group attributions by product below.
  const clickTarget = new Map(
    clickRows.map((c) => [c.id, c.target_type === 'product' ? c.target_id : null]),
  );

  const byProductMap = new Map<string, { shares: number; clicks: number; referrals: number; earnings: number }>();
  for (const click of clickRows) {
    if (click.target_type !== 'product' || !click.target_id) continue;
    const entry = byProductMap.get(click.target_id) ?? { shares: 0, clicks: 0, referrals: 0, earnings: 0 };
    entry.clicks += 1;
    byProductMap.set(click.target_id, entry);
  }
  for (const share of shareRows) {
    if (share.content_type !== 'product') continue;
    const entry = byProductMap.get(share.content_id) ?? { shares: 0, clicks: 0, referrals: 0, earnings: 0 };
    entry.shares += 1;
    byProductMap.set(share.content_id, entry);
  }
  for (const attribution of activeAttributions) {
    const productId = clickTarget.get(attribution.click_id);
    if (!productId) continue;
    const entry = byProductMap.get(productId) ?? { shares: 0, clicks: 0, referrals: 0, earnings: 0 };
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
      shares: entry.shares,
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

  const commissions: AffiliateCommission[] = attributionRows
    .map((a) => {
      const productId = clickTarget.get(a.click_id);
      let clearsInDays: number | null = null;
      if (a.status === 'pending') {
        const ageMs = Date.now() - new Date(a.created_at).getTime();
        const remainingDays = clearanceDays - ageMs / 86_400_000;
        clearsInDays = Math.max(0, Math.ceil(remainingDays));
      }
      return {
        id: a.id,
        productName: productId ? (productNames.get(productId) ?? 'Unknown activity') : null,
        orderAmount: orderAmounts.get(a.order_id) ?? null,
        rate: Number(a.commission_rate),
        amount: Number(a.commission_amount),
        status: a.status as AffiliateCommission['status'],
        createdAt: a.created_at,
        clearedAt: a.cleared_at,
        clearsInDays,
      };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const funnel = computeFunnel(
    shareRows.map((s) => ({ platform: s.platform })),
    clickRows.map((c) => ({ id: c.id, source: c.source })),
    activeAttributions.map((a) => ({ clickId: a.click_id })),
  );

  return {
    affiliateCode: link.affiliate_code,
    totals: {
      clicks: clickRows.length,
      referrals: activeAttributions.length,
      pendingEarnings,
      availableToWithdraw,
    },
    byProduct,
    clicksByDay,
    commissions,
    funnel,
    tier,
  };
}
