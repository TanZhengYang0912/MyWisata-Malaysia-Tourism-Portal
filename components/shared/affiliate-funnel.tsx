"use client";

// P4 — Member 4: shares -> clicks -> bookings funnel. CLAUDE-FUNNEL-AI.md Part 1.
// Shared between /customer/affiliate (one user) and /admin/affiliate
// (platform-wide) — same shape, same honesty rules either way.

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useTranslation } from "react-i18next";
import type { Funnel } from "@/lib/affiliate/funnel";

function pct(rate: number | null): string {
  return rate === null ? "—" : `${(rate * 100).toFixed(rate * 100 >= 10 ? 0 : 1)}%`;
}

const PLATFORM_KEY: Record<string, string> = {
  native: "affiliate.platforms.shareSheet",
  copy_link: "affiliate.platforms.copiedLink",
  unknown: "affiliate.platforms.unknown",
};

interface AffiliateFunnelSectionProps {
  funnel: Funnel;
  /** "Bookings" on the user dashboard, "Conversions" platform-wide — same data, different framing. */
  conversionLabel?: string;
}

export function AffiliateFunnelSection({ funnel, conversionLabel = "Bookings" }: AffiliateFunnelSectionProps) {
  const { t } = useTranslation("vendor");
  const resolvedConversionLabel = conversionLabel === "Conversions" ? t("affiliate.conversions") : t("affiliate.bookings");
  const platformLabel = (platform: string) => PLATFORM_KEY[platform] ? t(PLATFORM_KEY[platform]) : platform;
  if (funnel.shares === 0) {
    return <p className="text-sm text-muted-foreground py-6 text-center">{t('affiliate.funnelEmpty')}</p>;
  }

  const chartData = [
    { stage: t('affiliate.shares'), value: funnel.shares },
    { stage: t('affiliate.clicks'), value: funnel.clicks },
    { stage: resolvedConversionLabel, value: funnel.conversions },
  ];

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground font-[family-name:var(--font-mono)]">{funnel.shares}</p>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{t('affiliate.shares')}</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground font-[family-name:var(--font-mono)]">{funnel.clicks}</p>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{t('affiliate.clicks')}</p>
          <p className="text-[11px] text-primary font-semibold">{pct(funnel.shareToClickRate)}</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-foreground font-[family-name:var(--font-mono)]">{funnel.conversions}</p>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">{resolvedConversionLabel}</p>
          <p className="text-[11px] text-primary font-semibold">{pct(funnel.clickToConversionRate)}</p>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
          <XAxis dataKey="stage" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
          <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
          <Tooltip />
          <Bar dataKey="value" fill="var(--primary)" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>

      {funnel.byPlatform.length > 0 && (
        <div className="mt-4 rounded-xl border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-muted text-muted-foreground uppercase tracking-wide">
              <tr>
                <th className="text-left px-3 py-2 font-semibold">{t('affiliate.platform')}</th>
                <th className="text-right px-3 py-2 font-semibold">{t('affiliate.shares')}</th>
                <th className="text-right px-3 py-2 font-semibold">{t('affiliate.clicks')}</th>
                <th className="text-right px-3 py-2 font-semibold">{resolvedConversionLabel}</th>
              </tr>
            </thead>
            <tbody>
              {funnel.byPlatform.map((row) => (
                <tr key={row.platform} className="border-t border-border">
                  <td className="px-3 py-2 font-medium text-foreground">{platformLabel(row.platform)}</td>
                  <td className="px-3 py-2 text-right font-[family-name:var(--font-mono)]">{row.shares}</td>
                  <td className="px-3 py-2 text-right font-[family-name:var(--font-mono)]">{row.clicks ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-[family-name:var(--font-mono)]">{row.conversions ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!funnel.sourceTrackingActive && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground bg-muted/50 border-t border-border">
              {t('affiliate.trackingNotice', { conversion: resolvedConversionLabel.toLowerCase() })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
