import type { Metadata } from "next";
import { getServerTranslation } from "@/lib/i18n/server";
import { BRAND_NAME } from "@/lib/i18n/invariant-tokens";
import { getPublicPromotionCampaigns } from "@/lib/promotion-campaigns/public";
import { campaignSlugSchema } from "@/lib/promotion-campaigns/validation";
import { notFound } from "next/navigation";
import { PromotionCampaignDetailClient } from "./promotion-campaign-detail-client";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { t } = await getServerTranslation("customer");
  return { title: `${slug} — ${BRAND_NAME}`, description: t("ui.promotionCampaigns.pageDescription") };
}

export default async function CustomerEventDetailPage({ params }: Props) {
  const { slug } = await params;
  const parsedSlug = campaignSlugSchema.safeParse(slug);
  if (!parsedSlug.success) notFound();

  const result = await getPublicPromotionCampaigns(parsedSlug.data);
  const campaign = result.campaigns[0] ?? null;
  const initialError = result.error ? "load" : campaign ? null : "missing";
  return <PromotionCampaignDetailClient key={parsedSlug.data} slug={parsedSlug.data} initialCampaign={campaign} initialError={initialError} />;
}
