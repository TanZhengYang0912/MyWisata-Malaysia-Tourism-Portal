"use client";

import { useId, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { useReferenceCurrency } from "@/components/providers/reference-currency";
import { cn } from "@/components/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  isReferenceCurrency,
  REFERENCE_CURRENCIES,
  type ReferenceCurrency,
} from "@/lib/currency/reference";

export const CURRENCY_FLAG_ASSETS: Record<ReferenceCurrency, string> = {
  MYR: "/flags/my.svg",
  SGD: "/flags/sg.svg",
  USD: "/flags/us.svg",
  CNY: "/flags/cn.svg",
  EUR: "/flags/eu.svg",
};

type CurrencyFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function saveCurrencyPreference(
  currency: ReferenceCurrency,
  fetcher: CurrencyFetcher = fetch,
): Promise<void> {
  const response = await fetcher("/api/currency", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ currency }),
  });

  if (response.status !== 200) {
    throw new Error("Unable to save display currency");
  }
}

function CurrencyOption({ currency }: { currency: ReferenceCurrency }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Image
        src={CURRENCY_FLAG_ASSETS[currency]}
        alt=""
        aria-hidden="true"
        width={16}
        height={12}
        className="h-3 w-4 shrink-0 rounded-[2px] border border-foreground/10 object-cover"
      />
      <span className="truncate font-medium">{currency}</span>
    </span>
  );
}

export function CurrencySwitcher({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { t } = useTranslation("common");
  const { showFeedback } = useActionFeedback();
  const { currency } = useReferenceCurrency();
  const router = useRouter();
  const id = useId();
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  async function handleCurrencyChange(value: string) {
    if (saving || !isReferenceCurrency(value) || value === currency) return;

    setSaving(true);
    try {
      await saveCurrencyPreference(value);
      const message = t("currency.saved");
      setStatus(message);
      showFeedback("success", message);
      router.refresh();
    } catch {
      const message = t("currency.saveError");
      setStatus(message);
      showFeedback("error", message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("flex items-center gap-2", compact ? "w-full" : "w-fit", className)}>
      <label htmlFor={id} className={compact ? "sr-only" : "text-sm font-semibold text-foreground"}>
        {t("currency.label")}
      </label>
      <Select
        value={currency}
        onValueChange={(value) => { void handleCurrencyChange(value); }}
        disabled={saving}
      >
        <SelectTrigger
          id={id}
          aria-label={t("currency.label")}
          aria-busy={saving}
          className={cn(
            "rounded-xl border border-border bg-background text-sm text-foreground transition focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 disabled:cursor-wait disabled:opacity-60",
            compact ? "h-9 w-full min-w-0 justify-between gap-1 px-1.5 text-xs" : "h-10 min-w-32 px-3",
          )}
        >
          <SelectValue>
            <CurrencyOption currency={currency} />
          </SelectValue>
        </SelectTrigger>
        <SelectContent
          align="end"
          className="w-32 min-w-32 rounded-xl border-border shadow-[0_12px_32px_rgba(1,0,102,0.14)]"
        >
          {REFERENCE_CURRENCIES.map((code) => (
            <SelectItem key={code} value={code} className="rounded-lg py-2">
              <CurrencyOption currency={code} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="sr-only" aria-live="polite">{status}</span>
    </div>
  );
}
