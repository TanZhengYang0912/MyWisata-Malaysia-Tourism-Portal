import { createElement, type ComponentType } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

  it("shows the stall photo in a festival lineup card and preserves its destination", () => {
    const markup = renderToStaticMarkup(
      <PromotionCampaignVendorCard vendor={vendor} campaignSlug="antique-event" />,
    );
    const vendorTitle = markup.match(/<h3 class="([^"]*)">Abdul Antiques<\/h3>/);

    expect(markup).toMatch(/<article class="[^"]*vendorCard[^"]*"/);
    expect(markup).toMatch(/class="[^"]*photoFrame[^"]*"/);
    expect(markup).not.toContain("pushpin");
    expect(markup).toContain('src="https://example.test/antiques.jpg"');
    expect(vendorTitle?.[1]).toContain("font-[family-name:var(--font-display)]");
    expect(markup).toContain('href="/customer/events/antique-event/vendor-1"');
  });

  it("limits card motion to fine pointers and honors reduced motion", () => {
    const css = readFileSync(resolve(process.cwd(), "components/customer/promotion-campaign-vendor-card.module.css"), "utf8");

    expect(css).toContain("@media (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toMatch(/\.vendorCard\s*\{[^}]*transition:/);
    expect(css).toContain("prefers-reduced-motion: no-preference");
    expect(css).not.toContain("pushpin");
  });

  it("keeps the default grid card vertical", () => {
    const markup = renderToStaticMarkup(
      <PromotionCampaignVendorCard vendor={vendor} campaignSlug="antique-event" />,
    );

    expect(markup).toMatch(/<article class="[^"]*vendorCard[^"]*flex min-w-0 flex-col/);
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
