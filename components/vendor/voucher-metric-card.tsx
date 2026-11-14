import type { ReactNode } from "react";

import { cn } from "@/components/utils";

export interface VoucherMetricCardProps {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "navy" | "gold" | "muted";
  density?: "comfortable" | "compact";
  className?: string;
}

const toneClasses = {
  navy: "text-primary",
  gold: "text-amber-600 dark:text-amber-300",
  muted: "text-gray-900 dark:text-foreground",
} as const;

export function VoucherMetricCard({
  label,
  value,
  note,
  tone = "muted",
  density = "comfortable",
  className,
}: VoucherMetricCardProps) {
  return (
    <article
      data-voucher-metric
      className={cn(
        "min-w-0 rounded-2xl border border-gray-100 bg-card shadow-sm dark:border-border dark:bg-card",
        density === "compact" ? "p-3" : "p-4",
        className,
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-muted-foreground">{label}</p>
      <p className={cn("tabular-nums font-bold tracking-tight", density === "compact" ? "mt-0.5 text-xl" : "mt-1 text-2xl", toneClasses[tone])}>{value}</p>
      {note && <div className={cn("text-muted-foreground/70", density === "compact" ? "mt-0.5 text-[11px] leading-4" : "mt-1 text-xs leading-5")}>{note}</div>}
    </article>
  );
}
