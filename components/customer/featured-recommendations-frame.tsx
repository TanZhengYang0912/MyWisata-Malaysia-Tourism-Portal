"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

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
  action,
  clip = true,
  children,
}: FeaturedRecommendationsFrameProps) {
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

  function selectSlide(index: number) {
    onSelectSlide(index);
    setAutoplayEpoch((epoch) => epoch + 1);
  }

  return (
    <>
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>}
          <h2 id={headingId} className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
            {title}
          </h2>
          {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>

      <div
        className="w-full"
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
          <div role="group" aria-label={carouselLabel} className="mt-3 flex justify-center">
            {Array.from({ length: slideCount }, (_, index) => {
              const isActive = activeSlideIndex === index;
              return (
                <button
                  key={index}
                  type="button"
                  aria-label={slideLabel(index + 1, slideCount)}
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => selectSlide(index)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <span
                    aria-hidden="true"
                    className={`block h-1.5 rounded-full transition-[width,background-color] duration-200 motion-reduce:transition-none ${isActive ? "w-3.5 bg-primary" : "w-1.5 bg-muted-foreground/35"}`}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
