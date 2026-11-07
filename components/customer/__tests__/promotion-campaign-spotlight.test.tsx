import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: "en" } }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { PromotionCampaignSpotlight } from "@/components/customer/promotion-campaign-spotlight";
import { FeaturedRecommendationsFrame } from "@/components/customer/featured-recommendations-frame";
import { formatEventHours } from "@/lib/promotion-campaigns/locations";

const campaign: PromotionCampaignPublic = {
  id: "campaign", slug: "sample-event", title: "Sample event",
  summary: "A real campaign summary.", description: "Campaign details",
  posterUrl: null, operatingHours: "10:00 AM - 6:00 PM",
  startsAt: "2026-09-25T12:00:00.000Z", endsAt: "2026-09-26T12:00:00.000Z",
  visibility: "upcoming", locations: [{ id: "melaka", name: "Melaka", address: null, lat: null, lng: null, startsOn: "2026-09-25", endsOn: "2026-09-26", opensAt: "10:00", closesAt: "18:00" }], vendors: [],
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
    // The letter sits under the envelope pieces, so it comes first in the DOM.
    const letterIndex = markup.indexOf('data-slot="campaign-envelope-letter"');
    const frontIndex = markup.indexOf('data-slot="campaign-envelope-front"');
    expect(letterIndex).toBeGreaterThanOrEqual(0);
    expect(frontIndex).toBeGreaterThan(letterIndex);
    // The header carries "Browse all events"; the card body has no action row.
    expect(markup).not.toContain('data-slot="promotion-campaign-actions"');
    expect(markup.indexOf("ui.promotionCampaigns.allCampaigns")).toBeLessThan(markup.indexOf('data-testid="promotion-campaign-spotlight"'));
    expect(markup).toContain("mw-envelope");
    // The letter floats out of the carousel, so the frame must not clip it.
    const carousel = markup.match(/<div(?=[^>]*data-testid="promotion-campaign-spotlight")[^>]*>/)?.[0];
    expect(carousel).toBeDefined();
    expect(carousel).not.toContain("overflow-hidden");
    expect(markup).not.toContain('data-slot="featured-end"');
    expect(markup).toContain("ui.home.campaigns");
    expect(markup).not.toContain("ui.search.featuredRecommendations");
    expect(markup).not.toContain("ui.search.featuredDescription");
    expect(markup).not.toContain("ui.labels.featured");
    expect(markup).not.toContain("ui.promotionCampaigns.homeEyebrow");
    expect(markup).toContain('data-testid="promotion-campaign-spotlight"');
    expect(markup).not.toContain("border-t-4");
    expect(markup).not.toContain("lg:border-l-4");
    expect(markup).not.toContain("opacity-70");
    expect(markup).not.toContain("bg-gradient-to-r");
    const front = markup.slice(markup.indexOf('data-slot="campaign-envelope-front"'));
    expect(front).toContain("ui.promotionCampaigns.invitedTo");
    // The front shows the range from its start: 25 Sep 2026, 20:00 in Malaysia.
    expect(front).toContain("Sep 25, 2026");
    expect(front).toContain(">2026<");
    // The status now sits in the letter, which renders before the front; the title is on the front.
    expect(markup.indexOf("ui.promotionCampaigns.upcoming")).toBeLessThan(markup.indexOf("<h2 id=\"campaign-envelope-"));
  });

  it("shows dates for a full-day event and retains the precise time for a legacy event", () => {
    const fullDay = renderToStaticMarkup(<PromotionCampaignSpotlight campaign={{
      ...campaign,
      startsAt: "2026-09-30T16:00:00.000Z",
      endsAt: "2026-10-08T15:59:59.999Z",
    }} />);
    expect(fullDay).toContain("Oct 1, 2026");
    expect(fullDay).toContain("Oct 8, 2026");
    expect(fullDay).not.toContain("11:59 PM");

    const legacy = renderToStaticMarkup(<PromotionCampaignSpotlight campaign={campaign} />);
    expect(legacy).toContain("8:00 PM");
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

  it("uses the shared Partner carousel arrows only when more than one campaign is eligible", () => {
    const second: PromotionCampaignPublic = { ...campaign, id: "campaign-2", slug: "second-event", title: "Second event" };

    const single = renderToStaticMarkup(<PromotionCampaignSpotlight campaign={campaign} campaigns={[campaign]} />);
    expect(single).not.toContain("ui.promotionCampaigns.previous");
    expect(single).not.toContain("ui.promotionCampaigns.next");

    const multiple = renderToStaticMarkup(<PromotionCampaignSpotlight campaign={campaign} campaigns={[campaign, second]} />);
    expect(multiple).toContain("ui.promotionCampaigns.previous");
    expect(multiple).toContain("ui.promotionCampaigns.next");
    expect(multiple).toContain("Sample event");
    expect(multiple).not.toContain("Second event");
    const previousControl = multiple.match(/<button(?=[^>]*aria-label="ui\.promotionCampaigns\.previous")[^>]*>/)?.[0];
    const nextControl = multiple.match(/<button(?=[^>]*aria-label="ui\.promotionCampaigns\.next")[^>]*>/)?.[0];
    expect(previousControl).toContain("absolute left-3 top-1/2");
    expect(previousControl).toContain("md:group-hover/carousel:opacity-100");
    expect(nextControl).toContain("absolute right-3 top-1/2");
    expect(nextControl).toContain("md:group-hover/carousel:opacity-100");
  });

  it("renders the event poster without requiring a global image host allowlist", () => {
    const posterCampaign: PromotionCampaignPublic = {
      ...campaign,
      posterUrl: "https://thumb.wikimedia.org/event-poster.jpg",
    };

    const markup = renderToStaticMarkup(<PromotionCampaignSpotlight campaign={posterCampaign} />);

    expect(markup).toContain('src="https://thumb.wikimedia.org/event-poster.jpg"');
    // The poster heads the letter, before the envelope front.
    expect(markup.indexOf('src="https://thumb.wikimedia.org/event-poster.jpg"')).toBeLessThan(markup.indexOf('data-slot="campaign-envelope-front"'));
  });

  it("shows a live campaign's status in the letter even between opening sessions", () => {
    const markup = renderToStaticMarkup(<PromotionCampaignSpotlight campaign={{ ...campaign, visibility: "live", operationalStatus: "between_sessions" }} />);
    const letter = markup.slice(markup.indexOf('data-slot="campaign-envelope-letter"'), markup.indexOf('data-slot="campaign-envelope-front"'));
    expect(letter).toContain("ui.promotionCampaigns.betweenSessions");
  });

  it("shows the location on the front and its hours in the letter", () => {
    const markup = renderToStaticMarkup(<PromotionCampaignSpotlight campaign={campaign} />);

    expect(markup).not.toContain("bg-gradient-to-t from-primary/95 via-primary/40 to-transparent");
    const front = markup.slice(markup.indexOf('data-slot="campaign-envelope-front"'));
    expect(front).toContain("Melaka");
    const letter = markup.slice(markup.indexOf('data-slot="campaign-envelope-letter"'), markup.indexOf('data-slot="campaign-envelope-front"'));
    expect(letter).toContain(formatEventHours("10:00", "18:00", "en"));
    // Per-location hours replace the campaign's free-text operating hours.
    expect(markup).not.toContain("10:00 AM - 6:00 PM");
    expect(markup).not.toContain("lg:grid-cols-[44%_minmax(0,1fr)_9rem]");
  });

  it("keeps clipping slides by default for the other featured carousels", () => {
    const markup = renderToStaticMarkup(
      <FeaturedRecommendationsFrame headingId="h" eyebrow={null} title="t" description={null} carouselLabel="c" previousLabel="p" nextLabel="n" carouselTestId="frame" hasMultipleSlides={false} onPrevious={() => {}} onNext={() => {}}>
        <div />
      </FeaturedRecommendationsFrame>,
    );
    expect(markup.match(/<div(?=[^>]*data-testid="frame")[^>]*>/)?.[0]).toContain("overflow-hidden");
  });
});
