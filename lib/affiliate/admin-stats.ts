// P4 — Member 4: admin affiliate oversight. See CLAUDE.md Step 9.

import type { SupabaseClient } from '@supabase/supabase-js';
import { add } from '@/lib/money';
import { getActiveTiers, resolveTier, type CommissionTier } from './tier';
import { computeFunnel, type Funnel } from './funnel';
import { rankByCommission } from './leaderboard';
import { resolveProductNames } from './product-names';

const TOP_EARNERS_LIMIT = 10;

export interface AffiliateAdminTotals {
  totalAffiliates: number;
  totalClicks: number;
  totalReferrals: number;
  totalCommission: number; // non-reversed attributions only
}

export interface TopEarner {
  userId: string;
  userName: string;
  affiliateCode: string;
  referrals: number;
  commission: number;
  tierName: string;
}

export interface AffiliateAttributionRow {
  id: string;
  userId: string; // link owner
  userName: string;
  productId: string | null;
  productName: string | null;
  orderId: string;
  commissionAmount: number;
  status: string;
  createdAt: string;
}

export interface AffiliateAdminStats {
  totals: AffiliateAdminTotals;
  tiers: CommissionTier[];
  topEarners: TopEarner[];
  attributions: AffiliateAttributionRow[];
  /** CLAUDE-FUNNEL-AI.md §12.3 — platform-wide, all users. Same honesty rules as the per-user funnel. */
  funnel: Funnel;
}

function userDisplayName(row: { full_name: string | null; email: string } | undefined): string {
  return row?.full_name ?? row?.email ?? 'Unknown user';
}

export async function getAffiliateAdminStats(service: SupabaseClient): Promise<AffiliateAdminStats> {
  const [{ data: linksData }, { data: clicksData }, { data: attributionsData }, { data: sharesData }, tiers] = await Promise.all([
    service.from('affiliate_links').select('id, user_id, affiliate_code, is_active'),
    service.from('affiliate_clicks').select('id, link_id, target_type, target_id, ip_hash, source, created_at'),
    service.from('affiliate_attributions').select('id, click_id, order_id, commission_amount, status, created_at'),
    service.from('share_events').select('platform'),
    getActiveTiers(service),
  ]);

  const links = linksData ?? [];
  const clicks = clicksData ?? [];
  const attributions = attributionsData ?? [];
  const shares = sharesData ?? [];

  const userIds = [...new Set(links.map((l) => l.user_id))];
  const { data: usersData } = userIds.length
    ? await service.from('users').select('id, full_name, email').in('id', userIds)
    : { data: [] as { id: string; full_name: string | null; email: string }[] };
  const usersById = new Map((usersData ?? []).map((u) => [u.id, u]));

  const clickById = new Map(clicks.map((c) => [c.id, c]));
  const linkById = new Map(links.map((l) => [l.id, l]));

  // 'rejected' (admin manually declined) is inactive here too, same as
  // 'reversed' — see lib/affiliate/clearing.ts's file header for the
  // distinction between the two.
  const activeAttributions = attributions.filter((a) => a.status !== 'reversed' && a.status !== 'rejected');
  const totalCommission = activeAttributions.reduce((sum, a) => add(sum, Number(a.commission_amount)), 0);

  // ── Referral counts per link (commission comes from rankByCommission below) ──
  // Tiers are keyed off lifetime CONFIRMED referrals only (see tier.ts) —
  // separate from the plain referral count, which intentionally includes
  // pending ones too (for the "Referrals" totals card).
  const referralCountByLink = new Map<string, number>();
  const confirmedCountByLink = new Map<string, number>();
  for (const attribution of activeAttributions) {
    const click = clickById.get(attribution.click_id);
    if (!click) continue;
    referralCountByLink.set(click.link_id, (referralCountByLink.get(click.link_id) ?? 0) + 1);
    if (attribution.status === 'confirmed') {
      confirmedCountByLink.set(click.link_id, (confirmedCountByLink.get(click.link_id) ?? 0) + 1);
    }
  }

  // ── Top earners — lib/affiliate/leaderboard.ts's rankByCommission(), the
  // exact same algorithm the user-facing "your rank" card uses (all-time
  // here, monthly there — see that file for why the window differs but the
  // algorithm never should). ──
  const ranked = rankByCommission(links, attributions, new Map(clicks.map((c) => [c.id, c.link_id])));
  const topEarners: TopEarner[] = ranked
    .filter((e) => e.commission > 0)
    .slice(0, TOP_EARNERS_LIMIT)
    .map((entry) => {
      const tier = resolveTier(tiers, confirmedCountByLink.get(entry.linkId) ?? 0);
      return {
        userId: entry.userId,
        userName: userDisplayName(usersById.get(entry.userId)),
        affiliateCode: entry.affiliateCode,
        referrals: referralCountByLink.get(entry.linkId) ?? 0,
        commission: entry.commission,
        tierName: tier.tierName,
      };
    });

  // ── Attribution detail rows (product names resolved below) ────
  const productIds = [
    ...new Set(
      activeAttributions
        .map((a) => {
          const click = clickById.get(a.click_id);
          return click?.target_type === 'product' ? click.target_id : null;
        })
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const productNames = await resolveProductNames(productIds);

  const attributionRows: AffiliateAttributionRow[] = attributions.map((a) => {
    const click = clickById.get(a.click_id);
    const link = click ? linkById.get(click.link_id) : undefined;
    const productId = click?.target_type === 'product' ? click.target_id : null;
    return {
      id: a.id,
      userId: link?.user_id ?? '',
      userName: link ? userDisplayName(usersById.get(link.user_id)) : 'Unknown user',
      productId,
      productName: productId ? (productNames.get(productId) ?? 'Deleted listing') : null,
      orderId: a.order_id,
      commissionAmount: Number(a.commission_amount),
      status: a.status,
      createdAt: a.created_at,
    };
  });
  attributionRows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const funnel = computeFunnel(
    shares.map((s) => ({ platform: s.platform })),
    clicks.map((c) => ({ id: c.id, source: c.source })),
    activeAttributions.map((a) => ({ clickId: a.click_id })),
  );

  return {
    totals: {
      totalAffiliates: links.length,
      totalClicks: clicks.length,
      totalReferrals: activeAttributions.length,
      totalCommission,
    },
    tiers,
    topEarners,
    attributions: attributionRows,
    funnel,
  };
}
