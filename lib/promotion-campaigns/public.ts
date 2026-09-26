import { createClient } from "@/lib/supabase/server";
import { resolvePromotionCampaignImages } from "@/lib/promotion-campaigns/images";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

export type PublicPromotionCampaignsResult = {
  campaigns: PromotionCampaignPublic[];
  error: boolean;
};

/** Reads the restricted customer projection for server pages and the retry API. */
export async function getPublicPromotionCampaigns(slug: string | null = null): Promise<PublicPromotionCampaignsResult> {
  try {
    const db = await createClient();
    const { data, error } = await db.rpc("get_public_promotion_campaigns", { p_slug: slug });
    if (error) return { campaigns: [], error: true };

    return {
      campaigns: resolvePromotionCampaignImages(Array.isArray(data) ? data as unknown as PromotionCampaignPublic[] : []),
      error: false,
    };
  } catch {
    return { campaigns: [], error: true };
  }
}
