import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

const mocks = vi.hoisted(() => ({ getPublicPromotionCampaigns: vi.fn(), notFound: vi.fn(), reserveProps: null as Record<string, unknown> | null }));

vi.mock("@/lib/i18n/server", () => ({ getServerTranslation: vi.fn(async () => ({ t: (key: string) => key, locale: "en" })) }));
vi.mock("@/lib/promotion-campaigns/public", () => ({ getPublicPromotionCampaigns: mocks.getPublicPromotionCampaigns }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));
vi.mock("@/components/customer/event-reserve-dialog", async () => {
  const { createElement } = await import("react");
  return { EventReserveButton: (props: Record<string, unknown>) => {
    mocks.reserveProps = props;
    return createElement("button", null, "Reserve");
  } };
});

import EventVendorStallPage from "@/app/customer/events/[slug]/[vendorId]/page";

const campaign: PromotionCampaignPublic = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "penang-food-week",
  title: "Penang Food Week",
  summary: "Local food experiences.",
  description: "Discover local food.",
  posterUrl: null,
  operatingHours: null,
  startsAt: "2026-10-09T00:00:00.000Z",
  endsAt: "2026-10-12T00:00:00.000Z",
  visibility: "live",
  locations: [{
    id: "33333333-3333-4333-8333-333333333333",
    name: "Central Market Annex",
    address: "Stall B02, Kuala Lumpur",
    lat: null,
    lng: null,
    startsOn: "2026-10-10",
    endsOn: "2026-10-12",
    opensAt: "10:00",
    closesAt: "22:00",
  }],
  vendors: [{
    vendorId: "4f774340-2bce-de7d-dc27-8208f1286b59",
    vendorName: "Baboon House",
    vendorLogoUrl: null,
    vendorKind: "shop",
    stalls: [{
      registrationId: "22222222-2222-4222-8222-222222222222",
      locationId: "33333333-3333-4333-8333-333333333333",
      stallNumber: "B02",
      stallDescription: "Local favourites, made fresh.",
      stallPosterUrl: "https://example.com/stall.jpg",
      products: [{
        id: "a2880dc7-4c89-b498-131e-964430c836a9",
        name: "Strawberry Preserve Jar",
        kind: "product",
        price: 22,
        imageUrl: "https://example.com/preserve.jpg",
      }],
    }],
  }],
};

describe("customer event vendor stall page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicPromotionCampaigns.mockResolvedValue({ campaigns: [campaign], error: false });
  });

  it("keeps product name, price, and reservation action while hiding repeated card details", async () => {
    const page = await EventVendorStallPage({
      params: Promise.resolve({ slug: campaign.slug, vendorId: campaign.vendors[0].vendorId }),
    });
    const markup = renderToStaticMarkup(page);
    const itemCard = markup.slice(markup.indexOf('<li class="mw-card'), markup.indexOf("</li>") + 5);

    expect(itemCard).toContain("Strawberry Preserve Jar");
    expect(itemCard).toContain("RM22.00");
    expect(itemCard).toContain("Reserve");
    expect(itemCard).not.toContain("ui.vendor.eventItems.kinds.product");
    expect(itemCard).not.toContain("Central Market Annex");
    expect(itemCard).not.toContain("Oct 10, 2026");
    expect(itemCard).not.toContain("10:00 AM");
    expect(markup).toContain("Central Market Annex");
    expect(markup).toContain("Stall B02, Kuala Lumpur");
    expect(mocks.reserveProps).toEqual({
      registrationId: "22222222-2222-4222-8222-222222222222",
      listingId: "a2880dc7-4c89-b498-131e-964430c836a9",
      itemName: "Strawberry Preserve Jar",
      price: 22,
      locationName: "Central Market Annex",
      startsOn: "2026-10-10",
      endsOn: "2026-10-12",
    });
  });
});
