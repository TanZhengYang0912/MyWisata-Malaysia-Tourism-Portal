import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PromotionCampaignPublic, PromotionCampaignPublicVendor } from "@/lib/promotion-campaigns/types";

const mocks = vi.hoisted(() => ({ getPublicPromotionCampaigns: vi.fn() }));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string, options?: { date?: string }) => options?.date ? `${key} ${options.date}` : key, i18n: { resolvedLanguage: "en" } }) }));
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

describe("customer promotion campaign listing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 14:30 on Friday 13 November 2026 in Malaysia.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T06:30:00Z"));
    mocks.getPublicPromotionCampaigns.mockResolvedValue({ campaigns: [campaign, laterCampaign], error: false });
  });
  afterEach(() => vi.useRealTimers());

  it("opens on today: the date as the heading and five days with today in the middle", async () => {
    const markup = renderToStaticMarkup(await CustomerEventsPage());

    expect(markup).toMatch(/<h1 [^>]*>Friday 13 Nov<\/h1>/);
    expect(markup).not.toContain("ui.promotionCampaigns.pageTitle");
    const strip = [...markup.matchAll(/aria-pressed="(true|false)" aria-label="[A-Za-z]+, November \d+"/g)].map((match) => match[1]);
    expect(strip).toEqual(["false", "false", "true", "false", "false"]);
    expect(mocks.getPublicPromotionCampaigns).toHaveBeenCalledOnce();
  });

  it("offers only List and Map, and shows the List of event cards by default", async () => {
    const markup = renderToStaticMarkup(await CustomerEventsPage());
    const views = markup.match(/<div role="group" aria-label="ui\.promotionCampaigns\.views\.label"[\s\S]*?<\/div>/)?.[0] ?? "";

    expect(views).toContain("ui.promotionCampaigns.views.list");
    expect(views).toContain("ui.promotionCampaigns.views.map");
    expect(markup).not.toContain("ui.promotionCampaigns.views.calendar");
    expect(markup).not.toContain("ui.promotionCampaigns.map.stateCountsTitle");
    expect(markup).toContain('href="/customer/events/heritage-walk-kl-current-offers"');
    expect(markup).toContain("lucide-tent");
    expect(markup).toContain("Petaling Street");
  });

  it("lists only the events running on the chosen day", async () => {
    const markup = renderToStaticMarkup(await CustomerEventsPage());

    expect(markup).toContain(campaign.title);
    expect(markup).not.toContain(laterCampaign.title);
    expect(markup).not.toContain("ui.promotionCampaigns.dateEmpty");
  });

  it("says when nothing runs on the chosen day", async () => {
    mocks.getPublicPromotionCampaigns.mockResolvedValueOnce({ campaigns: [laterCampaign], error: false });

    const markup = renderToStaticMarkup(await CustomerEventsPage());

    expect(markup).toContain("ui.promotionCampaigns.dateEmpty");
    // Already on today, so there is no Back to today.
    expect(markup).not.toContain("ui.promotionCampaigns.datePicker.backToToday");
  });

  it("keeps the page title when there are no events at all", async () => {
    mocks.getPublicPromotionCampaigns.mockResolvedValueOnce({ campaigns: [], error: false });

    const markup = renderToStaticMarkup(await CustomerEventsPage());

    expect(markup).toContain("ui.promotionCampaigns.pageTitle");
    expect(markup).toContain("ui.promotionCampaigns.emptyTitle");
  });

  it("shows a recoverable error when the server projection is unavailable", async () => {
    mocks.getPublicPromotionCampaigns.mockResolvedValueOnce({ campaigns: [], error: true });

    const markup = renderToStaticMarkup(await CustomerEventsPage());

    expect(markup).toContain("ui.promotionCampaigns.pageTitle");
    expect(markup).toContain("ui.promotionCampaigns.loadError");
    expect(markup).not.toContain("ui.promotionCampaigns.loading");
  });
});
