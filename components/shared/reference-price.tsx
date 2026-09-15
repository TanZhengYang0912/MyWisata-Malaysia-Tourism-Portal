"use client";

import { useTranslation } from "react-i18next";
import { useReferenceCurrency } from "@/components/providers/reference-currency";
import { cn } from "@/components/utils";
import { convertMYR, formatReferenceCurrency } from "@/lib/currency/reference";
import { formatMYR } from "@/lib/i18n/format";

export function ReferencePrice({
  amountMYR,
  className,
  referenceClassName,
  showReference = true,
  showSettlementMYR = false,
}: {
  amountMYR: number;
  className?: string;
  referenceClassName?: string;
  showReference?: boolean;
  showSettlementMYR?: boolean;
}) {
  const { t, i18n } = useTranslation("common");
  const { currency, snapshot } = useReferenceCurrency();
  const converted = snapshot ? convertMYR(amountMYR, snapshot.rate) : null;
  const canShowReference = showReference
    && currency !== "MYR"
    && snapshot?.quote === currency
    && converted !== null;
  const title = snapshot
    ? `${t("currency.referenceOnly")} ${t("currency.rateDate", { date: snapshot.date })}`
    : undefined;

  return (
    <span className={cn("inline-flex flex-col", className)}>
      <span title={canShowReference ? title : undefined}>
        {canShowReference
          ? formatReferenceCurrency(converted, currency, i18n.resolvedLanguage || "en")
          : formatMYR(amountMYR)}
      </span>
      {canShowReference && showSettlementMYR && (
        <span className={cn("text-xs font-normal text-muted-foreground", referenceClassName)} title={title}>
          {t("currency.settlementAmount", { amount: formatMYR(amountMYR) })}
        </span>
      )}
    </span>
  );
}
