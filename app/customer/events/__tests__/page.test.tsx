import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

const mocks = vi.hoisted(() => ({ getPublicPromotionCampaigns: vi.fn() }));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: "en" } }) }));
vi.mock("@/lib/i18n/server", () => ({ getServerTranslation: vi.fn(async () => ({ t: (key: string) => key })) }));
vi.mock("@/components/customer/use-customer-capability-gate", () => ({
  useCustomerCapabilityGate: () => Object.assign(() => true, { handleResponse: vi.fn(async () => false) }),
}));
vi.mock("@/lib/promotion-campaigns/public", () => ({ getPublicPromotionCampaigns: mocks.getPublicPromotionCampaigns }));

import CustomerEventsPage from "@/app/customer/events/page";

const campaign: PromotionCampaignPublic = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "heritage-walk-kl-current-offers",
  title: "Heritage Walk KL — Local Explorer Picks",
  summary: "Explore real Heritage Walk KL offers.",
  description: "Current products and voucher from Heritage Walk KL.",
  startsAt: "2026-09-25T12:00:00.000Z",
  endsAt: "2026-10-25T12:00:00.000Z",
  visibility: "live",
  offers: [{
    kind: "product",
    id: "22222222-2222-4222-8222-222222222222",
    position: 0,
    vendor: { id: "4f774340-2bce-de7d-dc27-8208f1286b59", name: "Heritage Walk KL", logoUrl: null },
    outlet: { id: "3d30edce-2a66-d3c8-1835-5bcdc7f54f8a", name: "Heritage Walk KL", city: "George Town", state: "Penang", imageUrl: null },
    product: { id: "a2880dc7-4c89-b498-131e-964430c836a9", name: "Jalan Alor Heritage & Food Walk", description: "A real outlet offer.", price: 105.6, imageUrl: null },
  }],
};

describe("customer promotion campaign listing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicPromotionCampaigns.mockResolvedValue({ campaigns: [campaign], error: false });
  });

  it("renders live Supabase campaign data in the initial server response", async () => {
    const markup = renderToStaticMarkup(await CustomerEventsPage());

    expect(markup).toContain("ui.promotionCampaigns.pageTitle");
    expect(markup).toContain(campaign.title);
    expect(markup).toContain("Jalan Alor Heritage &amp; Food Walk");
    expect(markup).toContain("Heritage Walk KL");
    expect(markup).not.toContain("ui.promotionCampaigns.loading");
    expect(markup).toContain('href="/customer/events/heritage-walk-kl-current-offers"');
    expect(mocks.getPublicPromotionCampaigns).toHaveBeenCalledOnce();
  });

  it("shows campaign timing and a single count-aware action for a three-card preview", async () => {
    const product = campaign.offers[0];
    if (product.kind !== "product") throw new Error("fixture should be a product offer");
    const campaignWithSixOffers: PromotionCampaignPublic = {
      ...campaign,
      offers: Array.from({ length: 6 }, (_, position) => ({
        ...product,
        id: `offer-${position}`,
        position,
        product: { ...product.product, id: `product-${position}`, name: `Product ${position}` },
      })),
    };
    mocks.getPublicPromotionCampaigns.mockResolvedValueOnce({ campaigns: [campaignWithSixOffers], error: false });

    const markup = renderToStaticMarkup(await CustomerEventsPage());

    expect(markup).toContain("ui.promotionCampaigns.endsAt");
    expect(markup).toContain("ui.promotionCampaigns.offerCount");
    expect(markup).toContain("ui.promotionCampaigns.viewAllOffers");
    expect(markup).toContain("ui.promotionCampaigns.previewOfferCount");
    expect(markup).toContain("xl:grid-cols-3");
    expect(markup.match(/href="\/customer\/events\/heritage-walk-kl-current-offers"/g)).toHaveLength(1);
  });

  it("labels the start date for an upcoming campaign", async () => {
    mocks.getPublicPromotionCampaigns.mockResolvedValueOnce({
      campaigns: [{ ...campaign, visibility: "upcoming" }],
      error: false,
    });

    const markup = renderToStaticMarkup(await CustomerEventsPage());

    expect(markup).toContain("ui.promotionCampaigns.startsAt");
    expect(markup).not.toContain("ui.promotionCampaigns.endsAt");
  });

  it("shows a recoverable error when the server projection is unavailable", async () => {
    mocks.getPublicPromotionCampaigns.mockResolvedValueOnce({ campaigns: [], error: true });

    const markup = renderToStaticMarkup(await CustomerEventsPage());

    expect(markup).toContain("ui.promotionCampaigns.loadError");
    expect(markup).not.toContain("ui.promotionCampaigns.loading");
  });
});
