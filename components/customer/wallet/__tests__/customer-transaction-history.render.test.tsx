import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/backend/supabase", () => ({ supabase: {} }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "en" } }) }));
import { CustomerTransactionHistory } from "../customer-transaction-history";

describe("customer history controls", () => {
  it("renders type, direction, inclusive dates and clear with an initial loading state", () => {
    const markup = renderToStaticMarkup(<CustomerTransactionHistory userId="alice" refreshKey={0} />);
    expect(markup).toContain('name="transaction-type"');
    expect(markup).toContain('name="transaction-direction"');
    expect(markup.match(/type="date"/g)).toHaveLength(2);
    expect(markup).toContain("ui.wallet.historyFilters.clear");
    expect(markup).toContain("ui.wallet.historyFilters.loading");
    expect(markup).not.toContain("ui.wallet.noTransactions");
    expect(markup).not.toContain("alice");
    for (const value of ["all", "topup", "spend", "earnings", "withdrawals", "refund", "adjustment", "credit", "debit"]) {
      expect(markup).toContain(`value="${value}"`);
    }
  });
});
