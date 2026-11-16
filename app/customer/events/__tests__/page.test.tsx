import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PromotionCampaignPublic, PromotionCampaignPublicVendor } from "@/lib/promotion-campaigns/types";

const mocks = vi.hoisted(() => ({ getPublicPromotionCampaigns: vi.fn() }));

vi.mock("react-i18next", () => ({ useTranslation: () => ({
  t: (key: string, options?: { date?: string; count?: number }) => options?.date ? `${key} ${options.date} ${options.count ?? ""}`.trim() : options?.count !== undefined ? `${key}:${options.count}` : key,
  i18n: { resolvedLanguage: "en" },
}) }));
vi.mock("@/lib/i18n/server", () => ({ getServerTranslation: vi.fn(async () => ({ t: (key: string) => key })) }));
vi.mock("@/components/customer/use-customer-capability-gate", () => ({
  useCustomerCapabilityGate: () => Object.assign(() => true, { handleResponse: vi.fn(async () => false) }),
}));
vi.mock("@/lib/promotion-campaigns/public", () => ({ getPublicPromotionCampaigns: mocks.getPublicPromotionCampaigns }));

import CustomerEventsPage from "@/app/customer/events/page";

const vendor: PromotionCampaignPublicVendor = {
  vendorId: "4f774340-2bce-de7d-dc27-8208f1286b59",
  vendorName: "Heritage Walk KL",
  vendorLogoUrl: null,
  vendorKind: "shop",
  stalls: [{
    registrationId: "22222222-2222-4222-8222-222222222222",
    locationId: "33333333-3333-4333-8333-333333333333",
    stallNumber: "A1",
    stallDescription: "A real outlet stall.",
    stallPosterUrl: "https://x/stall.jpg",
    products: [{ id: "a2880dc7-4c89-b498-131e-964430c836a9", name: "Jalan Alor Heritage & Food Walk", kind: "product", price: 105.6, imageUrl: null }],
  }],
};

const campaign: PromotionCampaignPublic = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "heritage-walk-kl-current-offers",
  title: "Heritage Walk KL — Local Explorer Picks",
  summary: "Explore real Heritage Walk KL offers.",
  description: "Current products and voucher from Heritage Walk KL.",
  posterUrl: null,
  operatingHours: "10:00 AM - 6:00 PM",
  startsAt: "2026-09-25T12:00:00.000Z",
  endsAt: "2026-12-25T12:00:00.000Z",
  visibility: "live",
  locations: [{
    id: "33333333-3333-4333-8333-333333333333", name: "Petaling Street", address: "Jalan Petaling, Kuala Lumpur",
    lat: 3.1439, lng: 101.6977, startsOn: "2026-11-12", endsOn: "2026-11-15", opensAt: "10:00", closesAt: "18:00",
  }],
  vendors: [vendor],
};

const laterCampaign: PromotionCampaignPublic = {
  ...campaign,
  id: "44444444-4444-4444-8444-444444444444",
  slug: "december-bazaar",
  title: "December Bazaar",
  locations: [{ ...campaign.locations[0], id: "55555555-5555-4555-8555-555555555555", startsOn: "2026-12-01", endsOn: "2026-12-03" }],
};

const endedCampaign: PromotionCampaignPublic = {
  ...campaign,
  id: "66666666-6666-4666-8666-666666666666",
  slug: "october-fair",
  title: "October Fair",
  locations: [{ ...campaign.locations[0], id: "77777777-7777-4777-8777-777777777777", startsOn: "2026-10-01", endsOn: "2026-11-10" }],
};

const render = async (date?: string) => renderToStaticMarkup(await CustomerEventsPage({ searchParams: Promise.resolve(date === undefined ? {} : { date }) }));
const titlesIn = (markup: string) => [...markup.matchAll(/<a [^>]*href="\/customer\/events\/([^"]+)"/g)].map((match) => match[1]);

describe("customer promotion campaign listing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 14:30 on Friday 13 November 2026 in Malaysia.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T06:30:00Z"));
    mocks.getPublicPromotionCampaigns.mockResolvedValue({ campaigns: [laterCampaign, endedCampaign, campaign], error: false });
  });
  afterEach(() => vi.useRealTimers());

  it("titles the page with the standard header, a calendar button and no date heading or List/Map switch", async () => {
    const markup = await render();

    expect(markup).toMatch(/<h1 [^>]*>ui\.promotionCampaigns\.pageTitle<\/h1>/);
    expect(markup.match(/<h1 /g)).toHaveLength(1);
    expect(markup).toContain('aria-label="ui.promotionCampaigns.datePicker.openCalendar"');
    expect(markup).not.toContain("ui.promotionCampaigns.datePicker.previousDay");
    expect(markup).not.toContain("ui.promotionCampaigns.views.");
    expect(mocks.getPublicPromotionCampaigns).toHaveBeenCalledOnce();
  });

  it("lists every event that has not ended, earliest start first, as place cards", async () => {
    const markup = await render();

    expect(markup).toMatch(/<h2 id="events-list-heading"[^>]*>ui\.promotionCampaigns\.allEvents<\/h2>/);
    expect(markup).toContain("ui.promotionCampaigns.map.eventCount:2");
    expect(titlesIn(markup)).toEqual([campaign.slug, laterCampaign.slug]);
    expect(markup).not.toContain(endedCampaign.title);
    expect(markup).toContain("grid grid-cols-1 items-start gap-6 lg:grid-cols-2");
    expect(markup).not.toContain("ui.promotionCampaigns.dateEmpty");
  });

  it("shows 8 events a page with the pager", async () => {
    const many = Array.from({ length: 9 }, (_, index) => ({ ...laterCampaign, id: `later-${index}`, slug: `later-${index}`, title: `Later ${index}` }));
    mocks.getPublicPromotionCampaigns.mockResolvedValueOnce({ campaigns: many, error: false });

    const markup = await render();

    expect(markup.match(/data-card-frame="place"/g)).toHaveLength(8);
    expect(markup).toContain('aria-label="ui.promotionCampaigns.pageTitle"');
    expect(markup).not.toContain("later-8");
  });

  it("has no pager for 8 or fewer events", async () => {
    expect(await render()).not.toContain('aria-label="ui.promotionCampaigns.pageTitle"');
  });

  it("opens a shared ?date= link on that day: its events only, with ‹ day ›", async () => {
    const markup = await render("2026-12-02");

    expect(titlesIn(markup)).toEqual([laterCampaign.slug]);
    expect(markup).toMatch(/<h2 id="events-list-heading"[^>]*>Wednesday 2 Dec<\/h2>/);
    expect(markup).toContain("ui.promotionCampaigns.datePicker.dayEvents Wednesday, December 2 1");
    expect(markup).toContain('aria-label="ui.promotionCampaigns.datePicker.previousDay"');
    expect(markup).toContain('aria-label="ui.promotionCampaigns.datePicker.nextDay"');
  });

  it("says when nothing runs on the chosen day", async () => {
    const markup = await render("2026-11-20");

    expect(markup).toContain("ui.promotionCampaigns.dateEmpty");
    expect(markup).not.toContain("ui.promotionCampaigns.datePicker.backToToday");
  });

  it("falls back to all events for an invalid or past ?date=", async () => {
    for (const date of ["2026-02-30", "tomorrow", "2026-11-01"]) {
      const markup = await render(date);
      expect(markup, date).toContain("ui.promotionCampaigns.allEvents");
      expect(markup, date).not.toContain("ui.promotionCampaigns.datePicker.previousDay");
    }
  });

  it("keeps the page title when there are no events at all", async () => {
    mocks.getPublicPromotionCampaigns.mockResolvedValueOnce({ campaigns: [endedCampaign], error: false });

    const markup = await render();

    expect(markup).toContain("ui.promotionCampaigns.pageTitle");
    expect(markup).toContain("ui.promotionCampaigns.emptyTitle");
    expect(markup).not.toContain("ui.promotionCampaigns.datePicker.openCalendar");
  });

  it("shows a recoverable error when the server projection is unavailable", async () => {
    mocks.getPublicPromotionCampaigns.mockResolvedValueOnce({ campaigns: [], error: true });

    const markup = await render();

    expect(markup).toContain("ui.promotionCampaigns.pageTitle");
    expect(markup).toContain("ui.promotionCampaigns.loadError");
    expect(markup).not.toContain("ui.promotionCampaigns.loading");
  });
});
