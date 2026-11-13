"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DiscoveryResult } from "@/backend/core/types";
import { MalaysiaStateOutline, stateAnchor } from "@/components/demo-map/malaysia-state-map";
import { SeeMoreLink } from "@/components/customer/see-more-link";
import { ReferencePrice } from "@/components/shared/reference-price";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { activityToMapPlace } from "@/lib/demo-map/adapt";
import { DEMO_STATES } from "@/lib/demo-map/data";
import { MALAYSIA_DESTINATIONS, type MalaysiaDestination } from "@/lib/customer/malaysia-destinations";
import { buildActivityPath } from "@/lib/customer/navigation-context";
import { assignPostcardSlots, type BoardRegion, getPostcardBoardLayout, regionTransform, slotPin, stringPaths, toBoardPoint } from "@/lib/customer/postcard-board";
import { getOutletShopHref } from "@/lib/customer/shop-navigation";

const FLIP_AFTER_MS = 350;

type Postcard = {
  dest: MalaysiaDestination;
  stateId: string;
  count: number;
  picks: DiscoveryResult[];
  ps: DiscoveryResult | null;
  seeAllHref: string;
  mapPoint: { x: number; y: number };
  region: BoardRegion;
  slot: number;
  rotation: number;
};

/** A small fixed tilt per state, so the board looks pinned by hand but never shifts between renders. */
function tilt(stateId: string) {
  let hash = 0;
  for (const char of stateId) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return ((Math.abs(hash) % 101) / 100 - 0.5) * 10;
}

const activityHref = (activity: DiscoveryResult, returnTo: string) =>
  activity.categorySlug === "accommodation" ? getOutletShopHref(activity.outlet.id) : buildActivityPath(activity.id, returnTo, activity.outlet.id);

/**
 * Explore › Destinations: a postcard per state pinned around a Malaysia map, a
 * string from each card to its state. A card or a state opens that postcard,
 * enlarged and flipped to its back. Below lg it is a plain postcard grid.
 */
export function ExplorePostcardBoard({
  activities,
  statesWithPlaces,
  returnTo,
  onSponsoredClick,
}: {
  activities: DiscoveryResult[];
  statesWithPlaces: string[];
  returnTo: string;
  onSponsoredClick: (activity: DiscoveryResult) => void;
}) {
  const { t } = useTranslation("customer");
  const [hot, setHot] = useState<string | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [flipped, setFlipped] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const boardRef = useRef<HTMLDivElement>(null);

  const postcards = useMemo<Postcard[]>(() => {
    const byState = new Map<string, DiscoveryResult[]>();
    for (const activity of activities) {
      const stateId = activityToMapPlace(activity).stateId;
      byState.set(stateId, [...(byState.get(stateId) ?? []), activity]);
    }
    const cards = MALAYSIA_DESTINATIONS.flatMap((dest) => {
      const state = DEMO_STATES.find((item) => item.name === dest.state);
      const point = state && stateAnchor(state.id);
      if (!state || !point) return [];
      const region: BoardRegion = state.region === "Borneo" ? "borneo" : "peninsular";
      const list = byState.get(state.id) ?? [];
      const picks = list.slice(0, 3);
      const slug = dest.state.toLowerCase().replace(/\s+/g, "-");
      return [{
        dest,
        stateId: state.id,
        count: list.length,
        picks,
        ps: list.find((activity) => activity.sponsorship && !picks.includes(activity)) ?? null,
        seeAllHref: statesWithPlaces.includes(dest.state) ? `/customer/place/${slug}` : `/customer/destination/${encodeURIComponent(slug)}`,
        mapPoint: point,
        region,
        slot: 0,
        rotation: tilt(state.id),
      }];
    });
    // Slots are assigned on the fixed base board, so the card order never changes with the viewport.
    const slots = assignPostcardSlots(cards.map((card) => ({ id: card.stateId, ...toBoardPoint(card.mapPoint, card.region) })));
    return cards.map((card) => ({ ...card, slot: slots[card.stateId] })).sort((a, b) => a.slot - b.slot);
  }, [activities, statesWithPlaces]);

  // The parent gives the viewport its width and height; the board is laid out to fill it (one measure per frame).
  useEffect(() => {
    const el = boardRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const width = el.clientWidth, height = el.clientHeight;
      setSize((previous) => (previous.width === width && previous.height === height ? previous : { width, height }));
    };
    const observer = new ResizeObserver(() => { if (!frame) frame = requestAnimationFrame(measure); });
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const layout = useMemo(() => getPostcardBoardLayout(size.width, size.height), [size]);
  const placed = useMemo(() => (layout
    ? postcards.map((card) => ({ card, slot: layout.slots[card.slot], anchor: toBoardPoint(card.mapPoint, card.region, layout) }))
    : []), [layout, postcards]);
  const strings = useMemo(() => (layout
    ? stringPaths(
      placed.map(({ slot, anchor }) => ({ from: slotPin(slot, layout.card), to: anchor })),
      placed.map(({ slot }) => ({ ...slot, w: layout.card.w, h: layout.card.h })),
    )
    : []), [layout, placed]);
  const regionTransforms = useMemo(() => (layout
    ? { peninsular: regionTransform("peninsular", layout), borneo: regionTransform("borneo", layout) }
    : null), [layout]);

  const flipTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(flipTimer.current), []);

  /** Opens a postcard on its front, then turns it over to its back (at once with reduced motion). */
  const openAt = (index: number) => {
    clearTimeout(flipTimer.current);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    setFlipped(reduced);
    setOpenIndex(index);
    if (!reduced) flipTimer.current = setTimeout(() => setFlipped(true), FLIP_AFTER_MS);
  };
  const open = (stateId: string) => {
    const index = postcards.findIndex((card) => card.stateId === stateId);
    if (index >= 0) openAt(index);
  };
  const step = (delta: number) => setOpenIndex((index) => (index === null ? index : (index + delta + postcards.length) % postcards.length));
  const hover = (stateId: string, on: boolean) => setHot((current) => (on ? stateId : current === stateId ? null : current));
  const current = openIndex === null ? null : postcards[openIndex];

  const front = (card: Postcard) => (
    <span className="@container block h-full w-full">
    <span className="relative block h-full w-full bg-card p-[3cqw] shadow-[0_6px_16px_rgb(0_0_0/0.35)]">
      <span className="relative block h-full w-full overflow-hidden">
        <Image src={card.dest.image} alt="" fill sizes="(min-width: 1024px) 640px, 50vw" className="object-cover" />
      </span>
      <span className="absolute bottom-[6cqw] left-[6cqw] -rotate-2 bg-[color:var(--mw-paper)] px-[4cqw] pb-[2cqw] pt-[1.2cqw] text-left shadow-[0.8cqw_0.8cqw_0_rgb(0_0_0/0.25)]">
        <small className="block font-[family-name:var(--font-display)] text-[6.5cqw] italic leading-none text-[color:var(--mw-paper-accent)]">{t("ui.explore.postcard.greetingsFrom")}</small>
        <b className={`block whitespace-nowrap font-[family-name:var(--font-display)] ${card.dest.state.length > 12 ? "text-[7.5cqw]" : "text-[10cqw]"} font-extrabold uppercase leading-[0.95] text-[color:var(--mw-paper-ink)]`}>{card.dest.state}</b>
      </span>
    </span>
    </span>
  );

  const pick = (activity: DiscoveryResult) => (
    <Link
      key={activity.id}
      href={activityHref(activity, returnTo)}
      onClick={() => { if (activity.sponsorship) onSponsoredClick(activity); }}
      className="flex min-w-0 items-center gap-3 rounded-md hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {activity.image
        // eslint-disable-next-line @next/next/no-img-element -- catalogue product image, as in StoryMap
        ? <img src={activity.image} alt="" loading="lazy" className="h-10 w-10 shrink-0 -rotate-3 rounded object-cover shadow" />
        : <span aria-hidden="true" className="h-10 w-10 shrink-0 rounded bg-muted" />}
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold">{activity.name}</span>
        <ReferencePrice amountMYR={Number(activity.price)} className="font-[family-name:var(--font-mono)] text-xs font-bold text-[color:var(--mw-paper-ink)]" />
      </span>
    </Link>
  );

  const back = (card: Postcard) => (
    <div className="grid h-full gap-4 bg-[color:var(--mw-paper)] p-4 text-[color:var(--mw-paper-ink)] shadow-[0_6px_16px_rgb(0_0_0/0.35)] sm:grid-cols-[1.35fr_1px_0.8fr] sm:p-5">
      <div className="flex min-w-0 flex-col gap-3">
        <p className="font-[family-name:var(--font-display)] text-2xl font-bold italic leading-none">{t("ui.explore.postcard.wishYouWereHere")}</p>
        <p className="font-[family-name:var(--font-display)] italic leading-snug">{card.dest.tagline}</p>
        {card.picks.map(pick)}
        {card.ps && (
          <Link
            href={activityHref(card.ps, returnTo)}
            onClick={() => onSponsoredClick(card.ps!)}
            className="mt-auto flex flex-wrap items-center gap-2 font-[family-name:var(--font-display)] italic text-[color:var(--mw-paper-accent)] hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {t("ui.explore.postcard.ps", { name: card.ps.name })}
            <span className="font-sans text-[10px] font-extrabold uppercase not-italic tracking-[0.14em] opacity-70">{t("ui.labels.sponsored")}</span>
          </Link>
        )}
      </div>
      <div aria-hidden="true" className="hidden bg-[color:var(--mw-paper-ink)]/20 sm:block" />
      <div className="flex flex-col items-end gap-4">
        <div aria-hidden="true" className="relative h-24 w-20 rotate-3 bg-card p-1.5 shadow">
          <div className="relative h-full w-full overflow-hidden">
            <Image src={card.dest.image} alt="" fill sizes="80px" className="object-cover" />
          </div>
        </div>
        <div aria-hidden="true" className="grid size-24 -rotate-12 place-content-center rounded-full border-2 border-[color:var(--mw-paper-ink)]/40 p-2 text-center text-[10px] font-extrabold uppercase leading-snug tracking-[0.1em] text-[color:var(--mw-paper-ink)]/60">
          <span>{card.dest.state}</span>
          <span>{t("ui.place.placesToVisit", { count: card.count })}</span>
        </div>
        <div className="mt-auto [--primary:var(--mw-paper-ink)]">
          <SeeMoreLink href={card.seeAllHref} ariaLabel={t("ui.explore.postcard.seeAll", { count: card.count, state: card.dest.state })} />
        </div>
      </div>
    </div>
  );

  return (
    <section aria-label={t("ui.explore.destinations")} className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:py-4">

      <div
        ref={boardRef}
        data-testid="postcard-board"
        className="relative hidden w-full rounded-[14px] bg-[color:var(--mw-cork)] bg-[image:radial-gradient(circle_at_20%_30%,var(--mw-cork-grain)_0_2px,transparent_3px)] bg-[length:13px_13px] shadow-[inset_0_0_0_14px_var(--mw-cork-frame),0_30px_60px_rgb(0_0_0/0.35)] lg:block lg:max-h-[620px] lg:min-h-0 lg:flex-1 [@media(min-width:1024px)_and_(max-height:599.98px)]:h-[max(260px,calc(100svh-var(--customer-header-h,4.3125rem)-4rem))] [@media(min-width:1024px)_and_(max-height:599.98px)]:flex-none"
      >
        {layout && regionTransforms && (
          <div
            className="absolute left-[14px] top-[14px] origin-top-left"
            style={{ width: layout.width, height: layout.height, transform: `scale(${layout.scale})` }}
          >
            <div className="absolute inset-0">
              <MalaysiaStateOutline
                highlightedStateId={hot}
                onHoverState={setHot}
                onSelectState={open}
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                regionTransforms={regionTransforms}
              />
            </div>
            <svg aria-hidden="true" className="pointer-events-none absolute inset-0" width={layout.width} height={layout.height}>
              {placed.map(({ card }, index) => {
                const on = hot === card.stateId;
                return (
                  <path
                    key={card.stateId}
                    d={strings[index]}
                    className="fill-none stroke-[color:var(--mw-string)] transition-all duration-200"
                    strokeWidth={on ? 3 : 1.6}
                    opacity={on ? 1 : 0.55}
                  />
                );
              })}
              {/* Wide invisible strokes so hovering a string highlights its state too; not focusable (card and state are). */}
              {placed.map(({ card }, index) => (
                <path
                  key={card.stateId}
                  data-string-hit={card.stateId}
                  d={strings[index]}
                  className="cursor-pointer fill-none stroke-transparent"
                  strokeWidth={14}
                  pointerEvents="stroke"
                  onMouseEnter={() => hover(card.stateId, true)}
                  onMouseLeave={() => hover(card.stateId, false)}
                  onClick={() => openAt(index)}
                />
              ))}
              {placed.map(({ card, anchor }) => (
                <circle
                  key={card.stateId}
                  data-state-dot={card.stateId}
                  cx={anchor.x}
                  cy={anchor.y}
                  r={hot === card.stateId ? 6 : 4.5}
                  className="fill-[var(--mw-pin)] drop-shadow-[1.5px_2px_1.5px_rgb(0_0_0/0.45)] transition-[r] duration-150"
                />
              ))}
            </svg>
            {placed.map(({ card, slot }, index) => {
              const on = hot === card.stateId;
              return (
                <Button
                  key={card.stateId}
                  type="button"
                  variant="ghost"
                  aria-label={t("ui.explore.postcard.open", { state: card.dest.state })}
                  onClick={() => openAt(index)}
                  onMouseEnter={() => hover(card.stateId, true)}
                  onMouseLeave={() => hover(card.stateId, false)}
                  onFocus={() => hover(card.stateId, true)}
                  onBlur={() => hover(card.stateId, false)}
                  className={`absolute h-auto rounded-none p-0 transition-transform duration-200 hover:bg-transparent motion-reduce:transition-none ${on ? "z-10" : ""}`}
                  style={{ left: slot.x, top: slot.y, width: layout.card.w, height: layout.card.h, transform: on ? "rotate(0deg) scale(1.12)" : `rotate(${card.rotation}deg)` }}
                >
                  {front(card)}
                  <span aria-hidden="true" className="absolute left-1/2 top-[-7px] size-4 -translate-x-1/2 rounded-full bg-[color:var(--mw-pin)] bg-[image:radial-gradient(circle_at_35%_30%,rgb(255_255_255/0.55),transparent_55%)] shadow-[2px_3px_3px_rgb(0_0_0/0.4)]" />
                </Button>
              );
            })}
          </div>
        )}
      </div>

      <div data-testid="postcard-grid" className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:hidden">
        {postcards.map((card, index) => (
          <Button
            key={card.stateId}
            type="button"
            variant="ghost"
            aria-label={t("ui.explore.postcard.open", { state: card.dest.state })}
            onClick={() => openAt(index)}
            className="aspect-[3/2] h-auto w-full rounded-none p-0 hover:bg-transparent"
          >
            {front(card)}
          </Button>
        ))}
      </div>

      <Dialog open={current !== null} onOpenChange={(next) => { if (!next) { clearTimeout(flipTimer.current); setOpenIndex(null); } }}>
        {current && (
          <DialogContent
            className="max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] gap-3 overflow-y-auto p-4 sm:max-w-[640px] sm:p-5"
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") step(-1);
              if (event.key === "ArrowRight") step(1);
            }}
          >
            <DialogTitle className="pr-8">{t("ui.explore.postcard.greetingsFrom")} {current.dest.state}</DialogTitle>
            <DialogDescription className="sr-only">{current.dest.tagline}</DialogDescription>
            <div className="[perspective:1600px]">
              <div className={`grid grid-cols-[minmax(0,1fr)] transition-transform duration-700 [transform-style:preserve-3d] motion-reduce:transition-none ${flipped ? "[transform:rotateY(180deg)]" : ""}`}>
                <div className="aspect-[3/2] [backface-visibility:hidden] [grid-area:1/1]" inert={flipped}>{front(current)}</div>
                <div className="min-w-0 [backface-visibility:hidden] [grid-area:1/1] [transform:rotateY(180deg)]" inert={!flipped}>{back(current)}</div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="outline" size="icon" aria-label={t("ui.explore.postcard.previous")} onClick={() => step(-1)}><ChevronLeft /></Button>
              <Button type="button" variant="outline" onClick={() => setFlipped((value) => !value)}><RotateCcw /> {t("ui.explore.postcard.flip")}</Button>
              <Button type="button" variant="outline" size="icon" aria-label={t("ui.explore.postcard.next")} onClick={() => step(1)}><ChevronRight /></Button>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </section>
  );
}
