"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, CalendarDays, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CampaignEnvelope } from "@/components/customer/campaign-envelope";
import { FeaturedSplitCard } from "@/components/customer/featured-split-card";
import { FeaturedRecommendationsFrame } from "@/components/customer/featured-recommendations-frame";
import { Button } from "@/components/ui/button";
import { selectFeaturedPublicCampaigns } from "@/lib/customer/promotion-campaigns";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

export function PromotionCampaignSpotlight({ campaign, campaigns, unavailable = false }: { campaign: PromotionCampaignPublic | null; campaigns?: PromotionCampaignPublic[]; unavailable?: boolean }) {
  const { t } = useTranslation("customer");
  const [activeIndex, setActiveIndex] = useState(0);
  const [recoveredCampaigns, setRecoveredCampaigns] = useState<PromotionCampaignPublic[]>([]);
  const [loadFailed, setLoadFailed] = useState(unavailable && !campaign);
  const [retrying, setRetrying] = useState(false);
  const attemptedRecovery = useRef(false);

  const providedList = campaigns && campaigns.length > 0 ? campaigns : (campaign ? [campaign] : []);
  const list = providedList.length > 0 ? providedList : recoveredCampaigns;
  const displayCampaign = list.length > 0 ? list[activeIndex % list.length] : null;

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

  function moveTo(index: number) {
    if (index < 0 || index >= list.length) return;
    setActiveIndex(index);
  }

  const actions = (loadFailed || !displayCampaign) && <div data-slot="promotion-campaign-actions" className="mt-auto flex w-full flex-wrap items-center justify-start gap-x-5 gap-y-3 pt-8">
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
  </div>;

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
        slideLabel={(page, total) => t("ui.accessibility.carouselSlide", { page, total })}
        carouselTestId="promotion-campaign-spotlight"
        activeSlideIndex={list.length > 0 ? activeIndex % list.length : 0}
        slideCount={list.length}
        onSelectSlide={moveTo}
        onNext={() => move(1)}
        clip={!displayCampaign}
        action={displayCampaign && (
          <Link href="/customer/events" className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
            {t("ui.promotionCampaigns.allCampaigns")} <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        )}
      >
        {displayCampaign ? (
          <CampaignEnvelope key={displayCampaign.id} campaign={displayCampaign} imagePriority />
        ) : (
          <FeaturedSplitCard
            mediaSlot="promotion-campaign-image"
            contentSlot="promotion-campaign-content"
            media={<div aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-muted-foreground/50"><CalendarDays size={72} strokeWidth={1} /></div>}
          >
            <h2
              id="promotion-campaign-spotlight-title"
              className="mt-4 break-words font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-foreground sm:text-3xl"
            >
              {t(unavailable ? "ui.promotionCampaigns.unavailableTitle" : "ui.promotionCampaigns.emptyTitle")}
            </h2>
            <p className="mt-3 max-w-xl break-words text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
              {t(unavailable ? "ui.promotionCampaigns.unavailableDescription" : "ui.promotionCampaigns.emptyDescription")}
            </p>
            {actions}
          </FeaturedSplitCard>
        )}
      </FeaturedRecommendationsFrame>
    </section>
  );

  return spotlight;
}
