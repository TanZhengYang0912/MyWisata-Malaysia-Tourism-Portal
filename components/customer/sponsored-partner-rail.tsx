"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, Building2, MapPin } from "lucide-react";
import type { DiscoveryResult } from "@/backend/core/types";
import { getPlaceActivityImage } from "@/lib/customer/place-activity";
import { getOptionalDiscoveryCategoryLabelKey } from "@/lib/customer/discovery-categories";
import { formatMYR } from "@/lib/i18n/format";

function placementIdFor(advertisement: DiscoveryResult): string | null {
  return advertisement.sponsorship?.placementId ?? null;
}

const AUTOPLAY_INTERVAL_MS = 3000;

export function SponsoredPartnerRail({ advertisements }: { advertisements: DiscoveryResult[] }) {
  const { t } = useTranslation("customer");
  const articleRef = useRef<HTMLElement | null>(null);
  const movementDirection = useRef<-1 | 1>(1);
  const impressedPlacementIds = useRef(new Set<string>());
  const eligibleAdvertisements = useMemo(
    () => advertisements.filter((advertisement) => placementIdFor(advertisement) !== null),
    [advertisements],
  );
  const eligiblePlacementIds = useMemo(
    () => eligibleAdvertisements.map((advertisement) => placementIdFor(advertisement) as string),
    [eligibleAdvertisements],
  );
  const placementSignature = eligiblePlacementIds.join("|");
  const [activePlacementId, setActivePlacementId] = useState<string | null>(
    () => eligiblePlacementIds[0] ?? null,
  );
  const [previousPlacementSignature, setPreviousPlacementSignature] = useState(placementSignature);
  const [isPointerPaused, setIsPointerPaused] = useState(false);
  const [isFocusPaused, setIsFocusPaused] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [autoplayEpoch, setAutoplayEpoch] = useState(0);

  if (previousPlacementSignature !== placementSignature) {
    setPreviousPlacementSignature(placementSignature);
    if (!activePlacementId || !eligiblePlacementIds.includes(activePlacementId)) {
      setActivePlacementId(eligiblePlacementIds[0] ?? null);
    }
  }

  const requestedActiveIndex = eligibleAdvertisements.findIndex(
    (advertisement) => placementIdFor(advertisement) === activePlacementId,
  );
  const normalizedActiveIndex = requestedActiveIndex >= 0 ? requestedActiveIndex : 0;
  const activeAdvertisement = eligibleAdvertisements[normalizedActiveIndex] ?? null;

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
    const updateVisibility = () => setIsDocumentVisible(document.visibilityState === "visible");
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => document.removeEventListener("visibilitychange", updateVisibility);
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

  const moveBy = useCallback((direction: -1 | 1, manual = false) => {
    movementDirection.current = direction;
    setActivePlacementId((currentPlacementId) => {
      const count = eligibleAdvertisements.length;
      if (count === 0) return null;
      const currentIndex = eligibleAdvertisements.findIndex(
        (advertisement) => placementIdFor(advertisement) === currentPlacementId,
      );
      const normalizedCurrentIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = (normalizedCurrentIndex + direction + count) % count;
      return placementIdFor(eligibleAdvertisements[nextIndex]);
    });
    if (manual) setAutoplayEpoch((current) => current + 1);
  }, [eligibleAdvertisements]);

  useEffect(() => {
    if (
      eligibleAdvertisements.length < 2
      || isPointerPaused
      || isFocusPaused
      || !isDocumentVisible
      || prefersReducedMotion
    ) return;

    const intervalId = setInterval(() => moveBy(1), AUTOPLAY_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [
    autoplayEpoch,
    eligibleAdvertisements.length,
    isDocumentVisible,
    isFocusPaused,
    isPointerPaused,
    moveBy,
    prefersReducedMotion,
  ]);

  useEffect(() => {
    if (!activeAdvertisement || typeof IntersectionObserver === "undefined") return;
    const article = articleRef.current;
    const placementId = placementIdFor(activeAdvertisement);
    if (!article || !placementId) return;

    const observer = new IntersectionObserver((entries) => {
      if (
        entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5)
        && !impressedPlacementIds.current.has(placementId)
      ) {
        impressedPlacementIds.current.add(placementId);
        recordEvent(activeAdvertisement, "impression");
      }
    }, { threshold: 0.5 });

    observer.observe(article);
    return () => observer.disconnect();
  }, [activeAdvertisement, recordEvent]);

  useEffect(() => {
    const article = articleRef.current;
    if (!article || prefersReducedMotion || typeof article.animate !== "function") return;
    const animation = article.animate([
      { opacity: 0, transform: `translateX(${movementDirection.current * 20}px)` },
      { opacity: 1, transform: "translateX(0)" },
    ], { duration: 360, easing: "ease-out" });
    return () => animation.cancel();
  }, [activeAdvertisement, prefersReducedMotion]);

  if (!activeAdvertisement) return null;

  const placementId = placementIdFor(activeAdvertisement);
  if (!placementId) return null;
  const image = getPlaceActivityImage(activeAdvertisement);
  const location = [activeAdvertisement.outlet.city, activeAdvertisement.outlet.state].filter(Boolean).join(", ");
  const categoryKey = getOptionalDiscoveryCategoryLabelKey(activeAdvertisement.categorySlug);
  const hasMultipleAdvertisements = eligibleAdvertisements.length > 1;

  return (
    <section
      className="border-b border-border bg-secondary/25"
      aria-labelledby="sponsored-partner-heading"
      onMouseEnter={() => setIsPointerPaused(true)}
      onMouseLeave={() => setIsPointerPaused(false)}
      onFocusCapture={() => setIsFocusPaused(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsFocusPaused(false);
      }}
    >
      <div className="mx-auto max-w-7xl px-4 pb-8 pt-6 sm:px-6 lg:px-8">
        <div className="mb-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t("ui.labels.sponsored")}</p>
            <h2 id="sponsored-partner-heading" className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
              {t("ui.search.sponsoredRecommendations")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("ui.search.sponsoredDescription")}</p>
          </div>
        </div>

        <div
          data-testid="sponsored-partner-rail"
          className="group/carousel relative w-full overflow-hidden rounded-[28px] border border-border bg-card shadow-sm"
          aria-roledescription={t("ui.search.sponsoredCarousel")}
        >
          <article
            key={placementId}
            ref={articleRef}
            data-placement-id={placementId}
            className="group w-full overflow-hidden bg-card"
          >
            <Link
              href={`/customer/activity/${activeAdvertisement.id}`}
              onClick={() => recordEvent(activeAdvertisement, "click")}
              className="grid min-h-[320px] w-full focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-primary/20 md:grid-cols-[52%_48%]"
            >
              <div className="relative min-h-60 overflow-hidden bg-secondary md:min-h-[340px]">
                {/* Product images come from the existing trusted activity image presenter. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image} alt={activeAdvertisement.name} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                <span className="absolute left-5 top-5 rounded-full bg-amber-400 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] text-slate-950 shadow-sm">
                  {t("ui.labels.sponsored")}
                </span>
                <span className="absolute bottom-5 left-5 inline-flex items-center gap-1.5 text-sm font-semibold text-white">
                  <MapPin size={15} aria-hidden="true" /> {location}
                </span>
              </div>
              <div className="flex min-h-[300px] flex-col px-8 py-9 md:min-h-[340px] md:px-12 md:py-11">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">
                  {categoryKey ? t(categoryKey) : activeAdvertisement.category}
                </p>
                <h3 className="mt-3 line-clamp-2 font-[family-name:var(--font-display)] text-3xl font-bold leading-tight text-foreground lg:text-4xl">
                  {activeAdvertisement.name}
                </h3>
                <p className="mt-4 line-clamp-3 max-w-xl text-base leading-7 text-muted-foreground">{activeAdvertisement.description}</p>
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
                  <span className="inline-flex min-w-0 items-center gap-2 truncate">
                    <Building2 size={16} className="shrink-0" aria-hidden="true" />
                    {t("ui.search.providedBy", { vendor: activeAdvertisement.outlet.vendorName })}
                  </span>
                  <span className="shrink-0 text-base font-bold text-foreground">{formatMYR(Number(activeAdvertisement.price))}</span>
                </div>
                <span className="mt-auto inline-flex items-center gap-1.5 pt-8 text-sm font-bold text-primary">
                  {t("ui.actions.viewDetails")} <ArrowRight size={16} aria-hidden="true" />
                </span>
              </div>
            </Link>
          </article>

          {hasMultipleAdvertisements ? (
            <>
            <button
              type="button"
              aria-label={t("ui.search.previousAdvertisement")}
              onClick={() => moveBy(-1, true)}
              className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-background/90 text-primary opacity-100 shadow-lg backdrop-blur transition-[opacity,transform,border-color] hover:scale-105 hover:border-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 sm:left-5 md:opacity-0 md:group-hover/carousel:opacity-100 md:group-focus-within/carousel:opacity-100"
            >
              <ArrowLeft size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={t("ui.search.nextAdvertisement")}
              onClick={() => moveBy(1, true)}
              className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-background/90 text-primary opacity-100 shadow-lg backdrop-blur transition-[opacity,transform,border-color] hover:scale-105 hover:border-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 sm:right-5 md:opacity-0 md:group-hover/carousel:opacity-100 md:group-focus-within/carousel:opacity-100"
            >
              <ArrowRight size={17} aria-hidden="true" />
            </button>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
