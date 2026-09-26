"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarDays, RefreshCw, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { selectFeaturedPublicCampaign } from "@/lib/customer/promotion-campaigns";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

export function PromotionCampaignSpotlight({ campaign, unavailable = false }: { campaign: PromotionCampaignPublic | null; unavailable?: boolean }) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [recoveredCampaign, setRecoveredCampaign] = useState<PromotionCampaignPublic | null>(null);
  const [loadFailed, setLoadFailed] = useState(unavailable && !campaign);
  const [retrying, setRetrying] = useState(false);
  const attemptedRecovery = useRef(false);
  const displayCampaign = campaign ?? recoveredCampaign;

  const refresh = useCallback(async () => {
    setRetrying(true);
    try {
      const response = await fetch("/api/customer/promotion-campaigns", { cache: "no-store" });
      const payload = await response.json() as { data?: { campaigns?: PromotionCampaignPublic[] } };
      if (!response.ok || !Array.isArray(payload.data?.campaigns)) throw new Error("campaigns_unavailable");
      setRecoveredCampaign(selectFeaturedPublicCampaign(payload.data.campaigns));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setRetrying(false);
    }
  }, []);

  useEffect(() => {
    if (unavailable && !campaign && !recoveredCampaign && !attemptedRecovery.current) {
      attemptedRecovery.current = true;
      void refresh();
    }
  }, [campaign, recoveredCampaign, refresh, unavailable]);

  const image = displayCampaign?.offers[0]?.kind === "product"
    ? displayCampaign.offers[0].product.imageUrl
    : displayCampaign?.offers[0]?.kind === "voucher"
      ? displayCampaign.offers[0].outlet?.imageUrl ?? displayCampaign.offers[0].vendor.logoUrl
      : null;
  const live = displayCampaign?.visibility === "live";

  return (
    <section
      aria-labelledby="promotion-campaign-spotlight-title"
      className="my-10 overflow-hidden rounded-[28px] border border-border bg-card text-card-foreground sm:my-14"
    >
      <div className="grid min-w-0 lg:grid-cols-[minmax(0,0.46fr)_minmax(0,0.54fr)]">
        <div
          data-slot="promotion-campaign-image"
          className="relative aspect-[16/9] min-w-0 overflow-hidden bg-muted lg:aspect-auto lg:min-h-96"
        >
          {image ? (
            <Image
              src={image}
              alt=""
              fill
              sizes="(max-width: 1024px) 100vw, 46vw"
              loading="eager"
              unoptimized={image.startsWith("http://") || image.startsWith("https://")}
              className="object-cover"
            />
          ) : (
            <div aria-hidden="true" className="absolute inset-0 flex items-center justify-center text-muted-foreground/50">
              <CalendarDays size={72} strokeWidth={1} />
            </div>
          )}
        </div>

        <div
          data-slot="promotion-campaign-content"
          className="flex min-w-0 flex-col justify-center border-t-4 border-highlight-yellow bg-card p-6 sm:p-8 lg:border-l-4 lg:border-t-0 lg:p-10"
        >
          <p className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.2em] text-primary">
            <Sparkles size={14} className="text-highlight-yellow" />
            {t("ui.promotionCampaigns.homeEyebrow")}
          </p>

          {displayCampaign ? (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${live ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-900"}`}>
                  {t(live ? "ui.promotionCampaigns.live" : "ui.promotionCampaigns.upcoming")}
                </span>
                <span className="text-xs leading-5 text-muted-foreground sm:text-sm">
                  {formatDateTime(displayCampaign.startsAt, locale, { timeZone: "Asia/Kuala_Lumpur" })}
                  {" – "}
                  {formatDateTime(displayCampaign.endsAt, locale, { timeZone: "Asia/Kuala_Lumpur" })}
                </span>
              </div>
              <h2
                id="promotion-campaign-spotlight-title"
                className="mt-4 break-words font-[family-name:var(--font-display)] text-2xl font-bold leading-tight tracking-tight text-foreground sm:text-3xl xl:text-4xl"
              >
                {displayCampaign.title}
              </h2>
              <p className="mt-3 max-w-2xl break-words text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
                {displayCampaign.summary}
              </p>
              <p className="mt-4 text-sm font-semibold text-primary/75">
                {t("ui.promotionCampaigns.offerCount", { count: displayCampaign.offers.length })}
              </p>
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

          <div data-slot="promotion-campaign-actions" className="mt-7 flex w-full flex-wrap items-center justify-start gap-2 sm:gap-3">
            {displayCampaign && (
              <Button asChild className="min-h-11 rounded-full bg-highlight-yellow px-5 font-bold text-highlight-yellow-foreground hover:bg-highlight-yellow/85">
                <Link href={`/customer/events/${encodeURIComponent(displayCampaign.slug)}`}>
                  {t("ui.promotionCampaigns.exploreCampaign")} <ArrowRight size={15} />
                </Link>
              </Button>
            )}
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
            <Button
              asChild
              variant={displayCampaign ? "ghost" : "default"}
              className={displayCampaign
                ? "min-h-11 rounded-full px-4 font-semibold text-primary hover:bg-primary/5 hover:text-primary"
                : "min-h-11 rounded-full bg-highlight-yellow px-5 font-bold text-highlight-yellow-foreground hover:bg-highlight-yellow/85"}
            >
              <Link href="/customer/events">
                {t("ui.promotionCampaigns.allCampaigns")} <ArrowRight size={15} />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
