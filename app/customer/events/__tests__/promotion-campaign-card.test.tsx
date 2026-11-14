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
  it("shows the photo-left card with no ticket stub, and every joining stall in a strip under it", () => {
    const markup = renderToStaticMarkup(createElement(PromotionCampaignCard, { campaign }));

    expect(markup).toContain(campaign.summary);
    expect(markup).not.toContain('data-slot="featured-end"');
    expect(markup).not.toContain("ui.promotionCampaigns.endsAt");
    expect(markup).toContain('src="https://example.test/event-poster.jpg"');
    const contentAt = markup.indexOf('data-slot="promotion-campaign-content"');
    const stripAt = markup.indexOf('data-slot="campaign-stall-strip"');
    expect(stripAt).toBeGreaterThan(contentAt);
    const content = markup.slice(contentAt, stripAt);
    expect(content).toContain("ui.promotionCampaigns.exploreCampaign");
    expect(content).toContain('href="/customer/events/heritage-walk"');
    expect(content).toMatch(/<h2 [^>]*text-primary/);
    expect(content).toMatch(/lucide-map(?!-)/);
    const strip = markup.slice(stripAt);
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

    expect(markup).toContain("ui.promotionCampaigns.exploreCampaign");
    expect(markup).not.toContain('data-slot="campaign-stall-strip"');
  });

  it("keeps map results compact while linking to the same event detail", () => {
    const markup = renderToStaticMarkup(createElement(PromotionCampaignCard, { campaign, variant: "compact" }));

    expect(markup).toContain('data-slot="campaign-card-compact"');
    expect(markup).toContain("aspect-[4/3]");
    expect(markup).toContain("rounded-2xl border border-border bg-card");
    expect(markup).toContain("motion-reduce:transition-none");
    expect(markup).not.toContain("repeating-linear-gradient");
    expect(markup).not.toContain("border-dashed");
    expect(markup).toContain("Heritage Walk KL");
    expect(markup).toContain('data-slot="campaign-poster"');
    expect(markup).toContain('src="https://example.test/event-poster.jpg"');
    expect(markup).toContain("object-contain");
    expect(markup).toContain("ui.promotionCampaigns.endsAt");
    expect(markup).toContain("ui.promotionCampaigns.viewAllVendors");
    expect(markup).not.toContain("ui.promotionCampaigns.vendorCount");
    expect(markup.indexOf("Heritage Walk KL")).toBeLessThan(markup.indexOf("ui.promotionCampaigns.endsAt"));
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
