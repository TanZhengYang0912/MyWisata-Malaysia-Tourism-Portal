"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowUpRight, CalendarDays, Clock3, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FeaturedSplitCard } from "@/components/customer/featured-split-card";
import { LocalizedContent } from "@/components/customer/localized-content";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { isMalaysiaFullDayRange } from "@/lib/datetime/malaysia";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "@/lib/i18n/locale";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";
import { getEventOperationalLabelKey } from "@/lib/promotion-campaigns/locations";

/** Day, short month and year for the ticket stub, in Malaysia time. */
function calendarParts(value: string, locale: AppLocale) {
  const parts = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return { day: part("day"), month: part("month"), year: part("year") };
}

/** The campaign event pass shared by the home spotlight and the events page. */
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
  // The stub counts down to the start until the campaign is published live, then to its end.
  const started = campaign.visibility === "live";
  const passDate = calendarParts(started ? campaign.endsAt : campaign.startsAt, locale);
  const Heading = headingLevel;

  return (
    <FeaturedSplitCard
      variant="event-pass"
      footer={footer}
      endContent={<>
        <span className="text-center text-primary lg:block">
          <span className="block text-[10px] font-semibold uppercase tracking-[0.08em]">{t(started ? "ui.promotionCampaigns.endsAt" : "ui.promotionCampaigns.startsAt", { date: passDate.month })}</span>
          <span className="block font-[family-name:var(--font-display)] text-3xl font-bold leading-tight lg:text-5xl">{passDate.day}</span>
          <span className="block text-[11px] text-muted-foreground">{passDate.year}</span>
        </span>
        <Button asChild className="h-auto min-h-10 max-w-full whitespace-normal rounded-full px-5 text-center"><Link href={`/customer/events/${encodeURIComponent(campaign.slug)}`}>{t("ui.promotionCampaigns.exploreCampaign")} <ArrowUpRight size={16} aria-hidden="true" /></Link></Button>
      </>}
      mediaSlot="promotion-campaign-image"
      contentSlot="promotion-campaign-content"
      media={<>
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
      </>}
    >
      <span className={`self-start rounded-full px-3 py-1 text-xs font-bold ${live ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200" : "bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200"}`}>
        {t(getEventOperationalLabelKey(campaign))}
      </span>
      <Heading
        id={`campaign-${campaign.id}-title`}
        className="mt-4 break-words font-[family-name:var(--font-display)] text-3xl font-bold leading-tight text-foreground lg:text-4xl"
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
          <MapPin size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>{t("ui.promotionCampaigns.locationCount", { count: campaign.locations.length })} · {t("ui.promotionCampaigns.vendorCount", { count: campaign.vendors.length })}</span>
        </p>
        {campaign.operatingHours && <p className="flex items-start gap-2"><Clock3 size={16} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{campaign.operatingHours}</span></p>}
      </div>
      {children}
    </FeaturedSplitCard>
  );
}
