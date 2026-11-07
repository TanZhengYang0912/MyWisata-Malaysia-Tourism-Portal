"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, Building2, MapPin } from "lucide-react";
import type { DiscoveryResult } from "@/backend/core/types";
import type { FeaturedEventPromotion } from "@/lib/customer/event-promotions";
import { getOptionalDiscoveryCategoryLabelKey } from "@/lib/customer/discovery-categories";
import { ReferencePrice } from "@/components/shared/reference-price";
import { OperatingHoursSummary } from "@/components/customer/operating-hours-summary";
import { FeaturedSplitCard } from "@/components/customer/featured-split-card";
import { FeaturedRecommendationsFrame } from "@/components/customer/featured-recommendations-frame";
import { formatDate } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";
import { LocalizedContent } from "@/components/customer/localized-content";

function placementIdFor(advertisement: DiscoveryResult): string | null {
  return advertisement.sponsorship?.placementId ?? null;
}

// Vendor-submitted event promotions render as slides in this same carousel
// (not a separate rail) so they share one "Featured recommendations" surface
// with sponsored ads — same card chrome, same autoplay/nav, just a different
// content template per slide kind.
type Slide =
  | { kind: "ad"; id: string; ad: DiscoveryResult }
  | { kind: "event"; id: string; event: FeaturedEventPromotion };

export function SponsoredPartnerRail({ advertisements, eventPromotions = [] }: { advertisements: DiscoveryResult[]; eventPromotions?: FeaturedEventPromotion[] }) {
  const { t, i18n } = useTranslation("customer");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const articleRef = useRef<HTMLElement | null>(null);
  const movementDirection = useRef<-1 | 1>(1);
  const impressedPlacementIds = useRef(new Set<string>());

  const eligibleAdvertisements = useMemo(
    () => advertisements.filter((advertisement) => placementIdFor(advertisement) !== null),
    [advertisements],
  );

  const slides = useMemo<Slide[]>(() => [
    ...eventPromotions.map((event): Slide => ({ kind: "event", id: `event-${event.id}`, event })),
    ...eligibleAdvertisements.map((ad): Slide => ({ kind: "ad", id: `ad-${placementIdFor(ad)}`, ad })),
  ], [eventPromotions, eligibleAdvertisements]);

  const slideIds = useMemo(() => slides.map((slide) => slide.id), [slides]);
  const slideSignature = slideIds.join("|");
  const [activeSlideId, setActiveSlideId] = useState<string | null>(() => slideIds[0] ?? null);
  const [previousSlideSignature, setPreviousSlideSignature] = useState(slideSignature);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  if (previousSlideSignature !== slideSignature) {
    setPreviousSlideSignature(slideSignature);
    if (!activeSlideId || !slideIds.includes(activeSlideId)) {
      setActiveSlideId(slideIds[0] ?? null);
    }
  }

  const requestedActiveIndex = slides.findIndex((slide) => slide.id === activeSlideId);
  const normalizedActiveIndex = requestedActiveIndex >= 0 ? requestedActiveIndex : 0;
  const activeSlide = slides[normalizedActiveIndex] ?? null;

  const recordEvent = useCallback((advertisement: DiscoveryResult, eventType: "impression" | "click") => {
    const placementId = placementIdFor(advertisement);
    if (!placementId) return;

    void fetch(`/api/sponsored-placements/${placementId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, productId: advertisement.id }),
      keepalive: true,
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = (event: MediaQueryListEvent | MediaQueryList) => {
      setPrefersReducedMotion(event.matches);
    };
    updatePreference(mediaQuery);
    mediaQuery.addEventListener("change", updatePreference);
    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  const moveBy = useCallback((direction: -1 | 1) => {
    movementDirection.current = direction;
    setActiveSlideId((currentSlideId) => {
      const count = slides.length;
      if (count === 0) return null;
      const currentIndex = slides.findIndex((slide) => slide.id === currentSlideId);
      const normalizedCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (normalizedCurrentIndex + direction + count) % count;
      return slides[nextIndex].id;
    });
  }, [slides]);

  const moveTo = useCallback((index: number) => {
    if (index < 0 || index >= slides.length) return;
    movementDirection.current = index >= normalizedActiveIndex ? 1 : -1;
    setActiveSlideId(slides[index].id);
  }, [normalizedActiveIndex, slides]);

  useEffect(() => {
    if (!activeSlide || activeSlide.kind !== "ad" || typeof IntersectionObserver === "undefined") return;
    const article = articleRef.current;
    const placementId = placementIdFor(activeSlide.ad);
    if (!article || !placementId) return;

    const observer = new IntersectionObserver((entries) => {
      if (
        entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5)
        && !impressedPlacementIds.current.has(placementId)
      ) {
        impressedPlacementIds.current.add(placementId);
        recordEvent(activeSlide.ad, "impression");
      }
    }, { threshold: 0.5 });

    observer.observe(article);
    return () => observer.disconnect();
  }, [activeSlide, recordEvent]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article || prefersReducedMotion || typeof article.animate !== "function") return;
    const animation = article.animate([
      { opacity: 0, transform: `translateX(${movementDirection.current * 20}px)` },
      { opacity: 1, transform: "translateX(0)" },
    ], { duration: 360, easing: "ease-out" });
    return () => animation.cancel();
  }, [activeSlide, prefersReducedMotion]);

  const moveNext = useCallback(() => moveBy(1), [moveBy]);

  if (!activeSlide) return null;

  return (
    <section
      className="border-b border-border bg-secondary/25"
      aria-labelledby="featured-partner-heading"
    >
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-6 sm:px-6 lg:px-8">
        <FeaturedRecommendationsFrame
          headingId="featured-partner-heading"
          eyebrow={t("ui.labels.featured")}
          title={t("ui.search.featuredRecommendations")}
          description={null}
          carouselLabel={t("ui.search.featuredCarousel")}
          slideLabel={(page, total) => t("ui.accessibility.carouselSlide", { page, total })}
          carouselTestId="sponsored-partner-rail"
          activeSlideIndex={normalizedActiveIndex}
          slideCount={slides.length}
          onSelectSlide={moveTo}
          onNext={moveNext}
        >
          {activeSlide.kind === "event" ? (
            <FeaturedSplitCard
              key={activeSlide.id}
              articleRef={articleRef}
              href={`/customer/event-promotions/${activeSlide.event.id}`}
              media={(
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={activeSlide.event.posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                </>
              )}
            >
              <h3 className="break-words whitespace-normal font-[family-name:var(--font-display)] text-3xl font-bold leading-tight text-foreground lg:text-4xl">
                <LocalizedContent entityType="vendor_event_promotion" entityId={activeSlide.event.id} field="title" sourceText={activeSlide.event.title} />
              </h3>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
                <span className="inline-flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                    {t("ui.labels.featured")}
                  </span>
                  <span>
                    {activeSlide.event.startDate === activeSlide.event.endDate
                      ? formatDate(activeSlide.event.startDate, locale)
                      : `${formatDate(activeSlide.event.startDate, locale)} – ${formatDate(activeSlide.event.endDate, locale)}`}
                  </span>
                </span>
                <span className="inline-flex min-w-0 items-center gap-2 font-semibold text-foreground">
                  <Building2 size={16} className="shrink-0" aria-hidden="true" />
                  {t("ui.search.providedBy", { vendor: activeSlide.event.vendorName })}
                </span>
              </div>
              <span className="mt-auto inline-flex items-center gap-1.5 pt-8 text-sm font-bold text-primary">
                {t("ui.actions.viewDetails")} <ArrowRight size={16} aria-hidden="true" />
              </span>
            </FeaturedSplitCard>
          ) : (() => {
            const ad = activeSlide.ad;
            const placementId = placementIdFor(ad);
            if (!placementId) return null;
            const productImage = ad.image?.trim() || null;
            const image = productImage || ad.outlet.coverUrl?.trim() || null;
            const imageAlt = productImage ? ad.name : ad.outlet.name;
            const location = [ad.outlet.city, ad.outlet.state].filter(Boolean).join(", ");
            const categoryKey = getOptionalDiscoveryCategoryLabelKey(ad.categorySlug);
            return (
              <FeaturedSplitCard
                key={activeSlide.id}
                articleRef={articleRef}
                dataPlacementId={placementId}
                href={`/customer/products/${ad.id}`}
                onClick={() => recordEvent(ad, "click")}
                media={(
                  <>
                    {image && <>
                      {/* Prefer the product cover; use outlet media only when it is missing. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={image} alt={imageAlt} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                    </>}
                  </>
                )}
              >
                <h3 className="break-words whitespace-normal font-[family-name:var(--font-display)] text-3xl font-bold leading-tight text-foreground lg:text-4xl">
                  {ad.name}
                </h3>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
                  <span className="inline-flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200">
                      {t("ui.labels.featured")}
                    </span>
                    <span className="font-semibold text-primary">{categoryKey ? t(categoryKey) : ad.category}</span>
                  </span>
                  <ReferencePrice amountMYR={Number(ad.price)} className="shrink-0 text-base font-bold text-foreground" />
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                  <span className="inline-flex min-w-0 items-start gap-2 break-words whitespace-normal">
                    <Building2 size={16} className="shrink-0" aria-hidden="true" />
                    {t("ui.search.providedBy", { vendor: ad.outlet.vendorName })}
                  </span>
                  {location && <span className="inline-flex min-w-0 items-start gap-2 break-words whitespace-normal"><MapPin size={15} className="mt-0.5 shrink-0" aria-hidden="true" />{location}</span>}
                </div>
                {ad.outlet.operatingHours ? <div className="mt-4"><OperatingHoursSummary hours={ad.outlet.operatingHours} currentlyOpen={ad.outlet.currentlyOpen ?? ad.outlet.open} /></div> : ad.outlet.hours && <p className="mt-4 text-sm text-muted-foreground"><span className="font-semibold text-foreground">{t("ui.labels.operatingHours")}:</span> {ad.outlet.hours}</p>}
                <span className="mt-auto inline-flex items-center gap-1.5 pt-8 text-sm font-bold text-primary">
                  {t("ui.actions.viewDetails")} <ArrowRight size={16} aria-hidden="true" />
                </span>
              </FeaturedSplitCard>
            );
          })()}

        </FeaturedRecommendationsFrame>
      </div>
    </section>
  );
}
