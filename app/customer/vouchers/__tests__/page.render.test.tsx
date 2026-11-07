import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/providers/action-feedback", () => ({
  useActionFeedback: () => ({ showFeedback: vi.fn() }),
}));

vi.mock("@/components/providers/support-chat", () => ({
  useSupportChat: () => ({ selectChat: vi.fn(), unreadChatCount: 0 }),
}));

vi.mock("@/backend/domains/catalogue", () => ({
  CATEGORIES: [],
  STATES_MY: [],
}));

import VoucherHubClient from "@/app/customer/vouchers/voucher-hub-client";

describe("customer voucher hub header", () => {
  it("removes the help popover while keeping the voucher views and search", () => {
    const markup = renderToStaticMarkup(<VoucherHubClient />);

    expect(markup).not.toContain("ui.voucherHub.howItWorks");
    expect(markup).not.toContain("voucher-help");
    expect(markup).toContain("ui.voucherHub.browseDeals");
    expect(markup).toContain("ui.voucherHub.myVouchers");
    expect(markup).toContain('aria-label="ui.voucherHub.searchLabel"');
    expect(markup).toContain("ui.voucherHub.searchPlaceholder");
  });
});
