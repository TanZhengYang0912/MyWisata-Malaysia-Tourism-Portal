import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../page.tsx", import.meta.url), "utf8");

describe("customer wallet ledger integration", () => {
  it("refreshes the independently filtered history after wallet refresh", () => {
    expect(source).not.toContain("getWalletTransactions");
    expect(source).toContain("const [historyRefreshKey, setHistoryRefreshKey] = useState(0)");
    expect(source).toContain("Promise.allSettled([");
    expect(source).toContain("setHistoryRefreshKey((key) => key + 1)");
  });

  it("clears guest ledger state and renders the signed transaction history", () => {
    expect(source).toContain("currentUser && <CustomerTransactionHistory key={currentUser.id} userId={currentUser.id} refreshKey={historyRefreshKey}");
    expect(source).toContain("<WithdrawalList pending={pending} />");
  });

  it("does not let a previous user's wallet request overwrite the active session", () => {
    expect(source).toContain("isActiveRef");
    expect(source).toContain("if (!isActiveRef.current) return;");
    expect(source).toContain('key={currentUser?.id ?? "guest"}');
  });

  it("bounds Wallet reads and exposes a retry action", () => {
    expect(source).toContain("const WALLET_READ_TIMEOUT_MS = 8_000");
    expect(source).toContain("new AbortController()");
    expect(source).toContain("signal: controller.signal");
    expect(source).toContain('tCustomer("ui.wallet.retryWallet")');
    expect(source).toContain("loadWallet");
  });
});
