"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { HomeDestinationWormIndicator } from "@/components/customer/home-destination-worm-indicator";
import { useHomeDestinationPager } from "@/components/customer/use-home-destination-pager";

const ARROW_CLASS = "inline-flex h-10 w-8 items-center justify-center text-primary transition-[color,transform] duration-150 hover:text-accent active:scale-[0.85] active:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 disabled:cursor-not-allowed disabled:text-primary/20 disabled:active:scale-100";
// From 1360px the arrows sit outside the cards at the photo's middle: one card is (100cqw - 5rem) / 4 wide and its photo is 1.3:1.
const SIDE_ARROW_CLASS = "min-[1360px]:absolute min-[1360px]:top-[calc((100cqw-5rem)/4/2.6)] min-[1360px]:-translate-y-1/2";

/**
 * A row of CardFrame cards paged 2 (phone/tablet) or 4 (desktop) at a time, with < > arrows and the dots worm.
 * The track styles live in globals.css (.mw-card-carousel); a page is exactly the track's width, as the pager expects.
 */
export function CardCarousel({
  label,
  children,
  onPageView,
}: {
  /** Accessible name of the scroll area and the worm group (pass the section title). */
  label: string;
  children: ReactNode[];
  /** Called once a page has stayed put for 300ms (and on mount): first visible index and how many fit on a page. */
  onPageView?: (firstIndex: number, perPage: number) => void;
}) {
  const { t } = useTranslation("customer");
  const trackRef = useRef<HTMLDivElement>(null);
  const { page, pageCount, progress, goToPage } = useHomeDestinationPager(trackRef, { verticalWheel: false });
  const onPageViewRef = useRef(onPageView);
  useEffect(() => {
    onPageViewRef.current = onPageView;
  });
  // A page only counts as seen once scrolling has stopped on it, so pages passed on the way are not recorded.
  useEffect(() => {
    const id = window.setTimeout(() => {
      const perPage = typeof window.matchMedia === "function" && window.matchMedia("(min-width: 1024px)").matches ? 4 : 2;
      onPageViewRef.current?.(page * perPage, perPage);
    }, 300);
    return () => window.clearTimeout(id);
  }, [page]);

  const paged = pageCount > 1;

  return (
    <div className="relative @container">
      <div ref={trackRef} className="mw-card-carousel" tabIndex={0} aria-label={label}>
        {children.map((child, index) => <div key={index}>{child}</div>)}
      </div>
      {paged && (
        <div className="mt-3 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => goToPage(page - 1)}
            disabled={page <= 0}
            aria-label={t("accessibility.previousPage", { ns: "common" })}
            className={`${ARROW_CLASS} ${SIDE_ARROW_CLASS} min-[1360px]:-left-11`}
          >
            <ChevronLeft size={24} aria-hidden="true" />
          </button>
          <HomeDestinationWormIndicator
            appearance="dots"
            count={pageCount}
            progress={progress}
            current={page}
            sizes={{ dot: 6, pill: 14, gap: 18 }}
            label={label}
            pageLabel={(p, c) => t("ui.home.destinationPage", { page: p, total: c })}
            onSelect={goToPage}
          />
          <button
            type="button"
            onClick={() => goToPage(page + 1)}
            disabled={page >= pageCount - 1}
            aria-label={t("accessibility.nextPage", { ns: "common" })}
            className={`${ARROW_CLASS} ${SIDE_ARROW_CLASS} min-[1360px]:-right-11`}
          >
            <ChevronRight size={24} aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
