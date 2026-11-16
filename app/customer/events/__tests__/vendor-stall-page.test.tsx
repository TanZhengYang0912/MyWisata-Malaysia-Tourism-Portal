import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

const mocks = vi.hoisted(() => ({
  getPublicPromotionCampaigns: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
  reserveProps: [] as Record<string, unknown>[],
}));

const translate = (key: string, options?: Record<string, unknown>) => key === "ui.promotionCampaigns.stallNumber" ? `Stall ${String(options?.number)}` : key;

vi.mock("@/lib/i18n/server", () => ({ getServerTranslation: vi.fn(async () => ({ t: translate, locale: "en" })) }));
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: translate, i18n: { resolvedLanguage: "en" } }) }));
vi.mock("@/lib/promotion-campaigns/public", () => ({ getPublicPromotionCampaigns: mocks.getPublicPromotionCampaigns }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("next/image", async () => {
  const { createElement } = await import("react");
  return { default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) };
});
vi.mock("@/components/shared/reference-price", async () => {
  const { createElement } = await import("react");
  return { ReferencePrice: ({ amountMYR }: { amountMYR: number }) => createElement("span", null, `RM${amountMYR.toFixed(2)}`) };
});
vi.mock("@/components/customer/event-reserve-dialog", () => ({
  EventReserveButton: ({ trigger, ...props }: Record<string, unknown> & { trigger: (open: () => void) => unknown }) => {
    mocks.reserveProps.push(props);
    return trigger(() => {});
  },
}));

import EventVendorStallPage from "@/app/customer/events/[slug]/[vendorId]/page";

const BANGSAR = "33333333-3333-4333-8333-333333333331";
const CENTRAL = "33333333-3333-4333-8333-333333333332";
const product = { id: "a2880dc7-4c89-b498-131e-964430c836a9", name: "Strawberry Preserve Jar", kind: "product" as const, price: 22, imageUrl: "https://example.com/preserve.jpg" };
const location = (id: string, name: string, startsOn: string, endsOn: string) => ({ id, name, address: `${name} address`, lat: null, lng: null, startsOn, endsOn, opensAt: "10:00", closesAt: "22:00" });
const stall = (registrationId: string, locationId: string, stallNumber: string) => ({
  registrationId, locationId, stallNumber, stallDescription: `${stallNumber} description`, stallPosterUrl: `https://example.com/${stallNumber}.jpg`, products: [product],
});

const campaign: PromotionCampaignPublic = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "penang-food-week",
  title: "Penang Food Week",
  summary: "Local food experiences.",
  description: "Discover local food.",
  posterUrl: null,
  operatingHours: null,
  startsAt: "2026-10-03T00:00:00.000Z",
  endsAt: "2026-12-31T00:00:00.000Z",
  visibility: "live",
  locations: [location(BANGSAR, "Bangsar Night Market", "2026-10-03", "2026-10-08"), location(CENTRAL, "Central Market Annex", "2026-10-10", "2026-12-31")],
  vendors: [{
    vendorId: "4f774340-2bce-de7d-dc27-8208f1286b59",
    vendorName: "Baboon House",
    vendorLogoUrl: null,
    vendorKind: "shop",
    stalls: [stall("reg-bangsar", BANGSAR, "A01"), stall("reg-central", CENTRAL, "B01"), stall("reg-gone", "missing-location", "Z99")],
  }],
};
const vendorId = campaign.vendors[0].vendorId;

async function renderPage(stop?: string, data: PromotionCampaignPublic = campaign) {
  mocks.getPublicPromotionCampaigns.mockResolvedValue({ campaigns: [data], error: false });
  const page = await EventVendorStallPage({
    params: Promise.resolve({ slug: data.slug, vendorId }),
    searchParams: Promise.resolve(stop === undefined ? {} : { stop }),
  });
  return renderToStaticMarkup(page);
}

describe("customer event vendor stall page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reserveProps = [];
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T12:00:00+08:00"));
  });
  afterEach(() => vi.useRealTimers());

  it("shows only the chosen stop, lists the others under Also at and reserves by tapping the product", async () => {
    const markup = await renderPage(CENTRAL);

    expect(markup).toContain("Central Market Annex address");
    expect(markup).toContain("B01 description");
    expect(markup).toContain("https://example.com/B01.jpg");
    expect(markup).not.toContain("A01 description");
    expect(markup).not.toContain("Z99");
    expect(markup).not.toContain("ui.promotionCampaigns.locationCount");

    expect(markup).toContain("ui.promotionCampaigns.alsoAt");
    expect(markup).toContain(`href="/customer/events/penang-food-week/${vendorId}?stop=${BANGSAR}"`);
    expect(markup).toContain("ui.promotionCampaigns.locationEnded");

    const card = markup.slice(markup.indexOf("data-stall-product="), markup.indexOf("</article>"));
    expect(card).toContain('data-stall-product="open"');
    expect(card).toContain("Strawberry Preserve Jar");
    expect(card).toContain("RM22.00");
    expect(card).toContain('aria-haspopup="dialog"');
    expect(markup).not.toContain("ui.reserve.open");
    expect(mocks.reserveProps).toEqual([{
      registrationId: "reg-central",
      listingId: product.id,
      itemName: "Strawberry Preserve Jar",
      price: 22,
      locationName: "Central Market Annex",
      startsOn: "2026-10-10",
      endsOn: "2026-12-31",
    }]);

    expect(markup).toContain(`href="/customer/events/penang-food-week?stop=${CENTRAL}"`);
    expect(markup).toContain(`href="/customer/vendors/${vendorId}"`);
    expect(markup).toContain("ui.actions.visitVendor");
  });

  it("shows Ended instead of the price at an ended stop, with nothing to tap", async () => {
    const markup = await renderPage(BANGSAR);

    expect(markup).toContain("A01 description");
    expect(markup).toContain('data-stall-product="ended"');
    expect(markup).toContain("ui.reserve.ended");
    expect(markup).not.toContain("RM22.00");
    expect(markup).not.toContain('aria-haspopup="dialog"');
    expect(mocks.reserveProps).toEqual([]);
  });

  it("falls back to the running stop for a missing or unknown stop", async () => {
    for (const stop of [undefined, "not-a-stop"]) {
      const markup = await renderPage(stop);
      expect(markup).toContain("B01 description");
      expect(markup).not.toContain("A01 description");
    }
  });

  it("is not found when none of the vendor's stalls has a location", async () => {
    const onlyMissing = { ...campaign, vendors: [{ ...campaign.vendors[0], stalls: [stall("reg-gone", "missing-location", "Z99")] }] };
    await expect(renderPage(undefined, onlyMissing)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("hides Also at when the vendor has a single stall", async () => {
    const single = { ...campaign, vendors: [{ ...campaign.vendors[0], stalls: [stall("reg-central", CENTRAL, "B01")] }] };
    expect(await renderPage(CENTRAL, single)).not.toContain("ui.promotionCampaigns.alsoAt");
  });
});
