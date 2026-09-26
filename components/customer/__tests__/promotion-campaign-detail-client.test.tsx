import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: "en" } }),
}));

vi.mock("@/components/customer/promotion-campaign-offer-card", () => ({
  PromotionCampaignOfferCard: () => <article data-testid="campaign-offer-card">Offer card</article>,
}));

import { PromotionCampaignDetailClient } from "@/app/customer/events/[slug]/promotion-campaign-detail-client";

const campaign: PromotionCampaignPublic = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "heritage-walk-kl-current-offers",
  title: "Heritage Walk KL — Local Explorer Picks",
  summary: "Duplicate summary that should not be repeated on the detail page.",
  description: "Full campaign terms including voucher eligibility and unchanged prices.",
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

describe("PromotionCampaignDetailClient", () => {
  it("reduces repeated campaign copy while keeping the full description and offer cards available", () => {
    const markup = renderToStaticMarkup(
      <PromotionCampaignDetailClient slug={campaign.slug} initialCampaign={campaign} initialError={null} />,
    );

    expect(markup).toContain(campaign.title);
    expect(markup).not.toContain(campaign.summary);
    expect(markup).toContain("<details");
    expect(markup).toContain("ui.promotionCampaigns.campaignDetails");
    expect(markup).toContain(campaign.description);
    expect(markup).toContain('data-testid="campaign-offer-card"');

    const details = markup.match(/<details([^>]*)>([\s\S]*?)<\/details>/);
    expect(details).not.toBeNull();
    expect(details?.[1]).not.toContain("open");
    expect(details?.[2]).toContain(campaign.description);
  });
});
