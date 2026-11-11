"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { MapPin } from "lucide-react";

/**
 * The look shared by every discovery card (product, vendor, outlet, place activity): photo with
 * top-right actions and a rating, a meta line, a two-line title and a footer. The whole card links
 * through the title (a stretched link); the action buttons sit above it, so save and share never
 * navigate. No box: the text sits on the page under a 6px-rounded photo, and the last row sits under a hairline.
 * Desktop hover zooms the photo to 1.04; there is no drawer.
 * Wrappers (ProductCard, VendorCard, OutletCard, PlaceActivityCard) own their data, links and actions.
 */
export function CardFrame({
  href,
  onNavigate,
  layout = "grid",
  imageUrl,
  imageAlt,
  fallback,
  topLeft,
  brandMark,
  actions,
  rating,
  meta,
  title,
  titleControl,
  description,
  info,
  footer,
  className = "",
  ...dataProps
}: {
  /** Left out for items with no detail page (the card is then not a link). */
  href?: string;
  onNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
  /** grid: photo on top. place: photo left (45%, 4:3) from md up, stacked below. */
  layout?: "grid" | "place";
  imageUrl?: string | null;
  imageAlt: string;
  /** Shown when there is no photo or it fails to load. */
  fallback?: ReactNode;
  /** A static tag on the photo's top-left corner (e.g. Free Entry, Event partner). */
  topLeft?: ReactNode;
  /** A vendor's logo or initials on the photo's bottom-left corner. */
  brandMark?: ReactNode;
  actions?: ReactNode;
  rating?: ReactNode;
  meta?: ReactNode;
  /** The title text (plain text keeps the native tooltip). */
  title: ReactNode;
  /** Sits beside the title above the card link, e.g. the translation toggle. */
  titleControl?: ReactNode;
  description?: ReactNode;
  info?: ReactNode;
  footer?: ReactNode;
  className?: string;
} & { [key: `data-${string}`]: string | undefined }) {
  const [imageFailed, setImageFailed] = useState(false);
  const src = imageUrl?.trim();
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setImageFailed(false), [src]);
  const place = layout === "place";

  return (
    <article
      {...dataProps}
      data-card-frame={layout}
      className={`group/card relative isolate flex min-w-0 flex-col rounded-[6px] text-foreground has-[[data-card-link]:focus-visible]:outline-[3px] has-[[data-card-link]:focus-visible]:outline-offset-[3px] has-[[data-card-link]:focus-visible]:outline-primary ${place ? "md:grid md:grid-cols-[45%_minmax(0,1fr)] md:items-start" : ""} ${className}`}
    >
      <div className={`relative overflow-hidden rounded-[6px] bg-secondary ${place ? "aspect-[4/3]" : "aspect-[1.3]"}`}>
        {src && !imageFailed
          // eslint-disable-next-line @next/next/no-img-element -- catalogue and vendor media come from runtime-configured storage hosts
          ? <img src={src} alt={imageAlt} loading="lazy" onError={() => setImageFailed(true)} className={`h-full w-full object-cover ${href ? "transition-transform duration-[450ms] ease-out motion-reduce:transition-none [@media(hover:hover)_and_(pointer:fine)]:group-hover/card:scale-[1.04] motion-reduce:group-hover/card:scale-100" : ""}`} />
          : fallback ?? <div role="img" aria-label={imageAlt} className="h-full w-full bg-secondary" />}
        {topLeft && <div className="pointer-events-none absolute left-3 top-3 z-10">{topLeft}</div>}
        {brandMark && <div aria-hidden="true" className="pointer-events-none absolute bottom-[11px] left-3 z-10 grid size-[38px] place-items-center overflow-hidden rounded-[10px] border-[3px] border-background bg-primary text-xs font-bold text-primary-foreground">{brandMark}</div>}
        {actions && <div className="absolute right-3 top-3 z-20 flex flex-col gap-2 max-sm:right-2.5">{actions}</div>}
        {rating && <div className="pointer-events-none absolute bottom-3 right-3 z-10">{rating}</div>}
      </div>
      <div className={`flex min-w-0 flex-1 flex-col pt-3.5 ${place ? "max-sm:pt-3.5 md:pl-6 md:pt-0" : ""}`}>
        {meta && <p className="mb-1 truncate text-xs text-muted-foreground max-sm:text-[11px]">{meta}</p>}
        <div className="flex min-w-0 items-start gap-1">
          <h3
            className="line-clamp-2 h-[2.36em] min-w-0 flex-1 font-[family-name:var(--font-display)] text-[21px] font-semibold leading-[1.18] tracking-[-0.01em] text-primary max-sm:text-base"
            title={typeof title === "string" ? title : undefined}
          >
            {href ? (
              <Link href={href} onClick={onNavigate} data-card-link="" className="after:absolute after:inset-0 after:z-[1] after:rounded-[6px] after:content-[''] focus-visible:outline-none">
                {title}
              </Link>
            ) : title}
          </h3>
          {titleControl && <div className="relative z-20 shrink-0">{titleControl}</div>}
        </div>
        {description && <div className={`mt-2 text-xs leading-[1.65] text-muted-foreground ${place ? "max-sm:text-sm max-sm:leading-[1.7]" : "max-sm:text-[11px]"}`}>{description}</div>}
        {info && (footer ? <div className={`mt-2.5 ${INFO_TEXT}`}>{info}</div> : <LastRow className={INFO_TEXT}>{info}</LastRow>)}
        {footer && <LastRow>{footer}</LastRow>}
      </div>
    </article>
  );
}

const INFO_TEXT = "min-w-0 text-[13px] text-muted-foreground max-sm:text-[11px]";

/** The card's bottom row (footer, or info when there is none): pinned to the bottom under a hairline, so a row of cards lines up. */
function LastRow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className="mt-auto pt-3"><div className={`border-t border-border pt-3 ${className}`}>{children}</div></div>;
}

/** An icon + text line for locations. The pin is for an exact place ("George Town, Penang"); a count of places ("2 Locations") passes the lucide Map icon. */
export function CardLocation({ children, icon = <MapPin size={13} aria-hidden="true" /> }: { children: ReactNode; icon?: ReactNode }) {
  return <span className="flex min-w-0 items-center gap-[5px]"><span className="shrink-0">{icon}</span><span className="truncate">{children}</span></span>;
}

/** Location and Open now / Closed now on one row (vendor and outlet cards); the status is left out when unknown. */
export function CardLocationStatus({ location, icon, open, openLabel, closedLabel }: { location: ReactNode; icon?: ReactNode; open?: boolean; openLabel: string; closedLabel: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2 max-sm:gap-1">
      <CardLocation icon={icon}>{location}</CardLocation>
      {open !== undefined && (
        <span className={`flex shrink-0 items-center gap-[5px] whitespace-nowrap font-semibold max-sm:text-[9px] ${open ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300"}`}>
          <span aria-hidden="true" className="size-[5px] rounded-full bg-current" />
          {open ? openLabel : closedLabel}
        </span>
      )}
    </div>
  );
}
