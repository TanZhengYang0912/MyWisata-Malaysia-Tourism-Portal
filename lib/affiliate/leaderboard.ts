// P4 — Member 4: shared leaderboard ranking. CLAUDE-QUICKWINS.md Item 1.
//
// rankByCommission() is the exact same algorithm lib/affiliate/admin-stats.ts's
// topEarners already used inline — extracted here so the admin leaderboard
// and this file's user-facing rank can never silently compute "rank" two
// different ways (admin-stats.ts now calls this too, not a parallel copy).
//
// What DOES differ deliberately: the time window. Admin sees all-time (the
// full picture, unchanged from before this file existed); the user-facing
// rank below is scoped to the last RANK_WINDOW_DAYS ("this month" — a
// rolling window, matching every other "monthly" concept already in this
// codebase: the click cap, the funnel's 30-day chart. No calendar-month
// concept exists anywhere here, so this doesn't introduce a third window
// definition). A brand-new affiliate can still climb this month's board
// instead of being permanently buried under whoever earned the most ever.
//
// commission = pending + confirmed (every non-reversed attribution) — same
// metric admin-stats.ts's totals/topEarners already call "commission
// earned". Deliberately NOT "confirmed only": that would make this and the
// admin view disagree about a number both already expose under the same name.

import type { SupabaseClient } from '@supabase/supabase-js';
import { add } from '@/lib/money';

const RANK_WINDOW_DAYS = 30;

export interface LeaderboardEntry {
  linkId: string;
  userId: string;
  affiliateCode: string;
  commission: number;
}

export function rankByCommission(
  links: { id: string; user_id: string; affiliate_code: string }[],
  attributions: { click_id: string; commission_amount: number; status: string }[],
  clickToLink: Map<string, string>,
): LeaderboardEntry[] {
  const commissionByLink = new Map<string, number>();
  for (const a of attributions) {
    if (a.status === 'reversed') continue;
    const linkId = clickToLink.get(a.click_id);
    if (!linkId) continue;
    commissionByLink.set(linkId, add(commissionByLink.get(linkId) ?? 0, Number(a.commission_amount)));
  }
  return links
    .map((link) => ({
      linkId: link.id,
      userId: link.user_id,
      affiliateCode: link.affiliate_code,
      commission: commissionByLink.get(link.id) ?? 0,
    }))
    .sort((a, b) => b.commission - a.commission);
}

export interface LeaderboardPeer {
  rank: number;
  affiliateCode: string;
  commission: number;
}

export interface UserRank {
  /** null = zero commission this window — not ranked, "join the leaderboard" territory, not "last place". */
  rank: number | null;
  /** Affiliates with >0 commission this window — the field you're actually being ranked among. */
  totalAffiliates: number;
  commission: number;
  windowDays: number;
  /** Top 5, anonymised (code only, never a name) — same identity rule as the admin AI insight's narration. */
  topPeers: LeaderboardPeer[];
}

/** The user-facing "this month" rank — same rankByCommission() the admin leaderboard uses, scoped to the last 30 days. */
export async function getUserRank(service: SupabaseClient, userId: string): Promise<UserRank> {
  const windowStart = new Date(Date.now() - RANK_WINDOW_DAYS * 86_400_000).toISOString();

  const [{ data: linksData }, { data: clicksData }] = await Promise.all([
    service.from('affiliate_links').select('id, user_id, affiliate_code'),
    service.from('affiliate_clicks').select('id, link_id'),
  ]);
  const links = linksData ?? [];
  const clicks = clicksData ?? [];
  const clickToLink = new Map(clicks.map((c) => [c.id, c.link_id]));
  const clickIds = clicks.map((c) => c.id);

  const { data: attributionsData } = clickIds.length
    ? await service
        .from('affiliate_attributions')
        .select('click_id, commission_amount, status')
        .in('click_id', clickIds)
        .gte('created_at', windowStart)
    : { data: [] as { click_id: string; commission_amount: number; status: string }[] };

  const ranked = rankByCommission(links, attributionsData ?? [], clickToLink);
  const earners = ranked.filter((e) => e.commission > 0);

  const myEntry = ranked.find((e) => e.userId === userId);
  const myRankIndex = myEntry && myEntry.commission > 0 ? earners.findIndex((e) => e.userId === userId) : -1;

  return {
    rank: myRankIndex >= 0 ? myRankIndex + 1 : null,
    totalAffiliates: earners.length,
    commission: myEntry?.commission ?? 0,
    windowDays: RANK_WINDOW_DAYS,
    topPeers: earners.slice(0, 5).map((e, i) => ({ rank: i + 1, affiliateCode: e.affiliateCode, commission: e.commission })),
  };
}
