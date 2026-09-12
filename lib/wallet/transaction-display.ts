export type TransactionFilter = "all" | "earnings" | "withdrawals";
export type TransactionGroup = Exclude<TransactionFilter, "all">;

import { formatMYR } from "@/lib/i18n/format";

type TransactionLike = {
  type: string;
  direction: string;
};

type AmountTransactionLike = TransactionLike & {
  amount: number;
};

const TRANSACTION_LABELS: Record<string, string> = {
  topup: "Wallet top-up",
  spend: "Purchase",
  earnings: "Earnings",
  withdrawal_reserve: "Withdrawal requested",
  withdrawal_complete: "Withdrawal paid",
  withdrawal_cancel: "Withdrawal returned",
  earnings_pending: "Pending earnings",
  earnings_confirm: "Earnings released",
  earnings_reverse: "Pending earnings reversed",
  refund: "Refund",
  adjustment_credit: "Balance adjustment",
  adjustment_debit: "Balance adjustment",
};

function humanize(value: string) {
  return value.replace(/[-_]+/g, " ").toLowerCase().replace(/^\w/, (letter) => letter.toUpperCase());
}

export function transactionLabel(type: string) {
  return TRANSACTION_LABELS[type] || humanize(type);
}

export function transactionGroup(type: string): TransactionGroup {
  return type.startsWith("withdrawal_") ? "withdrawals" : "earnings";
}

export function transactionTone(direction: string) {
  return direction === "credit" ? "positive" : "negative";
}

export function signedTransactionAmount(transaction: AmountTransactionLike) {
  const sign = transaction.direction === "credit" ? "+" : "-";
  return `${sign}${formatMYR(Math.abs(transaction.amount))}`;
}

export function customerVisibleTransactions<T extends TransactionLike>(items: T[]) {
  return items.filter((item) => item.type !== "withdrawal_complete");
}

export function filterTransactions<T extends TransactionLike>(items: T[], filter: TransactionFilter) {
  if (filter === "all") return items;
  return items.filter((item) => transactionGroup(item.type) === filter);
}
