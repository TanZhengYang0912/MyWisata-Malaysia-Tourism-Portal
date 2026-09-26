import { afterEach, describe, expect, it, vi } from "vitest";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

import { resolvePromotionCampaignImages } from "@/lib/promotion-campaigns/images";

const campaign: PromotionCampaignPublic = {
  id: "campaign",
  slug: "sample-campaign",
  title: "Sample campaign",
  summary: "A live campaign",
  description: "Campaign description",
  startsAt: "2026-09-25T00:00:00.000Z",
  endsAt: "2026-10-25T00:00:00.000Z",
  visibility: "live",
  offers: [{
    kind: "product",
    id: "offer",
    position: 0,
    vendor: { id: "vendor", name: "Vendor", logoUrl: null },
    outlet: { id: "outlet", name: "Outlet", city: null, state: null, imageUrl: null },
    product: { id: "product", name: "Product", description: null, price: 10, imageUrl: "/assets/customer/products/product-real.jpg" },
  }],
};

describe("resolvePromotionCampaignImages", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("converts legacy product paths to the shared Supabase product-image URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");

    const [resolved] = resolvePromotionCampaignImages([campaign]);
    const offer = resolved.offers[0];

    expect(offer.kind).toBe("product");
    if (offer.kind === "product") {
      expect(offer.product.imageUrl).toBe("https://project.supabase.co/storage/v1/object/public/product-images/products/product-real.jpg");
    }
  });

  it("keeps missing and absolute source images unchanged", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    const absolute = "https://project.supabase.co/storage/v1/object/public/product-images/products/product.jpg";
    const value = {
      ...campaign,
      offers: campaign.offers.map((offer) => offer.kind === "product" ? { ...offer, product: { ...offer.product, imageUrl: absolute } } : offer),
    } satisfies PromotionCampaignPublic;

    const [resolved] = resolvePromotionCampaignImages([value]);
    const offer = resolved.offers[0];

    expect(offer.kind).toBe("product");
    if (offer.kind === "product") expect(offer.product.imageUrl).toBe(absolute);
  });
});
