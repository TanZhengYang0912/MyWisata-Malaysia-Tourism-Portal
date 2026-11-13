"use client";

import {
  wormIndicatorGeometry,
  type WormSizes,
} from "@/lib/customer/worm-indicator";

type HomeDestinationWormIndicatorProps = {
  count: number;
  progress: number;
  current: number;
  sizes: WormSizes;
  label: string;
  pageLabel: (page: number, count: number) => string;
  onSelect: (page: number) => void;
  /** hero: yellow pill on photos (Explore destinations). dots: navy pill and grey dots that turn yellow on hover or press (card carousels). */
  appearance?: "hero" | "dots";
};

export function HomeDestinationWormIndicator({
  count,
  progress,
  current,
  sizes,
  label,
  pageLabel,
  onSelect,
  appearance = "hero",
}: HomeDestinationWormIndicatorProps) {
  const { widths, pillLeft, pillWidth } = wormIndicatorGeometry(progress, count, sizes);

  if (appearance === "dots") {
    // Each button is a 24px-tall hit area; the visible 6px bar sits in its middle.
    return (
      <div
        role="group"
        aria-label={label}
        className="group/worm relative flex h-6 w-max items-center"
        style={{ gap: sizes.gap }}
      >
        {widths.map((width, page) => (
          <button
            key={page}
            type="button"
            aria-label={pageLabel(page + 1, count)}
            aria-current={current === page ? "page" : undefined}
            onClick={() => onSelect(page)}
            className="group relative h-6 shrink-0 rounded-full bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
            style={{ width }}
          >
            <span
              aria-hidden="true"
              className={`absolute inset-x-0 top-[9px] h-1.5 rounded-full transition-colors ${current === page ? "bg-transparent" : "bg-muted-foreground/35 group-hover:bg-accent group-active:bg-accent"}`}
            />
            <span className="sr-only">{pageLabel(page + 1, count)}</span>
          </button>
        ))}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute top-[9px] h-1.5 rounded-full bg-primary transition-colors group-has-[[aria-current=page]:hover]/worm:bg-accent group-has-[[aria-current=page]:active]/worm:bg-accent"
          style={{ left: pillLeft, width: pillWidth }}
        />
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={label}
      className="relative flex w-max items-center"
      style={{ gap: sizes.gap }}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 z-0 rounded-full bg-[#f4bd00]"
        style={{ left: pillLeft, width: pillWidth }}
      />
      {widths.map((width, page) => (
        <button
          key={page}
          type="button"
          aria-label={pageLabel(page + 1, count)}
          aria-current={current === page ? "page" : undefined}
          onClick={() => onSelect(page)}
          className="relative z-10 shrink-0 rounded-full bg-white/35 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#f4bd00]/40"
          style={{ width, height: sizes.dot }}
        >
          <span className="sr-only">{pageLabel(page + 1, count)}</span>
        </button>
      ))}
    </div>
  );
}
