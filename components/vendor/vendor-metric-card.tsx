import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/components/utils";

export type VendorMetricTone = "default" | "attention" | "positive";

export interface VendorMetricCardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  /** Colour the figure only when it carries meaning (e.g. work waiting). */
  tone?: VendorMetricTone;
  density?: "comfortable" | "compact";
}

const toneClasses: Record<VendorMetricTone, string> = {
  default: "text-foreground",
  attention: "text-amber-700 dark:text-amber-300",
  positive: "text-emerald-700 dark:text-emerald-300",
};

/**
 * One neutral figure card for every Vendor Portal summary row: sentence-case
 * label, tabular figure, optional comparison note. Surfaces stay neutral so
 * colour is reserved for status.
 */
export function VendorMetricCard({
  label,
  value,
  note,
  tone = "default",
  density = "comfortable",
  className,
  ...rest
}: VendorMetricCardProps) {
  return (
    <article
      {...rest}
      className={cn(
        "min-w-0 rounded-2xl border border-border bg-card",
        density === "compact" ? "px-3 py-2.5" : "px-4 py-3.5",
        className,
      )}
    >
      <p className="truncate text-xs font-medium text-muted-foreground sm:text-[0.8125rem]">{label}</p>
      <p className={cn("tabular-nums font-semibold tracking-tight", density === "compact" ? "mt-0.5 text-xl" : "mt-1 text-2xl", toneClasses[tone])}>{value}</p>
      {note && <div className="mt-0.5 truncate text-xs text-muted-foreground">{note}</div>}
    </article>
  );
}
