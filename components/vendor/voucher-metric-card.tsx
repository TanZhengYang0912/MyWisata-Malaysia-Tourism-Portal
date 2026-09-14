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
  gold: "text-[#b77900]",
  muted: "text-foreground",
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
        density === "compact"
          ? "rounded-xl border border-border bg-card px-4 py-3"
          : "rounded-2xl border border-border bg-card p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md",
        className,
      )}
    >
      <p className={cn("text-muted-foreground", density === "compact" ? "text-xs font-medium" : "text-sm")}>{label}</p>
      <p className={cn("tabular-nums font-bold tracking-tight", density === "compact" ? "mt-0.5 text-xl" : "mt-1 text-2xl", toneClasses[tone])}>{value}</p>
      {note && <div className={cn("text-muted-foreground/70", density === "compact" ? "mt-0.5 text-[11px] leading-4" : "mt-1 text-xs leading-5")}>{note}</div>}
    </article>
  );
}
