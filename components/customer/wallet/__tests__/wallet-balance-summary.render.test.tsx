import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { WalletBalanceSummary } from "../wallet-balance-summary";

describe("customer wallet balance summary", () => {
  it("uses the same mono font and bold weight as withdrawal amounts", () => {
    const markup = renderToStaticMarkup(
      <WalletBalanceSummary buckets={{ topup: 0, earnings: 0, pendingEarnings: 0, reservedEarnings: 0, withdrawnEarnings: 0 }} onTopUp={() => {}} onWithdraw={() => {}} />,
    );

    expect(markup).toContain("font-[family-name:var(--font-mono)] text-sm font-bold");
    expect(markup).not.toContain("font-[family-name:var(--font-mono)] text-sm font-semibold");
  });
});
