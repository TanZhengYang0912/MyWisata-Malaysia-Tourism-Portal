"use client";

// P4 — Member 4: leaderboard rank card. CLAUDE-QUICKWINS.md Item 1.
// "This month" (rolling 30 days) rank by commission earned — see
// lib/affiliate/leaderboard.ts for why the window differs from the
// all-time admin leaderboard while the ranking algorithm doesn't.

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";

interface RankData {
  rank: number | null;
  totalAffiliates: number;
  commission: number;
  windowDays: number;
  topPeers: { rank: number; affiliateCode: string; commission: number }[];
}

export function AffiliateRankCard() {
  const [rank, setRank] = useState<RankData | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/affiliate/rank");
        const body = (await res.json()) as { data: RankData | null };
        setRank(res.ok ? (body.data ?? null) : null);
      } catch {
        setRank(null);
      }
    })();
  }, []);

  if (rank === undefined) return null; // loading — avoid a flash of empty state
  if (rank === null) return null; // failed to load — not critical, don't clutter the page with an error

  return (
    <div className="rounded-xl border border-border p-4 mb-6">
      <p className="text-xs font-bold uppercase tracking-wider text-primary mb-2 flex items-center gap-1.5">
        <Trophy size={13} /> Your Rank
      </p>
      {rank.rank === null ? (
        <p className="text-sm text-muted-foreground">Share a link to join the leaderboard.</p>
      ) : (
        <>
          <p className="text-2xl font-bold text-foreground font-[family-name:var(--font-mono)]">
            #{rank.rank} <span className="text-sm font-normal text-muted-foreground">of {rank.totalAffiliates} affiliates this month</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">by earnings — RM {rank.commission.toFixed(2)} this month</p>
        </>
      )}
      {rank.topPeers.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border space-y-1">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">Top 5 this month</p>
          {rank.topPeers.map((p) => (
            <div key={p.rank} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                #{p.rank} <span className="font-[family-name:var(--font-mono)] text-foreground">{p.affiliateCode}</span>
              </span>
              <span className="font-[family-name:var(--font-mono)] text-foreground">RM {p.commission.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
