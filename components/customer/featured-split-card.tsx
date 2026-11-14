import Link from "next/link";
import type { MouseEventHandler, ReactNode, Ref } from "react";
import { CardMediaHoverCaption } from "@/components/customer/card-media-hover-caption";

type FeaturedSplitCardProps = {
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
  layout?: "split" | "stacked";
  className?: string;
};

export function FeaturedSplitCard({
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
  layout = "split",
  className = "",
}: FeaturedSplitCardProps) {
  const isStacked = layout === "stacked";
  const gridClassName = isStacked
    ? "grid min-h-0 w-full grid-cols-1"
    : "grid min-h-[320px] w-full grid-cols-1 md:min-h-[410px] md:grid-cols-[52%_48%]";
  const content = (
    <>
      <div
        data-slot={mediaSlot}
        className={`${isStacked
          ? "relative aspect-[1.4] min-w-0 overflow-hidden bg-secondary"
          : "relative aspect-[16/9] min-w-0 overflow-hidden bg-secondary min-h-60 md:aspect-auto md:min-h-[410px]"} ${mediaClassName}`}
      >
        {media}
        {mediaCaption != null && <CardMediaHoverCaption>{mediaCaption}</CardMediaHoverCaption>}
      </div>
      <div
        data-slot={contentSlot}
        className={`${isStacked
          ? "flex min-h-[250px] min-w-0 flex-col px-4 py-4 sm:px-5 sm:py-5"
          : "flex min-w-0 flex-col px-6 py-8 sm:px-8 sm:py-9 min-h-[300px] md:min-h-[410px] md:px-12 md:py-11"} ${contentClassName}`}
      >
        {children}
      </div>
    </>
  );

  const card = (
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

  return className ? <div className={className}>{card}</div> : card;
}
