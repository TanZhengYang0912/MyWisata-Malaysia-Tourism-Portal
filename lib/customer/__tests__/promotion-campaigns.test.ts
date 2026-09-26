import { describe, expect, it } from "vitest";
import {
  getCampaignVisibility,
  isCampaignOfferEligible,
  selectFeaturedCampaign,
  selectFeaturedPublicCampaign,
} from "@/lib/customer/promotion-campaigns";
import {
  campaignCreateSchema,
  campaignOfferSchema,
  campaignTransitionSchema,
} from "@/lib/promotion-campaigns/validation";
import type { PromotionCampaignOfferEligibility, PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

const NOW = new Date("2026-09-25T12:00:00.000Z");

function campaign(overrides: Partial<Parameters<typeof getCampaignVisibility>[0]> = {}) {
  return {
    id: "test-campaign",
    status: "approved",
    startsAt: "2026-09-25T12:00:00.000Z",
    endsAt: "2026-09-26T12:00:00.000Z",
    ...overrides,
  };
}

function eligibleVoucher(overrides: Partial<Extract<PromotionCampaignOfferEligibility, { kind: "voucher" }>> = {}): PromotionCampaignOfferEligibility {
  return {
    kind: "voucher",
    active: true,
    reviewStatus: "approved",
    vendorReviewStatus: "approved",
    claimable: true,
    redemptionMode: "online",
    claimFrom: null,
    claimUntil: null,
    validFrom: null,
    validUntil: null,
    maxUses: null,
    usesCount: 0,
    reservedUses: 0,
    ...overrides,
  };
}

function eligibleProduct(overrides: Partial<Extract<PromotionCampaignOfferEligibility, { kind: "product" }>> = {}): PromotionCampaignOfferEligibility {
  return {
    kind: "product",
    active: true,
    reviewStatus: "approved",
    vendorStatus: "approved",
    outletOfferStatus: "active",
    outletActive: true,
    outletReviewStatus: "approved",
    selectedOutletId: "outlet-a",
    actualOutletId: "outlet-a",
    ...overrides,
  };
}

describe("promotion campaign time and source eligibility", () => {
  it("includes the campaign start instant and excludes its end instant", () => {
    expect(getCampaignVisibility(campaign(), NOW)).toBe("live");
    expect(getCampaignVisibility(campaign({ endsAt: NOW.toISOString() }), NOW)).toBeNull();
  });

  it("shows approved future campaigns as previews and hides paused or unapproved campaigns", () => {
    expect(getCampaignVisibility(campaign({ startsAt: "2026-09-25T13:00:00.000Z" }), NOW)).toBe("upcoming");
    expect(getCampaignVisibility(campaign({ status: "draft" }), NOW)).toBeNull();
    expect(getCampaignVisibility(campaign({ status: "paused" }), NOW)).toBeNull();
  });

  it("filters currently invalid, unapproved, expired, and exhausted vouchers", () => {
    expect(isCampaignOfferEligible(eligibleVoucher(), NOW)).toBe(true);
    expect(isCampaignOfferEligible(eligibleVoucher({ active: false }), NOW)).toBe(false);
    expect(isCampaignOfferEligible(eligibleVoucher({ reviewStatus: "pending" }), NOW)).toBe(false);
    expect(isCampaignOfferEligible(eligibleVoucher({ validFrom: "2026-09-25T12:00:01.000Z" }), NOW)).toBe(false);
    expect(isCampaignOfferEligible(eligibleVoucher({ validUntil: "2026-09-25T11:59:59.999Z" }), NOW)).toBe(false);
    expect(isCampaignOfferEligible(eligibleVoucher({ maxUses: 4, usesCount: 4 }), NOW)).toBe(false);
    expect(isCampaignOfferEligible(eligibleVoucher({ vendorReviewStatus: "pending" }), NOW)).toBe(false);
    expect(isCampaignOfferEligible(eligibleVoucher({ claimable: false }), NOW)).toBe(false);
    expect(isCampaignOfferEligible(eligibleVoucher({ redemptionMode: "in_store" }), NOW)).toBe(false);
    expect(isCampaignOfferEligible(eligibleVoucher({ claimFrom: "2026-09-25T12:00:01.000Z" }), NOW)).toBe(false);
    expect(isCampaignOfferEligible(eligibleVoucher({ claimUntil: "2026-09-25T11:59:59.999Z" }), NOW)).toBe(false);
    expect(isCampaignOfferEligible(eligibleVoucher({ maxUses: 5, usesCount: 3, reservedUses: 2 }), NOW)).toBe(false);
  });

  it("requires each product to remain approved at its selected active outlet", () => {
    expect(isCampaignOfferEligible(eligibleProduct(), NOW)).toBe(true);
    expect(isCampaignOfferEligible(eligibleProduct({ selectedOutletId: "outlet-b" }), NOW)).toBe(false);
    expect(isCampaignOfferEligible(eligibleProduct({ outletOfferStatus: "inactive" }), NOW)).toBe(false);
    expect(isCampaignOfferEligible(eligibleProduct({ outletActive: false }), NOW)).toBe(false);
    expect(isCampaignOfferEligible(eligibleProduct({ vendorStatus: "suspended" }), NOW)).toBe(false);
  });

  it("features a live campaign first, otherwise the nearest upcoming campaign with an eligible offer", () => {
    const live = { ...campaign(), slug: "live", offers: [eligibleVoucher()] };
    const next = { ...campaign({ startsAt: "2026-09-25T13:00:00.000Z" }), slug: "next", offers: [eligibleProduct()] };
    const futureVoucher = { ...campaign({ startsAt: "2026-09-25T13:30:00.000Z" }), slug: "future-voucher", offers: [eligibleVoucher({ validFrom: "2026-09-25T13:30:00.000Z" })] };
    const later = { ...campaign({ startsAt: "2026-09-25T14:00:00.000Z" }), slug: "later", offers: [eligibleVoucher()] };
    const empty = { ...campaign({ startsAt: "2026-09-25T12:30:00.000Z" }), slug: "empty", offers: [eligibleVoucher({ active: false })] };

    expect(selectFeaturedCampaign([later, next, live], NOW)?.slug).toBe("live");
    expect(selectFeaturedCampaign([later, empty, next], NOW)?.slug).toBe("next");
    expect(selectFeaturedCampaign([later, futureVoucher], NOW)?.slug).toBe("future-voucher");
    expect(selectFeaturedCampaign([empty], NOW)).toBeNull();
  });

  it("chooses a public campaign from the server projection by actual boundaries", () => {
    const offer: PromotionCampaignPublic["offers"][number] = {
      kind: "product", id: "offer", position: 0,
      vendor: { id: "vendor", name: "Vendor", logoUrl: null },
      outlet: { id: "outlet", name: "Outlet", city: null, state: null, imageUrl: null },
      product: { id: "product", name: "Product", description: null, price: 10, imageUrl: null },
    };
    const publicCampaign = (slug: string, startsAt: string, endsAt: string): PromotionCampaignPublic => ({
      id: slug, slug, title: slug, summary: slug, description: slug,
      startsAt, endsAt, visibility: "upcoming", offers: [] as PromotionCampaignPublic["offers"],
    });
    const expired = publicCampaign("expired", "2026-09-24T10:00:00.000Z", "2026-09-25T12:00:00.000Z");
    const later = publicCampaign("later", "2026-09-26T12:00:00.000Z", "2026-09-27T12:00:00.000Z");
    const live = publicCampaign("live", "2026-09-25T11:00:00.000Z", "2026-09-25T15:00:00.000Z");
    const soonerUpcoming = publicCampaign("sooner", "2026-09-25T13:00:00.000Z", "2026-09-26T13:00:00.000Z");
    const eligibleLive = { ...live, offers: [offer] };
    const eligibleUpcoming = { ...soonerUpcoming, offers: [offer] };
    const eligibleLater = { ...later, offers: [offer] };

    expect(selectFeaturedPublicCampaign([expired, eligibleLater, eligibleUpcoming, eligibleLive], NOW)?.slug).toBe("live");
    expect(selectFeaturedPublicCampaign([expired, eligibleLater, eligibleUpcoming], NOW)?.slug).toBe("sooner");
    expect(selectFeaturedPublicCampaign([expired], NOW)).toBeNull();
    expect(selectFeaturedPublicCampaign([soonerUpcoming], NOW)).toBeNull();
  });
});

describe("promotion campaign request validation", () => {
  const base = {
    title: "Double Eleven experiences",
    slug: "double-eleven-experiences",
    summary: "A short campaign introduction.",
    description: "A longer campaign description for customers.",
    startsAt: "2026-11-10T16:00:00.000Z",
    endsAt: "2026-11-11T16:00:00.000Z",
    offers: [],
  };

  it("rejects unknown fields and an end that is not after the start", () => {
    expect(campaignCreateSchema.safeParse({ ...base, isFeatured: true }).success).toBe(false);
    expect(campaignCreateSchema.safeParse({ ...base, endsAt: base.startsAt }).success).toBe(false);
  });

  it("requires valid source IDs and unique offer order", () => {
    const voucher = { kind: "voucher", voucherId: "not-a-uuid", position: 1 };
    expect(campaignOfferSchema.safeParse(voucher).success).toBe(false);
    expect(campaignCreateSchema.safeParse({ ...base, offers: [
      { kind: "voucher", voucherId: "11111111-1111-4111-8111-111111111111", position: 1 },
      { kind: "product", productId: "22222222-2222-4222-8222-222222222222", outletId: "33333333-3333-4333-8333-333333333333", position: 1 },
    ] }).success).toBe(false);
  });

  it("allows an empty draft and accepts only a well-formed submit action", () => {
    expect(campaignCreateSchema.safeParse(base).success).toBe(true);
    expect(campaignTransitionSchema.safeParse({ action: "submit", expectedUpdatedAt: NOW.toISOString() }).success).toBe(true);
    expect(campaignTransitionSchema.safeParse({ action: "reject", expectedUpdatedAt: NOW.toISOString() }).success).toBe(false);
  });
});
