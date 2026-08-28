"use client";

import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WalletTransaction } from "@/backend/core/types";
import {
  customerVisibleTransactions,
  signedTransactionAmount,
  transactionLabel,
} from "@/lib/wallet/transaction-display";

export function CustomerTransactionHistory({ transactions }: { transactions: WalletTransaction[] }) {
  const { t, i18n } = useTranslation("customer");
  const locale = i18n.language === "en" ? "en-MY" : i18n.language;
  const visibleTransactions = customerVisibleTransactions(transactions);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="border-b border-border px-5 py-4">
        <h2 className="text-sm font-bold text-foreground">{t("ui.wallet.transactionHistory")}</h2>
      </div>
      {visibleTransactions.length === 0 ? (
        <div className="px-5 py-8 text-center text-sm text-muted-foreground">{t("ui.wallet.noTransactions")}</div>
      ) : (
        <div className="divide-y divide-border">
          {visibleTransactions.map((transaction) => {
            const debit = transaction.direction === "debit";
            const amountClass = transaction.direction === "debit" ? "text-primary" : "text-foreground";
            const label = t(`ui.wallet.transactionType.${transaction.type}`, {
              defaultValue: transactionLabel(transaction.type),
            });

            return (
              <article key={transaction.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${debit ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                    {debit ? <ArrowUpRight size={15} aria-hidden="true" /> : <ArrowDownLeft size={15} aria-hidden="true" />}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground">{new Date(transaction.createdAt).toLocaleDateString(locale)}</p>
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
    </section>
  );
}
