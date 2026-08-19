"use client";

// P4 — Member 4: fraud flag type + severity breakdown (CLAUDE-P4-EXTRAS.md
// Extra 2). Two small charts, kept in one file since neither is reused
// elsewhere and they share the same data shape family.

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { FraudSeverityCount, FraudTypeCount } from "@/lib/affiliate/fraud-analytics";

const FLAG_TYPE_LABEL: Record<string, string> = {
  self_referral: "Self-referral",
  duplicate_attribution: "Duplicate payout attempt",
  expired_attribution: "Expired attribution",
  click_velocity: "Click velocity spike",
  visitor_clustering: "Visitor clustering",
  zero_conversion: "Zero conversion",
  click_cap_reached: "Click cap reached",
  vendor_ineligible: "Vendor ineligible",
};

const SEVERITY_COLOR: Record<string, string> = {
  high: "var(--destructive)",
  medium: "#d97706", // matches the amber-600 used by the fraud flags table's severity badge
  low: "var(--muted-foreground)",
};

interface FraudTypeBarChartProps {
  data: FraudTypeCount[];
}

export function FraudTypeBarChart({ data }: FraudTypeBarChartProps) {
  const hasFlags = data.some((d) => d.count > 0);
  if (!hasFlags) {
    return <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">No fraud flags in this range.</div>;
  }

  const chartData = data.map((d) => ({ ...d, label: FLAG_TYPE_LABEL[d.flagType] ?? d.flagType }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" horizontal={false} />
        <XAxis type="number" allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="label"
          axisLine={false}
          tickLine={false}
          width={150}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        />
        <Tooltip formatter={(value) => [value, "Flags"]} />
        <Bar dataKey="count" name="Flags" fill="var(--primary)" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

interface FraudSeverityDonutProps {
  data: FraudSeverityCount[];
}

export function FraudSeverityDonut({ data }: FraudSeverityDonutProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  if (total === 0) {
    return <div className="flex h-[160px] items-center justify-center text-sm text-muted-foreground">No fraud flags in this range.</div>;
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: 140, height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="count" nameKey="severity" cx="50%" cy="50%" innerRadius={42} outerRadius={64} paddingAngle={2} stroke="none">
              {data.map((entry) => (
                <Cell key={entry.severity} fill={SEVERITY_COLOR[entry.severity]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-foreground leading-tight">{total}</span>
          <span className="text-[0.625rem] text-muted-foreground">total</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {data.map((d) => (
          <div key={d.severity} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: SEVERITY_COLOR[d.severity] }} />
            <span className="capitalize text-foreground w-14">{d.severity}</span>
            <span className="text-muted-foreground">{d.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
