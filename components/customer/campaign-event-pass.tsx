"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, CalendarDays, Clock3, Map as MapIcon, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LocalizedContent } from "@/components/customer/localized-content";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { isMalaysiaFullDayRange } from "@/lib/datetime/malaysia";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";
import { getEventOperationalLabelKey } from "@/lib/promotion-campaigns/locations";

/** The events page campaign card: photo left, text right (stacked on phones), no box; `footer` (the stall strip) runs full width below. */
export function CampaignEventPass({ campaign, headingLevel = "h2", imageSizes, imagePriority = false, footer, children }: {
  campaign: PromotionCampaignPublic;
  headingLevel?: "h2" | "h3";
  imageSizes: string;
  imagePriority?: boolean;
  footer?: ReactNode;
  children?: ReactNode;
}) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const formatCampaignDate = isMalaysiaFullDayRange(campaign.startsAt, campaign.endsAt) ? formatDate : formatDateTime;
  const image = campaign.posterUrl;
  const live = campaign.operationalStatus ? campaign.operationalStatus === "operating" : campaign.visibility === "live";
  const Heading = headingLevel;

  return (
    <article aria-labelledby={`campaign-${campaign.id}-title`} className="min-w-0">
      <div className="grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-center lg:gap-10">
        <div data-slot="promotion-campaign-image" className="relative aspect-[16/10] min-w-0 overflow-hidden rounded-[6px] bg-secondary">
          {image ? (
            <Image
              src={image}
              alt=""
              fill
              sizes={imageSizes}
              loading={imagePriority ? "eager" : "lazy"}
              unoptimized={image.startsWith("http://") || image.startsWith("https://")}
              className="object-cover"
            />
          ) : (
            <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-muted-foreground/50">
              <CalendarDays size={72} strokeWidth={1} />
            </div>
          )}
          {campaign.locations[0]?.name && (
            <span data-slot="promotion-campaign-location" className="absolute bottom-4 left-4 inline-flex max-w-[calc(100%-2rem)] items-center gap-1.5 rounded-lg bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-[#010066] shadow-sm">
              <MapPin size={13} className="shrink-0" aria-hidden="true" />
              <span className="truncate">{campaign.locations[0].name}</span>
            </span>
          )}
        </div>
        <div data-slot="promotion-campaign-content" className="flex min-w-0 flex-col">
          <span className={`self-start rounded-full px-3 py-1 text-xs font-bold ${live ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200" : "bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200"}`}>
            {t(getEventOperationalLabelKey(campaign))}
          </span>
          <Heading
            id={`campaign-${campaign.id}-title`}
            className="mt-4 break-words font-[family-name:var(--font-display)] text-3xl font-semibold leading-[1.05] tracking-[-0.02em] text-primary lg:text-[40px]"
          >
            <LocalizedContent entityType="promotion_campaign" entityId={campaign.id} field="title" sourceText={campaign.title} />
          </Heading>
          <p className="mt-4 max-w-2xl break-words text-sm leading-7 text-muted-foreground">
            <LocalizedContent entityType="promotion_campaign" entityId={campaign.id} field="summary" sourceText={campaign.summary} />
          </p>
          <div className="mt-5 grid gap-2 text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <CalendarDays size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                {formatCampaignDate(campaign.startsAt, locale, { timeZone: "Asia/Kuala_Lumpur" })}
                {" – "}
                {formatCampaignDate(campaign.endsAt, locale, { timeZone: "Asia/Kuala_Lumpur" })}
              </span>
            </p>
            <p className="flex items-start gap-2">
              <MapIcon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>{t("ui.promotionCampaigns.locationVendorSummary", { locations: t("ui.promotionCampaigns.locationCount", { count: campaign.locations.length }), vendors: t("ui.promotionCampaigns.vendorCount", { count: campaign.vendors.length }) })}</span>
            </p>
            {campaign.operatingHours && <p className="flex items-start gap-2"><Clock3 size={16} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{campaign.operatingHours}</span></p>}
          </div>
          {children}
          <Button asChild variant="outline" className="mt-6 h-auto min-h-11 max-w-full self-start whitespace-normal rounded-[6px] border-2 border-primary px-6 text-center font-bold text-primary hover:bg-secondary hover:text-primary">
            <Link href={`/customer/events/${encodeURIComponent(campaign.slug)}`}>{t("ui.promotionCampaigns.exploreCampaign")} <ArrowUpRight size={16} aria-hidden="true" /></Link>
          </Button>
        </div>
      </div>
      {footer && <div className="mt-6">{footer}</div>}
    </article>
  );
}
