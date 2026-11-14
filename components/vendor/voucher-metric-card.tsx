import type { ReactNode } from "react";

import { cn } from "@/components/utils";
import { VendorMetricCard, type VendorMetricTone } from "@/components/vendor/vendor-metric-card";

export interface VoucherMetricCardProps {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  tone?: "navy" | "gold" | "muted";
  density?: "comfortable" | "compact";
  className?: string;
}

// Voucher tones predate the shared card; the figure stays neutral and only
// "gold" (needs a look) keeps a meaning-bearing colour.
const toneMap: Record<NonNullable<VoucherMetricCardProps["tone"]>, VendorMetricTone> = {
  navy: "default",
  gold: "attention",
  muted: "default",
};

export function VoucherMetricCard({ label, value, note, tone = "muted", density = "comfortable", className }: VoucherMetricCardProps) {
  return (
    <VendorMetricCard
      data-voucher-metric
      label={label}
      value={value}
      note={note}
      tone={toneMap[tone]}
      density={density}
      className={cn("border-border bg-card", className)}
    />
  );
}
