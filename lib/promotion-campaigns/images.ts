import { productImageUrl } from "@/lib/storage/product-image";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

/** Resolves legacy product-cover paths in the public projection through the shared storage URL helper. */
export function resolvePromotionCampaignImages(campaigns: readonly PromotionCampaignPublic[]): PromotionCampaignPublic[] {
  return campaigns.map((campaign) => ({
    ...campaign,
    offers: campaign.offers.map((offer) => offer.kind === "product"
      ? { ...offer, product: { ...offer.product, imageUrl: productImageUrl(offer.product.imageUrl) } }
      : offer),
  }));
}
