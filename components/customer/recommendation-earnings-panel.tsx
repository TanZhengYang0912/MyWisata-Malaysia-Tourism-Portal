"use client";

// P4 — recommendation earnings, shown on both /customer/affiliate and
// /customer/recommendations (and filtered to one recommendation on the
// detail page). Reporting only — reads GET /api/recommendations/earnings,
// which reads recommendation_commissions; no money path involved.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatMYR } from "@/lib/i18n/format";
import type { RecommendationEarnings } from "@/lib/recommendations/earnings";

interface Props {
  /** Limit the list to a single recommendation (detail page). */
  recommendationId?: string;
  /** Render a one-line "no earnings yet" note instead of nothing when empty. */
  showEmpty?: boolean;
}

export function RecommendationEarningsPanel({ recommendationId, showEmpty = false }: Props) {
  const { t } = useTranslation("customer");
  const [data, setData] = useState<RecommendationEarnings | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/recommendations/earnings");
        const body = (await res.json()) as { data: RecommendationEarnings | null };
        setData(res.ok ? body.data ?? null : null);
      } catch {
        setData(null);
      }
    })();
  }, []);

  if (data === undefined || data === null) return null; // loading / failed — not critical

  const commissions = recommendationId
    ? data.commissions.filter((c) => c.recommendationId === recommendationId)
    : data.commissions;

  if (commissions.length === 0) {
    if (!showEmpty) return null;
    return (
      <div className="mb-6 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-[0_8px_24px_rgba(1,0,102,0.06)]">
        {t("ui.recommendationEarnings.empty")}
      </div>
    );
  }

  // On the detail page the page-level totals (across every recommendation)
  // would be misleading next to a single-recommendation list — derive from
  // the filtered rows instead.
  const scoped = recommendationId;
  const pending = scoped
    ? commissions.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0)
    : data.totals.pending;
  const lifetime = scoped
    ? commissions.filter((c) => c.status === "confirmed").reduce((s, c) => s + c.amount, 0)
    : data.totals.lifetimeCleared;

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_8px_24px_rgba(1,0,102,0.06)]">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles size={15} />
        </span>
        <h2 className="text-sm font-bold text-foreground">{t("ui.recommendationEarnings.title")}</h2>
      </div>

      <div className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-3">
        <div>
          <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">{t("ui.recommendationEarnings.pending")}</p>
          <p className="mt-1 text-lg font-bold text-foreground font-[family-name:var(--font-mono)]">{formatMYR(pending)}</p>
        </div>
        <div>
          <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">{t("ui.recommendationEarnings.lifetime")}</p>
          <p className="mt-1 text-lg font-bold text-foreground font-[family-name:var(--font-mono)]">{formatMYR(lifetime)}</p>
        </div>
        {!scoped && (
          <div>
            <p className="text-[0.6875rem] uppercase tracking-wide text-muted-foreground">{t("ui.recommendationEarnings.convertedVendors")}</p>
            <p className="mt-1 text-lg font-bold text-foreground font-[family-name:var(--font-mono)]">{data.totals.convertedVendors}</p>
          </div>
        )}
      </div>

      <div className="divide-y divide-border border-t border-border">
        {commissions.map((c) => {
          const inactive = c.status === "reversed";
          const statusLine =
            c.status === "confirmed"
              ? t("ui.recommendationEarnings.statusCleared")
              : c.status === "reversed"
                ? t("ui.recommendationEarnings.statusReversed")
                : c.clearsInDays === 0
                  ? t("ui.recommendationEarnings.clearsToday")
                  : t("ui.recommendationEarnings.clearsInDays", { count: c.clearsInDays ?? 0 });
          const label = c.type === "bonus" ? t("ui.recommendationEarnings.bonusLabel") : t("ui.recommendationEarnings.ongoingLabel");
          const name = c.vendorName ?? label;
          return (
            <div key={c.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                {c.recommendationId ? (
                  <Link href={`/customer/recommendations/${c.recommendationId}`} className="break-words whitespace-normal text-sm font-medium text-foreground hover:text-primary hover:underline">
                    {name}
                  </Link>
                ) : (
                  <p className="break-words whitespace-normal text-sm font-medium text-foreground">{name}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {label}
                  {c.type === "ongoing" && c.rate !== null && ` · ${(c.rate * 100).toFixed(0)}%`}
                  {" · "}
                  {new Date(c.createdAt).toLocaleDateString()}
                </p>
                <p className="text-xs text-muted-foreground">{statusLine}</p>
              </div>
              <p className={`shrink-0 font-bold font-[family-name:var(--font-mono)] ${inactive ? "text-muted-foreground line-through" : "text-foreground"}`}>
                {formatMYR(c.amount)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
