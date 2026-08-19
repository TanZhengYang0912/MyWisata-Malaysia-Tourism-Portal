"use client";

// P4 — Member 4: leaderboard rank card. CLAUDE-QUICKWINS.md Item 1.
// "This month" (rolling 30 days) rank by commission earned — see
// lib/affiliate/leaderboard.ts for why the window differs from the
// all-time admin leaderboard while the ranking algorithm doesn't.

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatMYR, formatNumber } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";

interface RankData {
  rank: number | null;
  totalAffiliates: number;
  commission: number;
  windowDays: number;
  topPeers: { rank: number; affiliateCode: string; commission: number }[];
}

export function AffiliateRankCard() {
  const { t, i18n } = useTranslation("vendor");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
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
        <Trophy size={13} /> {t("affiliate.rank.title")}
      </p>
      {rank.rank === null ? (
        <p className="text-sm text-muted-foreground">{t("affiliate.rank.empty")}</p>
      ) : (
        <>
          <p className="text-2xl font-bold text-foreground font-[family-name:var(--font-mono)]">
            {t("affiliate.rank.position", { rank: formatNumber(rank.rank, locale), total: formatNumber(rank.totalAffiliates, locale) })}
          </p>
          <p className="text-xs text-muted-foreground mt-1">{t("affiliate.rank.earnings", { amount: formatMYR(rank.commission, locale, { minimumFractionDigits: 2 }) })}</p>
        </>
      )}
      {rank.topPeers.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border space-y-1">
          <p className="text-[0.625rem] uppercase tracking-wide text-muted-foreground font-semibold mb-1.5">{t("affiliate.rank.topFive")}</p>
          {rank.topPeers.map((p) => (
            <div key={p.rank} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                #{p.rank} <span className="font-[family-name:var(--font-mono)] text-foreground">{p.affiliateCode}</span>
              </span>
              <span className="font-[family-name:var(--font-mono)] text-foreground">{formatMYR(p.commission, locale, { minimumFractionDigits: 2 })}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
