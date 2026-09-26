"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { WalletTransaction } from "@/backend/core/types";
import { getCustomerWalletTransactionPage } from "@/backend/domains/commerce";
import { Button } from "@/components/ui/button";
import {
  buildCustomerHistoryQuery, CUSTOMER_HISTORY_TYPES, CUSTOMER_HISTORY_DIRECTIONS,
  CUSTOMER_HISTORY_PAGE_SIZE, DEFAULT_CUSTOMER_HISTORY_FILTERS, type CustomerHistoryFilters,
} from "@/lib/wallet/customer-transaction-filters";
import {
  customerVisibleTransactions,
  signedTransactionAmount,
} from "@/lib/wallet/transaction-display";
import { getMalaysiaDateRangeDefaults } from "@/lib/datetime/date-input";

const WALLET_READ_TIMEOUT_MS = 8_000;

export function CustomerTransactionHistory({ userId, refreshKey }: { userId: string; refreshKey: number }) {
  const { t, i18n } = useTranslation("customer");
  const locale = i18n.language === "en" ? "en-MY" : i18n.language;
  const [filters, setFilters] = useState(DEFAULT_CUSTOMER_HISTORY_FILTERS);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; transactions: WalletTransaction[]; total: number; failed: boolean } | null>(null);
  const requestKey = JSON.stringify([userId, filters, refreshKey, attempt]);
  const validation = buildCustomerHistoryQuery(filters);
  const currentResult = result?.key === requestKey ? result : null;
  const loading = validation.ok && !currentResult;
  const transactions = currentResult?.transactions ?? [];
  const visibleTransactions = customerVisibleTransactions(transactions);
  const total = currentResult?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / CUSTOMER_HISTORY_PAGE_SIZE));
  const hasFilters = filters.type !== "all" || filters.direction !== "all" || !!filters.from || !!filters.to;
  const controlClass = "h-10 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground";

  useEffect(() => {
    if (!buildCustomerHistoryQuery(filters).ok) return;
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), WALLET_READ_TIMEOUT_MS);
    getCustomerWalletTransactionPage(userId, filters, controller.signal).then((page) => {
      if (active) setResult({ key: requestKey, ...page, failed: false });
    }).catch(() => {
      if (active) setResult({ key: requestKey, transactions: [], total: 0, failed: true });
    }).finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [userId, filters, requestKey]);

  function changeFilters(patch: Partial<Omit<CustomerHistoryFilters, "page">>) {
    setFilters((current) => ({ ...current, ...patch, page: 1 }));
  }

  function primeDateRange() {
    const defaults = getMalaysiaDateRangeDefaults();
    setFilters((current) => ({ ...current, from: current.from || defaults.from, to: current.to || defaults.to, page: 1 }));
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-bold text-foreground">{t("ui.wallet.transactionHistory")}</h2>
        <div className="mt-4 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto]">
          <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
            <span>{t("ui.wallet.historyFilters.type")}</span>
            <select name="transaction-type" className={controlClass} value={filters.type} onChange={(event) => changeFilters({ type: event.target.value as CustomerHistoryFilters["type"] })}>
              {CUSTOMER_HISTORY_TYPES.map((type) => <option key={type} value={type}>{t(`ui.wallet.historyFilters.types.${type}`)}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
            <span>{t("ui.wallet.historyFilters.direction")}</span>
            <select name="transaction-direction" className={controlClass} value={filters.direction} onChange={(event) => changeFilters({ direction: event.target.value as CustomerHistoryFilters["direction"] })}>
              {CUSTOMER_HISTORY_DIRECTIONS.map((direction) => <option key={direction} value={direction}>{t(`ui.wallet.historyFilters.directions.${direction}`)}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
            <span>{t("ui.wallet.historyFilters.from")}</span>
            <input name="transaction-from" type="date" className={controlClass} value={filters.from} onFocus={primeDateRange} onChange={(event) => changeFilters({ from: event.target.value })} />
          </label>
          <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
            <span>{t("ui.wallet.historyFilters.to")}</span>
            <input name="transaction-to" type="date" className={controlClass} value={filters.to} onFocus={primeDateRange} onChange={(event) => changeFilters({ to: event.target.value })} />
          </label>
          <Button type="button" variant="outline" onClick={() => setFilters({ ...DEFAULT_CUSTOMER_HISTORY_FILTERS })} disabled={!hasFilters && filters.page === 1}>
            {t("ui.wallet.historyFilters.clear")}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{t("ui.wallet.historyFilters.timezone")}</p>
      </div>
      {!validation.ok ? (
        <p role="alert" className="px-5 py-6 text-sm text-destructive">{t(`ui.wallet.historyFilters.${validation.error}`)}</p>
      ) : loading ? (
        <p role="status" className="px-5 py-8 text-center text-sm text-muted-foreground">{t("ui.wallet.historyFilters.loading")}</p>
      ) : currentResult?.failed ? (
        <div role="alert" className="space-y-3 px-5 py-6 text-center text-sm text-muted-foreground">
          <p>{t("ui.wallet.historyFilters.error")}</p>
          <Button type="button" variant="outline" onClick={() => setAttempt((value) => value + 1)}>{t("ui.wallet.historyFilters.retry")}</Button>
        </div>
      ) : visibleTransactions.length === 0 ? (
        <div role="status" className="px-5 py-8 text-center text-sm text-muted-foreground">{t(hasFilters || filters.page > 1 ? "ui.wallet.historyFilters.noMatches" : "ui.wallet.noTransactions")}</div>
      ) : (
        <div className="divide-y divide-border">
          {visibleTransactions.map((transaction) => {
            const debit = transaction.direction === "debit";
            const amountClass = transaction.direction === "debit" ? "text-wallet-debit" : "text-foreground";
            const label = t(`ui.wallet.transactionType.${transaction.type}`);

            return (
              <article key={transaction.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${debit ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {debit ? <ArrowUpRight size={15} aria-hidden="true" /> : <ArrowDownLeft size={15} aria-hidden="true" />}
                  </span>
                  <div className="min-w-0">
                    <p className="break-words whitespace-normal text-sm font-semibold text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{new Date(transaction.createdAt).toLocaleDateString(locale, { timeZone: "Asia/Kuala_Lumpur" })}</p>
                  </div>
                </div>
                <p className={`shrink-0 font-[family-name:var(--font-mono)] font-bold ${amountClass}`}>
                  {signedTransactionAmount(transaction)}
                </p>
              </article>
            );
          })}
        </div>
      )}
      {validation.ok && !loading && !currentResult?.failed && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
          <p role="status" className="text-xs text-muted-foreground">{t("ui.wallet.historyFilters.page", { page: filters.page, pages, total })}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>{t("ui.wallet.historyFilters.previous")}</Button>
            <Button type="button" variant="outline" disabled={filters.page >= pages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>{t("ui.wallet.historyFilters.next")}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
