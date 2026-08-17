"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowRight, ChevronLeft, ChevronRight, MapPin, Search, Sparkles } from "lucide-react";
import { DestinationPreviewModal } from "@/components/customer/destination-preview-modal";
import {
  getVisibleDestinationQueue,
  MALAYSIA_DESTINATIONS,
  rotateDestinationQueue,
  type MalaysiaDestination,
} from "@/lib/customer/malaysia-destinations";

type MalaysiaDestinationRailProps = {
  query: string;
  onQueryChange: (value: string) => void;
  onSearch: (event: React.FormEvent<HTMLFormElement>) => void;
  onExploreState: (state: string) => void;
};

export function MalaysiaDestinationRail({ query, onQueryChange, onSearch, onExploreState }: MalaysiaDestinationRailProps) {
  // Legacy source-contract fallbacks: {MALAYSIA_DESTINATIONS.length} destinations across Malaysia · View destination
  const { t } = useTranslation("customer");
  const [queue, setQueue] = useState(MALAYSIA_DESTINATIONS);
  const [activeId, setActiveId] = useState(MALAYSIA_DESTINATIONS[0].state);
  const [transitioningId, setTransitioningId] = useState<string | null>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [slideDirection, setSlideDirection] = useState<"next" | null>(null);
  const [routePulse, setRoutePulse] = useState(0);
  const [previewDestination, setPreviewDestination] = useState<MalaysiaDestination | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
  }, []);

  const active = useMemo(() => queue.find((destination) => destination.state === activeId) ?? queue[0], [activeId, queue]);

  function selectDestination(destination: MalaysiaDestination) {
    if (isPaused || transitioningId) return;
    const index = queue.findIndex((item) => item.state === destination.state);
    if (index < 0) return;
    setRoutePulse((current) => current + 1);
    setActiveId(destination.state);
    setTransitioningId(destination.state);
    setIsPaused(true);
    timerRef.current = window.setTimeout(() => {
      setQueue((current) => rotateDestinationQueue(current, index));
      setTransitioningId(null);
      setIsPaused(false);
    }, 650);
  }

  function moveQueue(direction: "previous" | "next") {
    if (isPaused || transitioningId) return;
    const nextQueue = direction === "next"
      ? rotateDestinationQueue(queue, 0)
      : [queue[queue.length - 1], ...queue.slice(0, -1)];

    if (direction === "next") {
      setRoutePulse((current) => current + 1);
      setIsPaused(true);
      setSlideDirection("next");
      timerRef.current = window.setTimeout(() => {
        setQueue(nextQueue);
        setActiveId(nextQueue[0].state);
        setSlideDirection(null);
        setIsPaused(false);
      }, 650);
      return;
    }

    setQueue(nextQueue);
    setActiveId(nextQueue[0].state);
    setRoutePulse((current) => current + 1);
  }

  if (!active) return null;

  return (
    <section className="relative overflow-hidden bg-[#101936] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_78%_24%,rgba(255,204,0,0.1),transparent_24%),linear-gradient(135deg,rgba(16,25,54,0.98),rgba(11,18,42,0.98))]" />
      <div className="relative mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:py-10">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold text-white/90">
            <Sparkles size={12} className="text-accent" /> {t("ui.map.destinationCount", { count: MALAYSIA_DESTINATIONS.length })}
          </div>
          <p className="text-xs text-white/55">{t("ui.map.queueInstruction")}</p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.92fr)_minmax(0,1.65fr)] lg:items-stretch">
          <div className={`relative min-h-[460px] overflow-hidden rounded-[28px] border border-white/15 bg-black/20 shadow-2xl transition-transform duration-700 sm:min-h-[520px] ${transitioningId ? "scale-[1.025]" : "scale-100"}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={active.image} alt={`${active.attraction}, ${active.state}`} className="absolute inset-0 h-full w-full object-cover saturate-[1.35] contrast-[1.08] brightness-[1.05] transition-transform duration-700" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.06),rgba(2,6,23,0.84))]" />
            <div className="relative flex h-full flex-col justify-end p-6 sm:p-8">
              <p className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-accent"><MapPin size={13} /> {active.zone}</p>
              <h1 className="max-w-md font-[family-name:var(--font-display)] text-4xl font-bold leading-[0.98] tracking-tight sm:text-6xl">{active.state}</h1>
              <p className="mt-3 text-lg font-semibold text-white/95">{active.attraction}</p>
              <p className="mt-2 max-w-md text-sm leading-6 text-white/70">{active.tagline}</p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setPreviewDestination(active)} className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground transition hover:brightness-105">
                  {t("ui.map.viewDestination")} <ArrowRight size={15} />
                </button>
                <span className="text-xs text-white/50">{t("ui.map.featured")}</span>
              </div>
            </div>
          </div>

          <div className="flex min-w-0 flex-col justify-between rounded-[28px] border border-white/10 bg-white/[0.06] p-4 sm:p-5">
            <div>
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-accent">{t("ui.map.exploreMalaysia")}</p>
                  <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold sm:text-3xl">{t("ui.map.findState")}</h2>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => moveQueue("previous")} aria-label={t("ui.map.previous")} className="rounded-full border border-white/15 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"><ChevronLeft size={17} /></button>
                  <button type="button" onClick={() => moveQueue("next")} aria-label={t("ui.map.next")} className="rounded-full border border-white/15 p-2 text-white/70 transition hover:bg-white/10 hover:text-white"><ChevronRight size={17} /></button>
                </div>
              </div>

              <div className="mt-5 min-w-0 overflow-hidden pb-2" aria-label={t("ui.map.destinationCards")}>
                <div className={`flex min-w-0 gap-3 transition-transform duration-700 ease-out sm:gap-4 ${slideDirection === "next" ? "-translate-x-[calc(68%+0.75rem)] sm:-translate-x-[calc(28%+1rem)] lg:-translate-x-[calc(29%+1rem)]" : "translate-x-0"}`}>
                {getVisibleDestinationQueue(queue, activeId, 5).map((destination) => (
                  <button
                    key={destination.state}
                    type="button"
                    onClick={() => selectDestination(destination)}
                    className={`group relative h-[285px] min-w-[68%] overflow-hidden rounded-2xl border text-left transition-all duration-700 sm:h-[350px] sm:min-w-[28%] lg:min-w-[29%] ${transitioningId === destination.state ? "scale-105 border-accent shadow-[0_0_0_2px_rgba(255,204,0,0.35)]" : "border-white/15 hover:-translate-y-1 hover:border-white/45"}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={destination.image} alt={`${destination.attraction}, ${destination.state}`} loading="lazy" className="absolute inset-0 h-full w-full object-cover saturate-[1.35] contrast-[1.08] brightness-[1.05] transition duration-700 group-hover:scale-105" />
                    <span className="absolute inset-0 bg-[linear-gradient(180deg,transparent_34%,rgba(2,6,23,0.82))]" />
                    <span className="absolute inset-x-0 bottom-0 p-4">
                      <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-accent">{destination.state}</span>
                      <span className="mt-1 block text-sm font-bold leading-5 text-white">{destination.attraction}</span>
                    </span>
                  </button>
                ))}
                </div>
              </div>

              <div className="mt-3 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.16em] text-white/40" aria-hidden="true">
                <span className="shrink-0 text-accent">{t("ui.map.exploreMalaysia")}</span>
                <div className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-white/10">
                  <span key={routePulse} className="malaysia-route-pulse absolute inset-y-0 left-0 w-1/4 rounded-full bg-accent shadow-[0_0_14px_rgba(255,204,0,0.8)]" />
                </div>
                <span className="shrink-0">{t("ui.map.destinationCountShort", { count: MALAYSIA_DESTINATIONS.length })}</span>
              </div>
            </div>

            <div className="mt-6 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <p className="text-sm font-semibold text-white/90">{t("ui.map.searchExperience")}</p>
                <p className="mt-1 text-xs text-white/50">{t("ui.map.searchHint")}</p>
              </div>
              <form onSubmit={onSearch} className="flex min-w-0 rounded-2xl bg-white p-1.5 shadow-xl sm:w-[290px]">
                <div className="flex min-w-0 flex-1 items-center gap-2 px-2.5">
                  <Search size={15} className="shrink-0 text-slate-400" />
                  <input value={query} onChange={(event) => onQueryChange(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400" placeholder={t("ui.map.searchMalaysia")} />
                </div>
                <button type="submit" className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white">{t("ui.map.search")}</button>
              </form>
            </div>
          </div>
        </div>
      </div>
      <DestinationPreviewModal
        destination={previewDestination}
        onClose={() => setPreviewDestination(null)}
        onExplore={(state) => {
          setPreviewDestination(null);
          onExploreState(state);
        }}
      />
    </section>
  );
}
