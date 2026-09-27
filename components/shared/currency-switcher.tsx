"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AlertCircle } from "lucide-react";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { useReferenceCurrency } from "@/components/providers/reference-currency";
import { cn } from "@/components/utils";
import type { ReferenceRateSnapshot } from "@/lib/currency/rates";
import {
  isReferenceCurrency,
  REFERENCE_CURRENCIES,
  type ReferenceCurrency,
} from "@/lib/currency/reference";

type CurrencyFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function isReferenceRateUnavailable(
  currency: ReferenceCurrency,
  snapshot: ReferenceRateSnapshot | null,
) {
  return currency !== "MYR" && snapshot?.quote !== currency;
}

export function shouldNotifyRateUnavailable(
  lastNotifiedCurrency: ReferenceCurrency | null,
  currency: ReferenceCurrency,
  rateUnavailable: boolean,
) {
  return rateUnavailable && lastNotifiedCurrency !== currency;
}

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

export function CurrencySwitcher({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { t } = useTranslation("common");
  const { showFeedback } = useActionFeedback();
  const { currency, snapshot } = useReferenceCurrency();
  const router = useRouter();
  const id = useId();
  const rateStatusId = `${id}-rate-status`;
  const lastNotifiedUnavailableCurrency = useRef<ReferenceCurrency | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");
  const rateUnavailable = isReferenceRateUnavailable(currency, snapshot);
  const rateUnavailableMessage = rateUnavailable
    ? t("currency.rateUnavailable", { currency })
    : "";

  useEffect(() => {
    if (!rateUnavailable) {
      lastNotifiedUnavailableCurrency.current = null;
      return;
    }
    if (!shouldNotifyRateUnavailable(lastNotifiedUnavailableCurrency.current, currency, rateUnavailable)) return;
    lastNotifiedUnavailableCurrency.current = currency;
    showFeedback("error", rateUnavailableMessage, 8_000);
  }, [currency, rateUnavailable, rateUnavailableMessage, showFeedback]);

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
      <select
        id={id}
        aria-label={t("currency.label")}
        aria-describedby={rateUnavailable ? rateStatusId : undefined}
        aria-busy={saving}
        disabled={saving}
        value={currency}
        onChange={(event) => { void handleCurrencyChange(event.currentTarget.value); }}
        className={cn(
          "rounded-xl border border-border bg-background text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10 disabled:cursor-wait disabled:opacity-60",
          compact ? "h-9 min-w-0 flex-1 px-3" : "h-10 min-w-32 px-3",
        )}
      >
        {REFERENCE_CURRENCIES.map((code) => <option key={code} value={code}>{code}</option>)}
      </select>
      {rateUnavailable && (
        <span
          id={rateStatusId}
          role="status"
          title={rateUnavailableMessage}
          className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-amber-700"
        >
          <AlertCircle size={15} aria-hidden="true" />
          <span className={compact ? "sr-only" : undefined}>{rateUnavailableMessage}</span>
        </span>
      )}
      <span className="sr-only" aria-live="polite">{status}</span>
    </div>
  );
}
