"use client";

// P4 — Member 4: fraud flags over time (CLAUDE-P4-EXTRAS.md Extra 2).
// Same theming approach as affiliate-clicks-chart.tsx (CSS vars, not fixed
// hex) so it matches dark mode on the admin dashboard.

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FraudFlagsByDay } from "@/lib/affiliate/fraud-analytics";

interface FraudTrendChartProps {
  data: FraudFlagsByDay[];
}

export function FraudTrendChart({ data }: FraudTrendChartProps) {
  const hasFlags = data.some((d) => d.count > 0);

  if (!hasFlags) {
    return (
      <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
        No fraud flags in this range.
      </div>
    );
  }

  // Long ranges ('all') can have many day buckets — thin the X-axis labels
  // out rather than overlapping them, same idea as the 30-day clicks chart's
  // interval={4}.
  const labelInterval = data.length > 45 ? Math.ceil(data.length / 12) : data.length > 14 ? 4 : 0;
  const chartData = data.map((d) => ({ ...d, label: d.date.slice(5) }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="fraudTrendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--destructive)" stopOpacity={0.35} />
            <stop offset="95%" stopColor="var(--destructive)" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
        <XAxis
          dataKey="label"
          axisLine={false}
          tickLine={false}
          interval={labelInterval}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        />
        <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
        <Tooltip formatter={(value) => [value, "Flags"]} labelFormatter={(label) => `Day ${label}`} />
        <Area type="monotone" dataKey="count" name="Flags" stroke="var(--destructive)" strokeWidth={2.5} fill="url(#fraudTrendFill)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
