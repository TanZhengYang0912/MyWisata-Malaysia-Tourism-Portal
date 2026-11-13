"use client";

import Image from "next/image";
import { CalendarDays } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { isMalaysiaFullDayRange } from "@/lib/datetime/malaysia";
import { getEventOperationalLabelKey } from "@/lib/promotion-campaigns/locations";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";
import { SeeMoreLink } from "@/components/customer/see-more-link";
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
    <div data-slot="campaign-poster" className={`relative min-w-0 overflow-hidden bg-secondary ${className}`}>
      {campaign.posterUrl ? (
        <Image
          src={campaign.posterUrl}
          alt=""
          fill
          sizes={sizes}
          unoptimized={campaign.posterUrl.startsWith("http://") || campaign.posterUrl.startsWith("https://")}
          className="object-contain p-2 sm:p-3"
        />
      ) : (
        <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary to-primary/80 text-primary-foreground">
          <CalendarDays size={54} strokeWidth={1.25} className="opacity-70" />
        </div>
      )}
    </div>
  );
}

/** The event card inside the Events map's list (the Events page list uses EventCard). */
export function PromotionCampaignCard({
  campaign,
}: {
  campaign: PromotionCampaignPublic;
  variant?: "compact";
}) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const isLive = campaign.visibility === "live";
  const isOperating = campaign.operationalStatus ? campaign.operationalStatus === "operating" : isLive;
  const formatCampaignDate = isMalaysiaFullDayRange(campaign.startsAt, campaign.endsAt) ? formatDate : formatDateTime;

  return (
    <article aria-labelledby={`campaign-${campaign.id}`} className="overflow-hidden rounded-3xl border border-border/70 bg-card shadow-sm">
      <div className="grid min-w-0 grid-cols-1 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)]">
        <CampaignPoster campaign={campaign} className="aspect-[4/3] lg:aspect-auto lg:min-h-72" sizes="(max-width: 1023px) 100vw, (max-width: 1440px) 16vw, 15vw" />
        <div className="flex min-w-0 flex-col p-4 sm:p-5 lg:min-h-72 lg:p-6">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-bold ${isOperating ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200" : "bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200"}`}>
              {t(getEventOperationalLabelKey(campaign))}
            </span>
            <span className="text-sm text-muted-foreground">
              {t(isLive ? "ui.promotionCampaigns.endsAt" : "ui.promotionCampaigns.startsAt", {
                date: formatCampaignDate(isLive ? campaign.endsAt : campaign.startsAt, locale, {
                  timeZone: "Asia/Kuala_Lumpur",
                }),
              })}
            </span>
          </div>
          <span className="mt-3 inline-flex self-start rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
            {t("ui.promotionCampaigns.vendorCount", { count: campaign.vendors.length })}
          </span>
          <h2
            id={`campaign-${campaign.id}`}
            className="mt-3 break-words font-[family-name:var(--font-display)] text-xl font-bold leading-tight text-foreground sm:text-2xl"
          >
            <LocalizedContent entityType="promotion_campaign" entityId={campaign.id} field="title" sourceText={campaign.title} />
          </h2>
          <div className="mt-5 flex justify-end lg:mt-auto">
            <SeeMoreLink href={`/customer/events/${encodeURIComponent(campaign.slug)}`} ariaLabel={t("ui.promotionCampaigns.vendorCount", { count: campaign.vendors.length })} />
          </div>
        </div>
      </div>
    </article>
  );
}
