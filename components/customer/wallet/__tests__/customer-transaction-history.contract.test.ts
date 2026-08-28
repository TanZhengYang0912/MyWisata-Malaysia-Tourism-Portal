import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const componentUrl = new URL("../customer-transaction-history.tsx", import.meta.url);
const source = existsSync(componentUrl) ? readFileSync(componentUrl, "utf8") : "";
const globalsSource = readFileSync(new URL("../../../../app/globals.css", import.meta.url), "utf8");
const rootTheme = globalsSource.match(/:root\s*{([\s\S]*?)}/)?.[1] ?? "";
const darkTheme = globalsSource.match(/\.dark\s*{([\s\S]*?)}/)?.[1] ?? "";

describe("customer wallet transaction history display contract", () => {
  it("uses ledger visibility and signed-amount helpers", () => {
    expect(source).toContain("customerVisibleTransactions(transactions)");
    expect(source).toContain("signedTransactionAmount(transaction)");
  });

  it("keeps credits neutral and gives debits an accessible theme-aware blue", () => {
    expect(source).toContain('transaction.direction === "debit" ? "text-wallet-debit" : "text-foreground"');
    expect(rootTheme).toContain("--wallet-debit: #4f46e5;");
    expect(darkTheme).toContain("--wallet-debit: #7c8bff;");
    expect(globalsSource).toContain("--color-wallet-debit: var(--wallet-debit);");
  });

  it("uses localized transaction labels and dates", () => {
    expect(source).toContain('t(`ui.wallet.transactionType.${transaction.type}`');
    expect(source).toContain("toLocaleDateString(locale)");
  });
});
