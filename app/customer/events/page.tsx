import type { Metadata } from "next";
import { getServerTranslation } from "@/lib/i18n/server";
import { BRAND_NAME } from "@/lib/i18n/invariant-tokens";
import { getPublicPromotionCampaigns } from "@/lib/promotion-campaigns/public";
import { PromotionCampaignsClient } from "./promotion-campaigns-client";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslation("customer");
  return { title: `${t("ui.promotionCampaigns.pageTitle")} — ${BRAND_NAME}`, description: t("ui.promotionCampaigns.pageDescription") };
}

export default async function CustomerEventsPage() {
  const result = await getPublicPromotionCampaigns();
  return <PromotionCampaignsClient initialCampaigns={result.campaigns} initialError={result.error} />;
}
