import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: "en" } }) }));

import { PromotionCampaignSpotlight } from "@/components/customer/promotion-campaign-spotlight";

const campaign: PromotionCampaignPublic = {
  id: "campaign", slug: "sample-event", title: "Sample event",
  summary: "A real campaign summary.", description: "Campaign details",
  startsAt: "2026-09-25T12:00:00.000Z", endsAt: "2026-09-26T12:00:00.000Z",
  visibility: "upcoming", offers: [],
};

function getPanelActions(markup: string, labels: string[]) {
  const actionArea = markup.match(/<div(?=[^>]*data-slot="promotion-campaign-actions")[^>]*>([\s\S]*?)<\/div>/);
  expect(actionArea, "campaign actions should have a dedicated region in the content panel").not.toBeNull();
  expect(actionArea?.[0]).toContain("justify-start");
  expect(actionArea?.[0]).toContain("flex-wrap");
  for (const label of labels) expect(actionArea?.[1]).toContain(label);
  return actionArea?.[0] ?? "";
}

describe("promotion campaign home spotlight", () => {
  it("links the upcoming teaser to its campaign details", () => {
    const markup = renderToStaticMarkup(<PromotionCampaignSpotlight campaign={campaign} />);
    expect(markup).toContain("Sample event");
    expect(markup).toContain("ui.promotionCampaigns.upcoming");
    expect(markup).toContain('href="/customer/events/sample-event"');
    const imageIndex = markup.indexOf('data-slot="promotion-campaign-image"');
    const contentIndex = markup.indexOf('data-slot="promotion-campaign-content"');
    const actionsIndex = markup.indexOf('data-slot="promotion-campaign-actions"');
    expect(imageIndex).toBeGreaterThanOrEqual(0);
    expect(contentIndex).toBeGreaterThan(imageIndex);
    expect(actionsIndex).toBeGreaterThan(contentIndex);
    expect(markup).toContain("bg-card");
    expect(markup).toContain("border-highlight-yellow");
    expect(markup).toContain("aspect-[16/9]");
    expect(markup).toContain("lg:aspect-auto");
    expect(markup).toContain("lg:border-l-4");
    expect(markup).toContain("border-t-4");
    expect(markup).not.toContain("opacity-70");
    expect(markup).not.toContain("bg-gradient-to-r");
    expect(getPanelActions(markup, ["ui.promotionCampaigns.exploreCampaign", "ui.promotionCampaigns.allCampaigns"])).toContain("bg-highlight-yellow");
  });

  it("distinguishes an unavailable projection from a genuine empty campaign list", () => {
    const unavailable = renderToStaticMarkup(<PromotionCampaignSpotlight campaign={null} unavailable />);
    const empty = renderToStaticMarkup(<PromotionCampaignSpotlight campaign={null} />);
    expect(unavailable).toContain("ui.promotionCampaigns.unavailableTitle");
    expect(unavailable).toContain("ui.actions.retry");
    expect(empty).toContain("ui.promotionCampaigns.emptyTitle");
    expect(empty).not.toContain("ui.promotionCampaigns.unavailableTitle");
    expect(getPanelActions(unavailable, ["ui.promotionCampaigns.allCampaigns"])).toContain("bg-highlight-yellow");
    expect(getPanelActions(empty, ["ui.promotionCampaigns.allCampaigns"])).toContain("bg-highlight-yellow");
  });

  it("renders a remote vendor image without requiring a global image host allowlist", () => {
    const voucherCampaign: PromotionCampaignPublic = {
      ...campaign,
      offers: [{
        kind: "voucher", id: "voucher-offer", position: 0,
        vendor: { id: "vendor", name: "Vendor", logoUrl: "https://thumb.wikimedia.org/vendor-logo.jpg" },
        outlet: null, eligibleOutlets: [],
        voucher: { id: "voucher", name: "Voucher", voucherType: "percent", discountValue: 10, minSpend: 0, validFrom: null, validUntil: null, maxUses: 10, usesCount: 0, redemptionMode: "online" },
        eligibleProducts: [],
      }],
    };

    const markup = renderToStaticMarkup(<PromotionCampaignSpotlight campaign={voucherCampaign} />);

    expect(markup).toContain('src="https://thumb.wikimedia.org/vendor-logo.jpg"');
    expect(markup.indexOf('src="https://thumb.wikimedia.org/vendor-logo.jpg"')).toBeLessThan(markup.indexOf('data-slot="promotion-campaign-content"'));
  });
});
