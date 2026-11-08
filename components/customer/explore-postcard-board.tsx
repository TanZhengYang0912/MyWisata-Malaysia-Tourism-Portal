"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DiscoveryResult } from "@/backend/core/types";
import { MalaysiaStateOutline, stateAnchor } from "@/components/demo-map/malaysia-state-map";
import { ReferencePrice } from "@/components/shared/reference-price";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { activityToMapPlace } from "@/lib/demo-map/adapt";
import { DEMO_STATES } from "@/lib/demo-map/data";
import { MALAYSIA_DESTINATIONS, type MalaysiaDestination } from "@/lib/customer/malaysia-destinations";
import { buildActivityPath } from "@/lib/customer/navigation-context";
import { assignPostcardSlots, BOARD, SLOTS, stringPath, toBoardPoint } from "@/lib/customer/postcard-board";
import { getOutletShopHref } from "@/lib/customer/shop-navigation";

const FLIP_AFTER_MS = 350;

type Postcard = {
  dest: MalaysiaDestination;
  stateId: string;
  count: number;
  picks: DiscoveryResult[];
  ps: DiscoveryResult | null;
  seeAllHref: string;
  anchor: { x: number; y: number };
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
  const [scale, setScale] = useState(1);
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
        anchor: toBoardPoint(point),
        slot: 0,
        rotation: tilt(state.id),
      }];
    });
    const slots = assignPostcardSlots(cards.map((card) => ({ id: card.stateId, ...card.anchor })));
    return cards.map((card) => ({ ...card, slot: slots[card.stateId] })).sort((a, b) => a.slot - b.slot);
  }, [activities, statesWithPlaces]);

  // The board is drawn at 1100px and scaled down to the container width.
  useEffect(() => {
    const el = boardRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setScale(Math.min(1, (el.clientWidth || BOARD.width) / BOARD.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

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
        <Button asChild className="mt-auto w-full whitespace-normal sm:w-auto">
          <Link href={card.seeAllHref}>{t("ui.explore.postcard.seeAll", { count: card.count, state: card.dest.state })}</Link>
        </Button>
      </div>
    </div>
  );

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{t("ui.explore.statesAndCities")}</p>
        <h2 className="mt-1 text-2xl font-bold text-foreground">{t("ui.explore.exploreByDestination")}</h2>
      </div>

      <div ref={boardRef} data-testid="postcard-board" className="relative hidden w-full lg:block" style={{ height: BOARD.height * scale }}>
        <div
          className="absolute left-0 top-0 origin-top-left rounded-[14px] bg-[color:var(--mw-cork)] bg-[image:radial-gradient(circle_at_20%_30%,var(--mw-cork-grain)_0_2px,transparent_3px)] bg-[length:13px_13px] shadow-[inset_0_0_0_14px_var(--mw-cork-frame),0_30px_60px_rgb(0_0_0/0.35)]"
          style={{ width: BOARD.width, height: BOARD.height, transform: `scale(${scale})` }}
        >
          <div className="absolute" style={{ left: BOARD.map.x, top: BOARD.map.y, width: BOARD.map.w, height: BOARD.map.h }}>
            <MalaysiaStateOutline highlightedStateId={hot} onHoverState={setHot} onSelectState={open} />
          </div>
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0" width={BOARD.width} height={BOARD.height}>
            {postcards.map((card) => {
              const slot = SLOTS[card.slot], on = hot === card.stateId;
              return (
                <path
                  key={card.stateId}
                  d={stringPath({ x: slot.x + BOARD.card.w / 2, y: slot.y + 2 }, card.anchor)}
                  className="fill-none stroke-[color:var(--mw-string)] transition-all duration-200"
                  strokeWidth={on ? 3 : 1.6}
                  opacity={on ? 1 : 0.55}
                />
              );
            })}
          </svg>
          {postcards.map((card, index) => {
            const slot = SLOTS[card.slot], on = hot === card.stateId;
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
                style={{ left: slot.x, top: slot.y, width: BOARD.card.w, height: BOARD.card.h, transform: on ? "rotate(0deg) scale(1.12)" : `rotate(${card.rotation}deg)` }}
              >
                {front(card)}
                <span aria-hidden="true" className="absolute left-1/2 top-[-7px] size-4 -translate-x-1/2 rounded-full bg-[color:var(--mw-pin)] bg-[image:radial-gradient(circle_at_35%_30%,rgb(255_255_255/0.55),transparent_55%)] shadow-[2px_3px_3px_rgb(0_0_0/0.4)]" />
              </Button>
            );
          })}
        </div>
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
