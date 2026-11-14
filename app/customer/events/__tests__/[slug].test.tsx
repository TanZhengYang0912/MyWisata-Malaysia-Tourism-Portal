import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PromotionCampaignPublic, PromotionCampaignPublicVendor } from "@/lib/promotion-campaigns/types";

const mocks = vi.hoisted(() => ({ getPublicPromotionCampaigns: vi.fn(), notFound: vi.fn() }));

vi.mock("react-i18next", () => ({ useTranslation: () => ({
  t: (key: string, values?: Record<string, unknown>) => values?.date ? `${key} ${String(values.date)}` : key,
  i18n: { resolvedLanguage: "en" },
}) }));
vi.mock("@/lib/i18n/server", () => ({ getServerTranslation: vi.fn(async () => ({ t: (key: string) => key })) }));
vi.mock("@/components/customer/use-customer-capability-gate", () => ({
  useCustomerCapabilityGate: () => Object.assign(() => true, { handleResponse: vi.fn(async () => false) }),
}));
vi.mock("@/lib/promotion-campaigns/public", () => ({ getPublicPromotionCampaigns: mocks.getPublicPromotionCampaigns }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import CustomerEventDetailPage from "@/app/customer/events/[slug]/page";

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
  endsAt: "2026-10-25T12:00:00.000Z",
  visibility: "live",
  locations: [{
    id: "33333333-3333-4333-8333-333333333333", name: "Petaling Street", address: "Jalan Petaling, Kuala Lumpur",
    lat: 3.1439, lng: 101.6977, startsOn: "2026-09-25", endsOn: "2026-10-25", opensAt: "10:00", closesAt: "18:00",
  }],
  vendors: [vendor],
};

describe("customer promotion campaign detail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicPromotionCampaigns.mockResolvedValue({ campaigns: [campaign], error: false });
  });

  it("renders campaign and a link to the participating vendor's stall in the initial server response", async () => {
    const page = await CustomerEventDetailPage({ params: Promise.resolve({ slug: campaign.slug }) });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain(campaign.title);
    expect(markup).toContain("Heritage Walk KL");
    expect(markup).toContain(`href="/customer/events/${campaign.slug}/${vendor.vendorId}"`);
    expect(markup).not.toContain("ui.promotionCampaigns.loading");
    expect(mocks.getPublicPromotionCampaigns).toHaveBeenCalledWith(campaign.slug);
    expect(markup).toContain("8:00 PM");
  });

  it("shows only dates for an event that covers full Malaysia calendar days", async () => {
    mocks.getPublicPromotionCampaigns.mockResolvedValueOnce({ campaigns: [{
      ...campaign,
      startsAt: "2026-09-30T16:00:00.000Z",
      endsAt: "2026-10-08T15:59:59.999Z",
    }], error: false });

    const markup = renderToStaticMarkup(await CustomerEventDetailPage({ params: Promise.resolve({ slug: campaign.slug }) }));
    expect(markup).toContain("Oct 1, 2026");
    expect(markup).toContain("Oct 8, 2026");
    expect(markup).not.toContain("11:59 PM");
  });

  it("shows a not-found state for a valid but unpublished campaign slug", async () => {
    mocks.getPublicPromotionCampaigns.mockResolvedValueOnce({ campaigns: [], error: false });

    const page = await CustomerEventDetailPage({ params: Promise.resolve({ slug: "missing-campaign" }) });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("ui.promotionCampaigns.notFound");
    expect(markup).not.toContain("ui.promotionCampaigns.loading");
  });
});
