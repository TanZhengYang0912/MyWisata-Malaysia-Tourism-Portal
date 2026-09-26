import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: "en" } }) }));
vi.mock("@/components/customer/use-customer-capability-gate", () => ({
  useCustomerCapabilityGate: () => Object.assign(() => true, { handleResponse: vi.fn(async () => false) }),
}));

import { PromotionCampaignOfferCard } from "@/components/customer/promotion-campaign-offer-card";

const campaign: PromotionCampaignPublic = {
  id: "campaign", slug: "sample-event", title: "Sample", summary: "Campaign summary",
  description: "Campaign details", startsAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  endsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(), visibility: "live", offers: [],
};
const productOffer: PromotionCampaignPublic["offers"][number] = {
  kind: "product", id: "offer", position: 0,
  vendor: { id: "vendor-a", name: "Vendor A", logoUrl: null },
  outlet: { id: "outlet-a", name: "Outlet A", city: "George Town", state: "Penang", imageUrl: null },
  product: { id: "product-a", name: "Real product", description: "Product details", price: 18.5, imageUrl: null },
};
const remoteVoucherOffer: PromotionCampaignPublic["offers"][number] = {
  kind: "voucher", id: "voucher-offer", position: 0,
  vendor: { id: "vendor-a", name: "Vendor A", logoUrl: "https://thumb.wikimedia.org/vendor-logo.jpg" },
  outlet: null, eligibleOutlets: [{ id: "outlet-a", name: "Outlet A", city: "George Town", state: "Penang", imageUrl: null }],
  voucher: { id: "voucher-a", name: "Welcome offer", voucherType: "percent", discountValue: 10, minSpend: 0, validFrom: null, validUntil: null, maxUses: 10, usesCount: 0, redemptionMode: "online" },
  eligibleProducts: [],
};

describe("promotion campaign offer card", () => {
  it("renders the exact product outlet and preserves its outlet-specific activity URL", () => {
    const markup = renderToStaticMarkup(<PromotionCampaignOfferCard offer={productOffer} campaign={campaign} mode="detail" />);

    expect(markup).toContain("Outlet A");
    expect(markup).toContain("George Town");
    expect(markup).toContain("Product details");
    expect(markup).toContain('href="/customer/activity/product-a?outletId=outlet-a"');
  });

  it("keeps preview cards concise and leaves campaign navigation to the campaign action", () => {
    const markup = renderToStaticMarkup(<PromotionCampaignOfferCard offer={productOffer} campaign={campaign} mode="preview" />);

    expect(markup).toContain("<h3");
    expect(markup).toContain("Outlet A");
    expect(markup).not.toContain("Product details");
    expect(markup).not.toContain('href="/customer/events/sample-event"');
    expect(markup).not.toContain('href="/customer/activity/product-a?outletId=outlet-a"');
  });

  it("does not activate an upcoming product offer before its campaign starts", () => {
    const upcoming = { ...campaign, visibility: "upcoming" as const, startsAt: "2099-01-01T00:00:00.000Z" };
    const markup = renderToStaticMarkup(<PromotionCampaignOfferCard offer={productOffer} campaign={upcoming} mode="detail" />);

    expect(markup).toContain("disabled");
    expect(markup).toContain("ui.promotionCampaigns.availableAtStart");
    expect(markup).not.toContain('href="/customer/activity/product-a?outletId=outlet-a"');
  });

  it("renders vendor-hosted voucher artwork without requiring a global image host allowlist", () => {
    const markup = renderToStaticMarkup(<PromotionCampaignOfferCard offer={remoteVoucherOffer} campaign={campaign} mode="detail" />);

    expect(markup).toContain('src="https://thumb.wikimedia.org/vendor-logo.jpg"');
  });
});
