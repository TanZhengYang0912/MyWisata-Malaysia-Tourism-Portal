import type { Metadata } from "next";
import { getServerTranslation } from "@/lib/i18n/server";
import { BRAND_NAME } from "@/lib/i18n/invariant-tokens";
import { getPublicPromotionCampaigns } from "@/lib/promotion-campaigns/public";
import { PromotionCampaignsClient } from "./promotion-campaigns-client";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslation("customer");
  return { title: `${t("ui.promotionCampaigns.pageTitle")} — ${BRAND_NAME}`, description: t("ui.promotionCampaigns.pageDescription") };
}

/** A real YYYY-MM-DD calendar date, or null (bad values fall back to all events). */
function parseDateParam(value: string | string[] | undefined): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export default async function CustomerEventsPage({ searchParams }: { searchParams: Promise<{ date?: string | string[] }> }) {
  const [result, params] = await Promise.all([getPublicPromotionCampaigns(), searchParams]);
  return <PromotionCampaignsClient initialCampaigns={result.campaigns} initialError={result.error} initialDate={parseDateParam(params.date)} />;
}
