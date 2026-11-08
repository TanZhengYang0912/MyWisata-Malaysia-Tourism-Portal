import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PromotionCampaignPublicVendor } from "@/lib/promotion-campaigns/types";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import { PromotionCampaignVendorCard } from "@/components/customer/promotion-campaign-vendor-card";

const vendor: PromotionCampaignPublicVendor = {
  vendorId: "vendor-1",
  vendorName: "Abdul Antiques",
  vendorLogoUrl: null,
  vendorKind: "shop",
  stalls: [{
    registrationId: "registration-1",
    locationId: "location-1",
    stallNumber: "A31",
    stallDescription: "Antique pieces and collectibles.",
    stallPosterUrl: "https://example.test/antiques.jpg",
    products: [{ id: "product-1", name: "Antique plate", kind: "product", price: 25, imageUrl: null }],
  }],
};

describe("PromotionCampaignVendorCard", () => {
  it("renders a concise featured detail card with its stall destination", () => {
    const markup = renderToStaticMarkup(
      <PromotionCampaignVendorCard
        vendor={vendor}
        campaignSlug="antique-event"
        layout="featured"
      />,
    );

    expect(markup).toContain("sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]");
    expect(markup).toContain("sm:min-h-60");
    expect(markup).toContain("Abdul Antiques");
    expect(markup).toContain("ui.promotionCampaigns.stallNumber");
    expect(markup).not.toContain("Antique pieces and collectibles.");
    expect(markup).not.toContain("ui.promotionCampaigns.productCount");
    expect(markup).toContain('href="/customer/events/antique-event/vendor-1"');
  });

  it("keeps the default grid card vertical", () => {
    const markup = renderToStaticMarkup(
      <PromotionCampaignVendorCard vendor={vendor} campaignSlug="antique-event" />,
    );

    expect(markup).toContain('class="flex min-w-0 flex-col overflow-hidden rounded-2xl');
    expect(markup).not.toContain("sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]");
    expect(markup).toContain("ui.promotionCampaigns.productCount");
  });

  it("identifies the stall number that matched a directory search", () => {
    const SearchResultCard = PromotionCampaignVendorCard as unknown as ComponentType<Record<string, unknown>>;
    const markup = renderToStaticMarkup(createElement(SearchResultCard, {
      vendor: { ...vendor, stalls: [...vendor.stalls, { ...vendor.stalls[0], registrationId: "registration-2", stallNumber: "Z99" }] },
      campaignSlug: "antique-event",
      matchingStallNumbers: ["Z99"],
    }));

    expect(markup).toContain("ui.promotionCampaigns.matchingStalls");
    expect(markup).toContain("Z99");
  });
});
