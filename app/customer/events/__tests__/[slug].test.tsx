import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

const mocks = vi.hoisted(() => ({ getPublicPromotionCampaigns: vi.fn(), notFound: vi.fn() }));

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: "en" } }) }));
vi.mock("@/lib/i18n/server", () => ({ getServerTranslation: vi.fn(async () => ({ t: (key: string) => key })) }));
vi.mock("@/components/customer/use-customer-capability-gate", () => ({
  useCustomerCapabilityGate: () => Object.assign(() => true, { handleResponse: vi.fn(async () => false) }),
}));
vi.mock("@/lib/promotion-campaigns/public", () => ({ getPublicPromotionCampaigns: mocks.getPublicPromotionCampaigns }));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import CustomerEventDetailPage from "@/app/customer/events/[slug]/page";

const campaign: PromotionCampaignPublic = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "heritage-walk-kl-current-offers",
  title: "Heritage Walk KL — Local Explorer Picks",
  summary: "Explore real Heritage Walk KL offers.",
  description: "Current products and voucher from Heritage Walk KL.",
  startsAt: "2026-09-25T12:00:00.000Z",
  endsAt: "2026-10-25T12:00:00.000Z",
  visibility: "live",
  offers: [{
    kind: "product",
    id: "22222222-2222-4222-8222-222222222222",
    position: 0,
    vendor: { id: "4f774340-2bce-de7d-dc27-8208f1286b59", name: "Heritage Walk KL", logoUrl: null },
    outlet: { id: "3d30edce-2a66-d3c8-1835-5bcdc7f54f8a", name: "Heritage Walk KL", city: "George Town", state: "Penang", imageUrl: null },
    product: { id: "a2880dc7-4c89-b498-131e-964430c836a9", name: "Jalan Alor Heritage & Food Walk", description: "A real outlet offer.", price: 105.6, imageUrl: null },
  }],
};

describe("customer promotion campaign detail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getPublicPromotionCampaigns.mockResolvedValue({ campaigns: [campaign], error: false });
  });

  it("renders campaign, exact outlet and offer link in the initial server response", async () => {
    const page = await CustomerEventDetailPage({ params: Promise.resolve({ slug: campaign.slug }) });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain(campaign.title);
    expect(markup).toContain("Jalan Alor Heritage &amp; Food Walk");
    expect(markup).toContain("George Town");
    expect(markup).toContain('href="/customer/activity/a2880dc7-4c89-b498-131e-964430c836a9?outletId=3d30edce-2a66-d3c8-1835-5bcdc7f54f8a"');
    expect(markup).not.toContain("ui.promotionCampaigns.loading");
    expect(mocks.getPublicPromotionCampaigns).toHaveBeenCalledWith(campaign.slug);
  });

  it("shows a not-found state for a valid but unpublished campaign slug", async () => {
    mocks.getPublicPromotionCampaigns.mockResolvedValueOnce({ campaigns: [], error: false });

    const page = await CustomerEventDetailPage({ params: Promise.resolve({ slug: "missing-campaign" }) });
    const markup = renderToStaticMarkup(page);

    expect(markup).toContain("ui.promotionCampaigns.notFound");
    expect(markup).not.toContain("ui.promotionCampaigns.loading");
  });
});
