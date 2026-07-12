"use client";

// P4 — Member 4: clicks-over-time chart for the affiliate dashboard (Step 6).

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AffiliateDailyClicks } from "@/lib/affiliate/stats";

interface AffiliateClicksChartProps {
  data: AffiliateDailyClicks[];
}

export function AffiliateClicksChart({ data }: AffiliateClicksChartProps) {
  const hasClicks = data.some((d) => d.clicks > 0);

  if (!hasClicks) {
    return (
      <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
        No clicks in the last 30 days.
      </div>
    );
  }

  const chartData = data.map((d) => ({ ...d, label: d.date.slice(5) }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
        <XAxis dataKey="label" axisLine={false} tickLine={false} interval={4} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
        <Tooltip formatter={(value) => [value, "Clicks"]} labelFormatter={(label) => `Day ${label}`} />
        <Line type="monotone" dataKey="clicks" name="Clicks" stroke="var(--primary)" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
