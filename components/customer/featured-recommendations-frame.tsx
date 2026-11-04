import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

type FeaturedRecommendationsFrameProps = {
  headingId: string;
  eyebrow: ReactNode;
  title: ReactNode;
  description: ReactNode;
  carouselLabel: string;
  previousLabel: string;
  nextLabel: string;
  carouselTestId: string;
  hasMultipleSlides: boolean;
  onPrevious: () => void;
  onNext: () => void;
  action?: ReactNode;
  children: ReactNode;
};

export function FeaturedRecommendationsFrame({
  headingId,
  eyebrow,
  title,
  description,
  carouselLabel,
  previousLabel,
  nextLabel,
  carouselTestId,
  hasMultipleSlides,
  onPrevious,
  onNext,
  action,
  children,
}: FeaturedRecommendationsFrameProps) {
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
        data-testid={carouselTestId}
        className="group/carousel relative w-full overflow-hidden rounded-[28px]"
        aria-roledescription={carouselLabel}
      >
        {children}
        {hasMultipleSlides && (
          <>
            <button
              type="button"
              aria-label={previousLabel}
              onClick={onPrevious}
              className="absolute left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-background/90 text-primary opacity-100 shadow-lg backdrop-blur transition-[opacity,transform,border-color] hover:scale-105 hover:border-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 sm:left-5 md:opacity-0 md:group-hover/carousel:opacity-100 md:group-focus-within/carousel:opacity-100"
            >
              <ArrowLeft size={17} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={nextLabel}
              onClick={onNext}
              className="absolute right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/60 bg-background/90 text-primary opacity-100 shadow-lg backdrop-blur transition-[opacity,transform,border-color] hover:scale-105 hover:border-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25 sm:right-5 md:opacity-0 md:group-hover/carousel:opacity-100 md:group-focus-within/carousel:opacity-100"
            >
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </>
  );
}
