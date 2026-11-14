"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CampaignEventPass } from "@/components/customer/campaign-event-pass";
import { CampaignStallStrip } from "@/components/customer/campaign-stall-strip";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { isMalaysiaFullDayRange } from "@/lib/datetime/malaysia";
import { getEventOperationalLabelKey } from "@/lib/promotion-campaigns/locations";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";
import { LocalizedContent } from "@/components/customer/localized-content";

function CampaignPoster({
  campaign,
  className,
  sizes,
}: {
  campaign: PromotionCampaignPublic;
  className: string;
  sizes: string;
}) {
  return (
    <div data-slot="campaign-poster" className={`relative min-w-0 overflow-hidden bg-secondary/60 ${className}`}>
      {campaign.posterUrl ? (
        <Image
          src={campaign.posterUrl}
          alt=""
          fill
          sizes={sizes}
          unoptimized={campaign.posterUrl.startsWith("http://") || campaign.posterUrl.startsWith("https://")}
          className="object-contain"
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
          <CalendarDays size={42} strokeWidth={1.25} className="opacity-70" />
        </div>
      )}
    </div>
  );
}

export function PromotionCampaignCard({
  campaign,
  variant = "full",
}: {
  campaign: PromotionCampaignPublic;
  variant?: "full" | "compact";
}) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const isLive = campaign.visibility === "live";
  const isOperating = campaign.operationalStatus ? campaign.operationalStatus === "operating" : isLive;
  const formatCampaignDate = isMalaysiaFullDayRange(campaign.startsAt, campaign.endsAt) ? formatDate : formatDateTime;

  if (variant === "compact") {
    return (
      <article
        data-slot="campaign-card-compact"
        aria-labelledby={`campaign-${campaign.id}`}
        className="flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card"
      >
        <CampaignPoster campaign={campaign} className="aspect-[4/3]" sizes="(max-width: 767px) 100vw, (max-width: 1279px) 50vw, 33vw" />
        <div className="flex min-w-0 flex-1 flex-col p-4 sm:p-5">
          <h2
            id={`campaign-${campaign.id}`}
            className="break-words font-[family-name:var(--font-display)] text-xl font-bold leading-tight text-foreground sm:text-2xl"
          >
            <LocalizedContent entityType="promotion_campaign" entityId={campaign.id} field="title" sourceText={campaign.title} />
          </h2>
          <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${isOperating ? "text-emerald-800 dark:text-emerald-200" : "text-amber-900 dark:text-amber-200"}`}>
              <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${isOperating ? "bg-emerald-600 dark:bg-emerald-300" : "bg-amber-600 dark:bg-amber-300"}`} />
              {t(getEventOperationalLabelKey(campaign))}
            </span>
            <span aria-hidden="true" className="text-muted-foreground">·</span>
            <CalendarDays size={13} aria-hidden="true" className="shrink-0 text-primary" />
            <span className="min-w-0 break-words text-xs font-medium text-muted-foreground">
              {t(isLive ? "ui.promotionCampaigns.endsAt" : "ui.promotionCampaigns.startsAt", {
                date: formatCampaignDate(isLive ? campaign.endsAt : campaign.startsAt, locale, {
                  timeZone: "Asia/Kuala_Lumpur",
                }),
              })}
            </span>
          </div>
          <Button asChild variant="outline" className="group mt-auto min-h-10 self-start rounded-lg border-primary/20 bg-transparent px-4 font-semibold text-primary transition-colors hover:border-primary hover:bg-primary hover:text-primary-foreground motion-reduce:transition-none">
            <Link href={`/customer/events/${encodeURIComponent(campaign.slug)}`}>
              {t("ui.promotionCampaigns.viewAllVendors", { count: campaign.vendors.length })}
              <ArrowRight size={16} aria-hidden="true" className="text-primary transition-transform duration-200 ease-out group-hover:translate-x-1 group-focus-visible:translate-x-1 group-hover:text-primary-foreground motion-reduce:transition-none" />
            </Link>
          </Button>
        </div>
      </article>
    );
  }

  return (
    <CampaignEventPass
      campaign={campaign}
      headingLevel="h2"
      imageSizes="(max-width: 1023px) 100vw, 40vw"
      footer={<CampaignStallStrip campaign={campaign} />}
    />
  );
}
