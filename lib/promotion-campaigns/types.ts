export const PROMOTION_CAMPAIGN_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "rejected",
  "paused",
  "archived",
] as const;

export type PromotionCampaignStatus = (typeof PROMOTION_CAMPAIGN_STATUSES)[number];
export type PromotionCampaignVisibility = "upcoming" | "live";

export type PromotionCampaignOfferInput =
  | { kind: "voucher"; voucherId: string; position: number }
  | { kind: "product"; productId: string; outletId: string; position: number };

export type PromotionCampaignOfferEligibility =
  | {
      kind: "voucher";
      active: boolean;
      reviewStatus: string | null;
      vendorReviewStatus: string | null;
      claimable: boolean;
      redemptionMode: "online" | "in_store" | "both";
      claimFrom: string | null;
      claimUntil: string | null;
      validFrom: string | null;
      validUntil: string | null;
      maxUses: number | null;
      usesCount: number;
      reservedUses: number;
    }
  | {
      kind: "product";
      active: boolean;
      reviewStatus: string | null;
      vendorStatus: string | null;
      outletOfferStatus: string | null;
      outletActive: boolean;
      outletReviewStatus: string | null;
      selectedOutletId: string;
      actualOutletId: string;
    };

export type PromotionCampaignOutlet = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  imageUrl: string | null;
};

export type PromotionCampaignVendor = {
  id: string;
  name: string;
  logoUrl: string | null;
};

export type PromotionCampaignVoucherOffer = {
  kind: "voucher";
  id: string;
  position: number;
  vendor: PromotionCampaignVendor;
  outlet: PromotionCampaignOutlet | null;
  eligibleOutlets: PromotionCampaignOutlet[];
  voucher: {
    id: string;
    name: string;
    voucherType: "percent" | "fixed" | "bogo";
    discountValue: number;
    minSpend: number;
    validFrom: string | null;
    validUntil: string | null;
    maxUses: number | null;
    usesCount: number;
    redemptionMode: "online" | "in_store" | "both";
  };
  eligibleProducts: Array<{ id: string; name: string }>;
};

export type PromotionCampaignProductOffer = {
  kind: "product";
  id: string;
  position: number;
  vendor: PromotionCampaignVendor;
  outlet: PromotionCampaignOutlet;
  product: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    imageUrl: string | null;
  };
};

export type PromotionCampaignOffer = PromotionCampaignVoucherOffer | PromotionCampaignProductOffer;

export type PromotionCampaignPublic = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  description: string;
  startsAt: string;
  endsAt: string;
  visibility: PromotionCampaignVisibility;
  offers: PromotionCampaignOffer[];
};

export type PromotionCampaignSelection<TOffer extends PromotionCampaignOfferEligibility = PromotionCampaignOfferEligibility> = {
  id: string;
  slug: string;
  status: string;
  startsAt: string;
  endsAt: string;
  offers: TOffer[];
};

export type PromotionCampaignAction = "submit" | "approve" | "reject" | "pause" | "resume" | "archive";
