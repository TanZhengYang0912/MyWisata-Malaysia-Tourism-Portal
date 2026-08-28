import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../page.tsx", import.meta.url), "utf8");

describe("customer wallet ledger integration", () => {
  it("loads wallet transactions with the balance and withdrawal state", () => {
    expect(source).toContain("getWalletTransactions");
    expect(source).toContain("useState<WalletTransaction[]>([])");
    expect(source).toContain("Promise.allSettled([");
    expect(source).toContain("getWalletTransactions(currentUser.id)");
    expect(source).toContain('transactionsResult.status === "fulfilled"');
    expect(source).toContain("setTransactions(transactionsResult.value)");
  });

  it("clears guest ledger state and renders the signed transaction history", () => {
    expect(source).toContain("setTransactions([])");
    expect(source).toContain("<CustomerTransactionHistory transactions={transactions} />");
    expect(source).toContain("<WithdrawalList pending={pending} />");
  });
});
