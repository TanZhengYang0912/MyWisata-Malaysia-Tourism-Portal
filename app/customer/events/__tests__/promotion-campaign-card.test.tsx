import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PromotionCampaignPublic, PromotionCampaignPublicVendor } from "@/lib/promotion-campaigns/types";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: "en" } }) }));

import { PromotionCampaignCard } from "../promotion-campaign-card";

const vendor: PromotionCampaignPublicVendor = {
  vendorId: "vendor-0",
  vendorName: "Heritage Walk KL",
  vendorLogoUrl: null,
  vendorKind: "shop",
  stalls: [{
    registrationId: "registration-0",
    locationId: "location-0",
    stallNumber: "A1",
    stallDescription: "A real event stall.",
    stallPosterUrl: "https://example.test/stall.jpg",
    products: [{ id: "product-0", name: "Heritage Walk", kind: "service", price: 105, imageUrl: null }],
  }],
};

const campaign: PromotionCampaignPublic = {
  id: "campaign-0",
  slug: "heritage-walk",
  title: "Heritage Walk KL",
  summary: "A local event summary.",
  description: "Campaign details.",
  posterUrl: "https://example.test/event-poster.jpg",
  operatingHours: null,
  startsAt: "2026-09-25T12:00:00.000Z",
  endsAt: "2026-10-25T12:00:00.000Z",
  visibility: "live",
  locations: [],
  vendors: Array.from({ length: 6 }, (_, index) => ({
    ...vendor,
    registrationId: `registration-${index}`,
    vendorId: `vendor-${index}`,
    vendorName: `Vendor ${index}`,
  })),
};

describe("promotion campaign card variants", () => {
  it("shows the event pass with every joining stall in a strip under it", () => {
    const markup = renderToStaticMarkup(createElement(PromotionCampaignCard, { campaign }));

    expect(markup).toContain("ui.promotionCampaigns.endsAt");
    expect(markup).toContain(campaign.summary);
    expect(markup).toContain('data-slot="featured-end"');
    expect(markup).toContain('src="https://example.test/event-poster.jpg"');
    const strip = markup.slice(markup.indexOf('data-slot="campaign-stall-strip"'));
    expect(markup.indexOf('data-slot="campaign-stall-strip"')).toBeGreaterThan(markup.indexOf('data-slot="featured-end"'));
    expect(strip).toContain("ui.promotionCampaigns.stallsJoining");
    for (let index = 0; index < 6; index += 1) {
      expect(strip).toContain(`Vendor ${index}`);
      expect(strip).toContain(`href="/customer/events/heritage-walk/vendor-${index}"`);
    }
    expect(strip).toContain("ui.promotionCampaigns.stallNumber");
    expect(strip).toContain('href="/customer/events/heritage-walk"');
    expect(strip).toContain("ui.promotionCampaigns.viewAllStalls");
  });

  it("leaves out the stall strip when no vendor has joined", () => {
    const markup = renderToStaticMarkup(createElement(PromotionCampaignCard, { campaign: { ...campaign, vendors: [] } }));

    expect(markup).toContain('data-slot="featured-end"');
    expect(markup).not.toContain('data-slot="campaign-stall-strip"');
  });

  it("keeps map results compact while linking to the same event detail", () => {
    const markup = renderToStaticMarkup(createElement(PromotionCampaignCard, { campaign, variant: "compact" }));

    expect(markup).toContain("Heritage Walk KL");
    expect(markup).toContain('data-slot="campaign-poster"');
    expect(markup).toContain('src="https://example.test/event-poster.jpg"');
    expect(markup).toContain("object-contain");
    expect(markup).toContain("grid-cols-1 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]");
    expect(markup).toContain("ui.promotionCampaigns.endsAt");
    expect(markup).not.toContain(campaign.summary);
    expect(markup).not.toContain("Vendor 0");
    expect(markup.match(/href="\/customer\/events\/heritage-walk"/g)).toHaveLength(1);
  });

  it("uses the event pass fallback in the list card when the poster is missing", () => {
    const withoutPoster = renderToStaticMarkup(createElement(PromotionCampaignCard, {
      campaign: { ...campaign, posterUrl: null },
    }));

    expect(withoutPoster).toContain('data-slot="promotion-campaign-image"');
    expect(withoutPoster).toContain("lucide-calendar-days");
    expect(withoutPoster).not.toContain('src="https://example.test/event-poster.jpg"');
  });

  it("keeps the compact card structure when a campaign has no poster", () => {
    const markup = renderToStaticMarkup(createElement(PromotionCampaignCard, {
      campaign: { ...campaign, posterUrl: null },
      variant: "compact",
    }));

    expect(markup).toContain('data-slot="campaign-poster"');
    expect(markup).toContain("lucide-calendar-days");
    expect(markup).toContain("Heritage Walk KL");
  });
});
