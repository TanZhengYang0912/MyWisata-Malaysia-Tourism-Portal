import { apiFail, apiOk } from "@/lib/validation/schemas";
import { campaignSlugSchema } from "@/lib/promotion-campaigns/validation";
import { getPublicPromotionCampaigns } from "@/lib/promotion-campaigns/public";

export async function GET(request: Request) {
  const rawSlug = new URL(request.url).searchParams.get("slug");
  const slugResult = rawSlug === null ? null : campaignSlugSchema.safeParse(rawSlug);
  if (slugResult && !slugResult.success) return apiFail("INVALID_SLUG", "Campaign address is invalid", 422);

  const result = await getPublicPromotionCampaigns(slugResult?.data ?? null);
  if (result.error) return apiFail("CAMPAIGNS_UNAVAILABLE", "Unable to load promotion campaigns right now", 503);

  if (slugResult) {
    const campaign = result.campaigns[0];
    if (!campaign) return apiFail("NOT_FOUND", "This promotion campaign is not available", 404);
    return apiOk({ campaign });
  }
  return apiOk({ campaigns: result.campaigns });
}
