"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, CalendarDays, Clock3, MapPin, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { FeaturedSplitCard } from "@/components/customer/featured-split-card";
import { FeaturedRecommendationsFrame } from "@/components/customer/featured-recommendations-frame";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime } from "@/lib/i18n/format";
import { isMalaysiaFullDayRange } from "@/lib/datetime/malaysia";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "@/lib/i18n/locale";
import { selectFeaturedPublicCampaigns } from "@/lib/customer/promotion-campaigns";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";
import { getEventOperationalLabelKey } from "@/lib/promotion-campaigns/locations";
import { LocalizedContent } from "@/components/customer/localized-content";

/** Day, short month and year for the ticket stub, in Malaysia time. */
function calendarParts(value: string, locale: AppLocale) {
  const parts = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value ?? "";
  return { day: part("day"), month: part("month"), year: part("year") };
}

export function PromotionCampaignSpotlight({ campaign, campaigns, unavailable = false }: { campaign: PromotionCampaignPublic | null; campaigns?: PromotionCampaignPublic[]; unavailable?: boolean }) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [activeIndex, setActiveIndex] = useState(0);
  const [recoveredCampaigns, setRecoveredCampaigns] = useState<PromotionCampaignPublic[]>([]);
  const [loadFailed, setLoadFailed] = useState(unavailable && !campaign);
  const [retrying, setRetrying] = useState(false);
  const attemptedRecovery = useRef(false);

  const providedList = campaigns && campaigns.length > 0 ? campaigns : (campaign ? [campaign] : []);
  const list = providedList.length > 0 ? providedList : recoveredCampaigns;
  const displayCampaign = list.length > 0 ? list[activeIndex % list.length] : null;
  const formatCampaignDate = displayCampaign && isMalaysiaFullDayRange(displayCampaign.startsAt, displayCampaign.endsAt)
    ? formatDate : formatDateTime;

  const refresh = useCallback(async () => {
    setRetrying(true);
    try {
      const response = await fetch("/api/customer/promotion-campaigns", { cache: "no-store" });
      const payload = await response.json() as { data?: { campaigns?: PromotionCampaignPublic[] } };
      if (!response.ok || !Array.isArray(payload.data?.campaigns)) throw new Error("campaigns_unavailable");
      setRecoveredCampaigns(selectFeaturedPublicCampaigns(payload.data.campaigns));
      setActiveIndex(0);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setRetrying(false);
    }
  }, []);

  useEffect(() => {
    if (unavailable && !campaign && recoveredCampaigns.length === 0 && !attemptedRecovery.current) {
      attemptedRecovery.current = true;
      void refresh();
    }
  }, [campaign, recoveredCampaigns, refresh, unavailable]);

  function move(direction: -1 | 1) {
    if (list.length === 0) return;
    setActiveIndex((index) => (index + direction + list.length) % list.length);
  }

  const image = displayCampaign?.posterUrl ?? null;
  const live = displayCampaign?.operationalStatus ? displayCampaign.operationalStatus === "operating" : displayCampaign?.visibility === "live";
  const hasMultiple = list.length > 1;
  // The stub counts down to the start until the campaign is published live, then to its end.
  const started = displayCampaign?.visibility === "live";
  const passDate = displayCampaign ? calendarParts(started ? displayCampaign.endsAt : displayCampaign.startsAt, locale) : null;

  const spotlight = (
    <section
      aria-labelledby="promotion-campaign-spotlight-heading"
      className="my-10 sm:my-14"
    >
      <FeaturedRecommendationsFrame
        headingId="promotion-campaign-spotlight-heading"
        eyebrow={null}
        title={t("ui.home.campaigns")}
        description={null}
        carouselLabel={t("ui.search.featuredCarousel")}
        previousLabel={t("ui.promotionCampaigns.previous")}
        nextLabel={t("ui.promotionCampaigns.next")}
        carouselTestId="promotion-campaign-spotlight"
        hasMultipleSlides={hasMultiple}
        onPrevious={() => move(-1)}
        onNext={() => move(1)}
        action={displayCampaign && (
          <Link href="/customer/events" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
            {t("ui.promotionCampaigns.allCampaigns")} <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        )}
      >
        <FeaturedSplitCard
          variant={displayCampaign ? "event-pass" : "split"}
          endContent={displayCampaign && passDate && <>
            <span className="text-center text-primary lg:block">
              <span className="block text-[10px] font-semibold uppercase tracking-[0.08em]">{t(started ? "ui.promotionCampaigns.endsAt" : "ui.promotionCampaigns.startsAt", { date: passDate.month })}</span>
              <span className="block font-[family-name:var(--font-display)] text-3xl font-bold leading-tight lg:text-5xl">{passDate.day}</span>
              <span className="block text-[11px] text-muted-foreground">{passDate.year}</span>
            </span>
            <Button asChild className="h-auto min-h-10 max-w-full whitespace-normal rounded-full px-5 text-center"><Link href={`/customer/events/${encodeURIComponent(displayCampaign.slug)}`}>{t("ui.promotionCampaigns.exploreCampaign")} <ArrowUpRight size={16} aria-hidden="true" /></Link></Button>
          </>}
          mediaSlot="promotion-campaign-image"
          contentSlot="promotion-campaign-content"
          media={(
          <>
            {image ? (
              <Image
                src={image}
                alt=""
                fill
                sizes="(max-width: 767px) 100vw, 52vw"
                loading="eager"
                unoptimized={image.startsWith("http://") || image.startsWith("https://")}
                className="object-cover"
              />
            ) : (
              <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-muted-foreground/50">
                <CalendarDays size={72} strokeWidth={1} />
              </div>
            )}
            {displayCampaign?.locations[0]?.name && (
              <span data-slot="promotion-campaign-location" className="absolute bottom-4 left-4 inline-flex max-w-[calc(100%-2rem)] items-center gap-1.5 rounded-lg bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-[#010066] shadow-sm">
                <MapPin size={13} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{displayCampaign.locations[0].name}</span>
              </span>
            )}
          </>
        )}
      >
        {displayCampaign ? (
          <>
            <span className={`self-start rounded-full px-3 py-1 text-xs font-bold ${live ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-800 dark:text-emerald-200" : "bg-amber-100 dark:bg-amber-500/15 text-amber-900 dark:text-amber-200"}`}>
              {t(getEventOperationalLabelKey(displayCampaign))}
            </span>
            <h2
              id="promotion-campaign-spotlight-title"
              className="mt-4 break-words font-[family-name:var(--font-display)] text-3xl font-bold leading-tight text-foreground lg:text-4xl"
            >
              <LocalizedContent entityType="promotion_campaign" entityId={displayCampaign.id} field="title" sourceText={displayCampaign.title} />
            </h2>
            <p className="mt-4 max-w-2xl break-words text-sm leading-7 text-muted-foreground">
              <LocalizedContent entityType="promotion_campaign" entityId={displayCampaign.id} field="summary" sourceText={displayCampaign.summary} />
            </p>
            <div className="mt-5 grid gap-2 text-sm text-muted-foreground">
              <p className="flex items-start gap-2">
                <CalendarDays size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>
                  {formatCampaignDate(displayCampaign.startsAt, locale, { timeZone: "Asia/Kuala_Lumpur" })}
                  {" – "}
                  {formatCampaignDate(displayCampaign.endsAt, locale, { timeZone: "Asia/Kuala_Lumpur" })}
                </span>
              </p>
              <p className="flex items-start gap-2">
                <MapPin size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                <span>{t("ui.promotionCampaigns.locationCount", { count: displayCampaign.locations.length })} · {t("ui.promotionCampaigns.vendorCount", { count: displayCampaign.vendors.length })}</span>
              </p>
              {displayCampaign.operatingHours && <p className="flex items-start gap-2"><Clock3 size={16} className="mt-0.5 shrink-0" aria-hidden="true" /><span>{displayCampaign.operatingHours}</span></p>}
            </div>
          </>
        ) : (
          <>
            <h2
              id="promotion-campaign-spotlight-title"
              className="mt-4 break-words font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-foreground sm:text-3xl"
            >
              {t(unavailable ? "ui.promotionCampaigns.unavailableTitle" : "ui.promotionCampaigns.emptyTitle")}
            </h2>
            <p className="mt-3 max-w-xl break-words text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              {t(unavailable ? "ui.promotionCampaigns.unavailableDescription" : "ui.promotionCampaigns.emptyDescription")}
            </p>
          </>
        )}

        {(loadFailed || !displayCampaign) && <div data-slot="promotion-campaign-actions" className="mt-auto flex w-full flex-wrap items-center justify-start gap-x-5 gap-y-3 pt-8">
          {loadFailed && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void refresh()}
              disabled={retrying}
              className="min-h-11 rounded-full border-border px-4 font-semibold text-foreground hover:bg-muted"
            >
              <RefreshCw size={15} className={retrying ? "animate-spin" : undefined} />
              {t("ui.actions.retry")}
            </Button>
          )}
          {!displayCampaign && (
            <Button asChild className="min-h-11 rounded-full bg-highlight-yellow px-5 font-bold text-highlight-yellow-foreground hover:bg-highlight-yellow/85">
              <Link href="/customer/events">
                {t("ui.promotionCampaigns.allCampaigns")} <ArrowRight size={15} />
              </Link>
            </Button>
          )}
        </div>}
        </FeaturedSplitCard>
      </FeaturedRecommendationsFrame>
    </section>
  );

  return spotlight;
}
