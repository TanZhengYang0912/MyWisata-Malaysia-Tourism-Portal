"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ARROW_CLASS } from "@/components/customer/card-carousel";
import { CustomerSectionHeader } from "@/components/customer/customer-page-shell";
import { HomeDestinationWormIndicator } from "@/components/customer/home-destination-worm-indicator";

type FeaturedRecommendationsFrameProps = {
  headingId: string;
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
  carouselLabel: string;
  slideLabel: (page: number, total: number) => string;
  carouselTestId: string;
  activeSlideIndex: number;
  slideCount: number;
  onSelectSlide: (index: number) => void;
  onNext: () => void;
  onPrevious: () => void;
  action?: ReactNode;
  /** Clip slides to the rounded frame. The home campaign envelope turns this off so its letter can float out. */
  clip?: boolean;
  children: ReactNode;
};

const AUTOPLAY_INTERVAL_MS = 5000;

export function FeaturedRecommendationsFrame({
  headingId,
  eyebrow,
  title,
  description,
  carouselLabel,
  slideLabel,
  carouselTestId,
  activeSlideIndex,
  slideCount,
  onSelectSlide,
  onNext,
  onPrevious,
  action,
  clip = true,
  children,
}: FeaturedRecommendationsFrameProps) {
  const { t } = useTranslation("common");
  const [isPointerPaused, setIsPointerPaused] = useState(false);
  const [isFocusPaused, setIsFocusPaused] = useState(false);
  const [isDocumentVisible, setIsDocumentVisible] = useState(
    () => typeof document === "undefined" || document.visibilityState === "visible",
  );
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
  const [autoplayEpoch, setAutoplayEpoch] = useState(0);
  const hasMultipleSlides = slideCount > 1;

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

  useEffect(() => {
    if (
      !hasMultipleSlides
      || isPointerPaused
      || isFocusPaused
      || !isDocumentVisible
      || prefersReducedMotion
    ) return;

    const intervalId = window.setInterval(onNext, AUTOPLAY_INTERVAL_MS);
    return () => window.clearInterval(intervalId);
  }, [
    autoplayEpoch,
    hasMultipleSlides,
    isDocumentVisible,
    isFocusPaused,
    isPointerPaused,
    onNext,
    prefersReducedMotion,
  ]);

  // Any manual move restarts the autoplay countdown.
  function selectSlide(index: number) {
    onSelectSlide(index);
    setAutoplayEpoch((epoch) => epoch + 1);
  }

  function step(move: () => void) {
    move();
    setAutoplayEpoch((epoch) => epoch + 1);
  }

  return (
    <>
      <CustomerSectionHeader id={headingId} eyebrow={eyebrow} title={title} action={action}>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </CustomerSectionHeader>

      <div
        className="relative w-full"
        onMouseEnter={() => setIsPointerPaused(true)}
        onMouseLeave={() => setIsPointerPaused(false)}
        onFocusCapture={() => setIsFocusPaused(true)}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsFocusPaused(false);
        }}
      >
        <div
          data-testid={carouselTestId}
          className={`group/carousel relative w-full rounded-[28px] ${clip ? "overflow-hidden" : ""}`}
          aria-roledescription={carouselLabel}
        >
          {children}
        </div>
        {hasMultipleSlides && (
          // Same controls as CardCarousel. From 1360px the arrows sit beside the slide at its middle: the row
          // under it then holds only the 24px worm after a 12px gap, so the slide is the wrapper minus 36px.
          <div className="mt-3 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => step(onPrevious)}
              aria-label={t("accessibility.previousPage")}
              className={`${ARROW_CLASS} min-[1360px]:absolute min-[1360px]:top-[calc((100%-36px)/2)] min-[1360px]:-translate-y-1/2 min-[1360px]:-left-11`}
            >
              <ChevronLeft size={24} aria-hidden="true" />
            </button>
            <HomeDestinationWormIndicator
              appearance="dots"
              count={slideCount}
              progress={activeSlideIndex}
              current={activeSlideIndex}
              sizes={{ dot: 6, pill: 14, gap: 18 }}
              label={carouselLabel}
              pageLabel={slideLabel}
              onSelect={selectSlide}
            />
            <button
              type="button"
              onClick={() => step(onNext)}
              aria-label={t("accessibility.nextPage")}
              className={`${ARROW_CLASS} min-[1360px]:absolute min-[1360px]:top-[calc((100%-36px)/2)] min-[1360px]:-translate-y-1/2 min-[1360px]:-right-11`}
            >
              <ChevronRight size={24} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}
