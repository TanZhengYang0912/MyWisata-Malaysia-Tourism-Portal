import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentUrl = new URL("../customer-transaction-history.tsx", import.meta.url);
const source = existsSync(componentUrl) ? readFileSync(componentUrl, "utf8") : "";

describe("customer wallet transaction history display contract", () => {
  it("uses ledger visibility and signed-amount helpers", () => {
    expect(source).toContain("customerVisibleTransactions(transactions)");
    expect(source).toContain("signedTransactionAmount(transaction)");
  });

  it("keeps credits neutral and colours debits with the primary blue", () => {
    expect(source).toContain('transaction.direction === "debit" ? "text-primary" : "text-foreground"');
  });

  it("uses localized transaction labels and dates", () => {
    expect(source).toContain('t(`ui.wallet.transactionType.${transaction.type}`');
    expect(source).toContain("toLocaleDateString(locale)");
  });
});
