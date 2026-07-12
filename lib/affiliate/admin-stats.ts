// P4 — Member 4: admin affiliate oversight. See CLAUDE.md Step 9.

import type { SupabaseClient } from '@supabase/supabase-js';
import { add } from '@/lib/money';
import { getAffiliateCommissionRate } from './commission';

const HIGH_CLICKS_NO_REFERRALS_THRESHOLD = 5;
const CLUSTERED_VISITOR_THRESHOLD = 3;
const TOP_EARNERS_LIMIT = 10;

export interface AffiliateAdminTotals {
  totalAffiliates: number;
  totalClicks: number;
  totalReferrals: number;
  totalCommission: number; // non-reversed attributions only
  currentRate: number; // 0..1 fraction
}

export interface TopEarner {
  userId: string;
  userName: string;
  referrals: number;
  commission: number;
}

export type SuspiciousReason = 'high_clicks_no_referrals' | 'clustered_visitor';

export interface SuspiciousLink {
  linkId: string;
  userId: string;
  userName: string;
  affiliateCode: string;
  clicks: number;
  referrals: number;
  reasons: SuspiciousReason[];
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
  topEarners: TopEarner[];
  suspiciousLinks: SuspiciousLink[];
  attributions: AffiliateAttributionRow[];
}

function userDisplayName(row: { full_name: string | null; email: string } | undefined): string {
  return row?.full_name ?? row?.email ?? 'Unknown user';
}

export async function getAffiliateAdminStats(service: SupabaseClient): Promise<AffiliateAdminStats> {
  const [{ data: linksData }, { data: clicksData }, { data: attributionsData }, currentRate] = await Promise.all([
    service.from('affiliate_links').select('id, user_id, affiliate_code, is_active'),
    service.from('affiliate_clicks').select('id, link_id, target_type, target_id, ip_hash, created_at'),
    service.from('affiliate_attributions').select('id, click_id, order_id, commission_amount, status, created_at'),
    getAffiliateCommissionRate(service),
  ]);

  const links = linksData ?? [];
  const clicks = clicksData ?? [];
  const attributions = attributionsData ?? [];

  const userIds = [...new Set(links.map((l) => l.user_id))];
  const { data: usersData } = userIds.length
    ? await service.from('users').select('id, full_name, email').in('id', userIds)
    : { data: [] as { id: string; full_name: string | null; email: string }[] };
  const usersById = new Map((usersData ?? []).map((u) => [u.id, u]));

  const clickById = new Map(clicks.map((c) => [c.id, c]));
  const linkById = new Map(links.map((l) => [l.id, l]));

  const activeAttributions = attributions.filter((a) => a.status !== 'reversed');
  const totalCommission = activeAttributions.reduce((sum, a) => add(sum, Number(a.commission_amount)), 0);

  // ── Clicks/referrals per link ───────────────────────────────
  const clicksByLink = new Map<string, typeof clicks>();
  for (const click of clicks) {
    const list = clicksByLink.get(click.link_id) ?? [];
    list.push(click);
    clicksByLink.set(click.link_id, list);
  }

  const referralsByLink = new Map<string, { count: number; commission: number }>();
  for (const attribution of activeAttributions) {
    const click = clickById.get(attribution.click_id);
    if (!click) continue;
    const entry = referralsByLink.get(click.link_id) ?? { count: 0, commission: 0 };
    entry.count += 1;
    entry.commission = add(entry.commission, Number(attribution.commission_amount));
    referralsByLink.set(click.link_id, entry);
  }

  // ── Top earners ──────────────────────────────────────────────
  const topEarners: TopEarner[] = links
    .map((link) => {
      const referral = referralsByLink.get(link.id);
      return {
        userId: link.user_id,
        userName: userDisplayName(usersById.get(link.user_id)),
        referrals: referral?.count ?? 0,
        commission: referral?.commission ?? 0,
      };
    })
    .filter((e) => e.commission > 0)
    .sort((a, b) => b.commission - a.commission)
    .slice(0, TOP_EARNERS_LIMIT);

  // ── Suspicious activity ──────────────────────────────────────
  const suspiciousLinks: SuspiciousLink[] = [];
  for (const link of links) {
    const linkClicks = clicksByLink.get(link.id) ?? [];
    const referral = referralsByLink.get(link.id);
    const reasons: SuspiciousReason[] = [];

    if (linkClicks.length >= HIGH_CLICKS_NO_REFERRALS_THRESHOLD && !referral) {
      reasons.push('high_clicks_no_referrals');
    }

    const byVisitor = new Map<string, number>();
    for (const click of linkClicks) {
      if (!click.ip_hash) continue;
      byVisitor.set(click.ip_hash, (byVisitor.get(click.ip_hash) ?? 0) + 1);
    }
    if ([...byVisitor.values()].some((count) => count >= CLUSTERED_VISITOR_THRESHOLD)) {
      reasons.push('clustered_visitor');
    }

    if (reasons.length > 0) {
      suspiciousLinks.push({
        linkId: link.id,
        userId: link.user_id,
        userName: userDisplayName(usersById.get(link.user_id)),
        affiliateCode: link.affiliate_code,
        clicks: linkClicks.length,
        referrals: referral?.count ?? 0,
        reasons,
      });
    }
  }

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
  const { data: productsData } = productIds.length
    ? await service.from('products').select('id, name').in('id', productIds)
    : { data: [] as { id: string; name: string }[] };
  const productNames = new Map((productsData ?? []).map((p) => [p.id, p.name]));

  const attributionRows: AffiliateAttributionRow[] = attributions.map((a) => {
    const click = clickById.get(a.click_id);
    const link = click ? linkById.get(click.link_id) : undefined;
    const productId = click?.target_type === 'product' ? click.target_id : null;
    return {
      id: a.id,
      userId: link?.user_id ?? '',
      userName: link ? userDisplayName(usersById.get(link.user_id)) : 'Unknown user',
      productId,
      productName: productId ? (productNames.get(productId) ?? 'Unknown activity') : null,
      orderId: a.order_id,
      commissionAmount: Number(a.commission_amount),
      status: a.status,
      createdAt: a.created_at,
    };
  });
  attributionRows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return {
    totals: {
      totalAffiliates: links.length,
      totalClicks: clicks.length,
      totalReferrals: activeAttributions.length,
      totalCommission,
      currentRate,
    },
    topEarners,
    suspiciousLinks,
    attributions: attributionRows,
  };
}
