import Link from "next/link";
import type { MouseEventHandler, ReactNode, Ref } from "react";
import { CardMediaHoverCaption } from "@/components/customer/card-media-hover-caption";

type FeaturedSplitCardProps = {
  variant?: "split" | "event-pass";
  endContent?: ReactNode;
  media: ReactNode;
  mediaCaption?: ReactNode;
  children: ReactNode;
  href?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
  articleRef?: Ref<HTMLElement>;
  dataPlacementId?: string;
  mediaSlot?: string;
  contentSlot?: string;
  mediaClassName?: string;
  contentClassName?: string;
};

export function FeaturedSplitCard({
  variant = "split",
  endContent,
  media,
  mediaCaption,
  children,
  href,
  onClick,
  articleRef,
  dataPlacementId,
  mediaSlot,
  contentSlot,
  mediaClassName = "",
  contentClassName = "",
}: FeaturedSplitCardProps) {
  const gridClassName = variant === "event-pass"
    ? "grid w-full grid-cols-1 lg:min-h-[310px] lg:grid-cols-[44%_minmax(0,1fr)_9rem]"
    : "grid min-h-[320px] w-full grid-cols-1 md:min-h-[410px] md:grid-cols-[52%_48%]";
  const content = (
    <>
      <div
        data-slot={mediaSlot}
        className={`relative aspect-[16/9] min-w-0 overflow-hidden bg-secondary ${variant === "event-pass" ? "lg:aspect-auto lg:min-h-[310px]" : "min-h-60 md:aspect-auto md:min-h-[410px]"} ${mediaClassName}`}
      >
        {media}
        {mediaCaption != null && <CardMediaHoverCaption>{mediaCaption}</CardMediaHoverCaption>}
      </div>
      <div
        data-slot={contentSlot}
        className={`flex min-w-0 flex-col px-6 py-8 sm:px-8 sm:py-9 ${variant === "event-pass" ? "lg:min-h-[310px]" : "min-h-[300px] md:min-h-[410px] md:px-12 md:py-11"} ${contentClassName}`}
      >
        {children}
      </div>
      {/* Ticket stub: the two circles are clipped by the card to read as punched notches. */}
      {variant === "event-pass" && <div data-slot="featured-end" className="relative flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-border bg-secondary/30 px-6 py-5 before:absolute before:-left-3 before:-top-3 before:h-6 before:w-6 before:rounded-full before:border before:border-border before:bg-background before:content-[''] after:absolute after:-right-3 after:-top-3 after:h-6 after:w-6 after:rounded-full after:border after:border-border after:bg-background after:content-[''] lg:flex-col lg:justify-center lg:gap-6 lg:border-l lg:border-t-0 lg:p-5 lg:after:-bottom-3 lg:after:-left-3 lg:after:right-auto lg:after:top-auto">{endContent}</div>}
    </>
  );

  return (
    <article
      ref={articleRef}
      data-placement-id={dataPlacementId}
      className="group w-full overflow-hidden rounded-[28px] border border-border bg-card text-card-foreground shadow-sm"
    >
      {href ? (
        <Link
          href={href}
          onClick={onClick}
          className={`${gridClassName} focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-primary/20`}
        >
          {content}
        </Link>
      ) : (
        <div className={gridClassName}>{content}</div>
      )}
    </article>
  );
}
