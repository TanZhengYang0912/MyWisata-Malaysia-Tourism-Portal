"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Bookmark, Building2, ChevronLeft, ChevronRight, Compass, MapPin, Search, ShieldCheck, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { ComputedActivity } from "@/backend/core/types";
import { getVendorVisual } from "@/lib/customer/vendor-visual";
import { ActivityCard } from "@/components/customer/activity-card";
import { destinationHref, MALAYSIA_DESTINATIONS } from "@/lib/customer/malaysia-destinations";
import { useSavedDestinations } from "@/components/providers/saved-destinations";
import { DestinationPreviewModal } from "@/components/customer/destination-preview-modal";
import { useEffect, useMemo, useRef, useState } from "react";

const PLACEHOLDER_TEXTS = [
  "Where should we wander?",
  "Try 'Penang street food'...",
  "Try 'Mount Kinabalu hike'...",
  "Try 'Langkawi island hopping'...",
  "Try 'Melaka heritage trail'...",
  "Try 'Borneo rainforest'..."
];

function useTypewriterPlaceholder(texts: string[], typingSpeed = 70, deletingSpeed = 40, pauseDelay = 2000) {
  const [text, setText] = useState("");
  const [index, setIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    let timeout: NodeJS.Timeout;

    const currentText = texts[index];

    if (isDeleting) {
      if (text.length > 0) {
        timeout = setTimeout(() => setText(currentText.substring(0, text.length - 1)), deletingSpeed);
      } else {
        timeout = setTimeout(() => { setIsDeleting(false); setIndex((i) => (i + 1) % texts.length); }, 0);
      }
    } else {
      if (text.length < currentText.length) {
        timeout = setTimeout(() => setText(currentText.substring(0, text.length + 1)), typingSpeed);
      } else {
        timeout = setTimeout(() => setIsDeleting(true), pauseDelay);
      }
    }

    return () => clearTimeout(timeout);
  }, [text, isDeleting, index, texts, typingSpeed, deletingSpeed, pauseDelay]);

  // Provide a minimum height character (zero-width space or space) to avoid collapse
  return text || " ";
}

export type DemoVendor = {
  id: string;
  name: string;
  description: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  businessType: string | null;
  outlets: Array<{ id: string; name: string; city: string | null; state: string | null }>;
};

function formatBusinessType(value: string | null, t: TFunction) {
  if (!value) return t("ui.vendor.localExperiencePartner");
  const key = `ui.vendor.businessTypes.${value.replace(/-/g, "_")}`;
  const translated = t(key);
  return translated === key ? value.split(/[_-]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ") : translated;
}

function VendorCard({ vendor }: { vendor: DemoVendor }) {
  const { t } = useTranslation("customer");
  const visual = getVendorVisual(vendor);
  const primaryOutlet = vendor.outlets[0];
  const location = [primaryOutlet?.city, primaryOutlet?.state].filter(Boolean).join(", ") || t("ui.labels.malaysia");

  return (
    <article className="group overflow-hidden rounded-[22px] border border-border bg-card shadow-sm transition hover:-translate-y-1 hover:shadow-md">
      <Link href={`/customer/vendor/${vendor.id}`} className="block focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
        <div className="relative aspect-[1.5] overflow-hidden bg-secondary">
          {visual.coverUrl ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={visual.coverUrl} alt={t("ui.home.vendorCover", { vendor: vendor.name })} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[linear-gradient(135deg,#010066,#172b72)] text-white">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/25 bg-white/10 text-xl font-black">{visual.initials}</span>
            </div>
          )}
          <div className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-card/95 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-foreground"><ShieldCheck size={12} className="text-primary" /> {t("ui.labels.verified")}</div>
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-xs font-semibold text-white"><MapPin size={12} /> {location}</div>
        </div>
      </Link>
      <div className="p-4 space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <Link href={`/customer/vendor/${vendor.id}`} className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-bold text-foreground">{vendor.name}</h3>
          </Link>
          {visual.logoUrl ? (
             <span className="h-8 w-8 shrink-0 overflow-hidden rounded-lg border border-border bg-card p-0.5">
               {/* eslint-disable-next-line @next/next/no-img-element */}
               <img src={visual.logoUrl} alt="" className="h-full w-full object-cover" />
             </span>
          ) : (
             <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-sm font-bold text-primary">{visual.initials}</span>
          )}
        </div>
        <p className="line-clamp-2 min-h-10 text-[11px] leading-5 text-muted-foreground">{vendor.description || t("ui.home.vendorDescription", { type: formatBusinessType(vendor.businessType, t), location })}</p>
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><Building2 size={12} /> {t("ui.search.outletCount", { count: vendor.outlets.length })}</span>
          <span className="truncate">{formatBusinessType(vendor.businessType, t)}</span>
        </div>
      </div>
    </article>
  );
}

export function CustomerHomeClient({
  recommended,
  popular,
  vendors,
}: {
  recommended: ComputedActivity[];
  popular: ComputedActivity[];
  vendors: DemoVendor[];
}) {
  const { t } = useTranslation("customer");
  const router = useRouter();
  const [activeState, setActiveState] = useState(() => MALAYSIA_DESTINATIONS[0].state);
  const [query, setQuery] = useState("");
  const { savedStates, toggleSaved } = useSavedDestinations();
  const [previewDestination, setPreviewDestination] = useState<typeof MALAYSIA_DESTINATIONS[number] | null>(null);
  const destinationRailRef = useRef<HTMLDivElement>(null);
  const placeholderText = useTypewriterPlaceholder(PLACEHOLDER_TEXTS);

  const activeDestination = useMemo(
    () => MALAYSIA_DESTINATIONS.find((destination) => destination.state === activeState) ?? MALAYSIA_DESTINATIONS[0],
    [activeState],
  );
  const activeIndex = MALAYSIA_DESTINATIONS.findIndex((destination) => destination.state === activeDestination.state);
  const nextDestination = MALAYSIA_DESTINATIONS[(activeIndex + 1) % MALAYSIA_DESTINATIONS.length];

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedQuery = query.trim();
    router.push(trimmedQuery ? `/customer/search?q=${encodeURIComponent(trimmedQuery)}` : "/customer/explore");
  }

  function scrollDestinations(direction: "previous" | "next") {
    const rail = destinationRailRef.current;
    if (!rail) return;
    const distance = Math.max(rail.clientWidth * 0.75, 280);
    rail.scrollBy({ left: direction === "next" ? distance : -distance, behavior: "smooth" });
  }

  const recommendationItems = recommended.length > 0 ? recommended.slice(0, 4) : popular.slice(0, 4);
  const hasPersonalizedRecommendations = recommended.length > 0;

  return (
    <div className="bg-background min-h-screen text-foreground pb-20">
      {/* 1. Hero Section */}
      <section className="atlas-hero-section relative isolate min-h-[calc(100svh-64px)] overflow-hidden bg-primary text-white lg:h-auto lg:min-h-[calc(100svh-64px)]">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_80%_12%,rgba(255,204,0,0.2),transparent_24%),radial-gradient(circle_at_8%_85%,rgba(84,112,210,0.18),transparent_30%),linear-gradient(125deg,#020044_0%,#05083d_58%,#0a243b_100%)]" />
        <div className="atlas-ambient absolute left-[55%] top-20 -z-10 h-72 w-72 rounded-full border border-white/10 sm:h-96 sm:w-96" />
        <div className="atlas-ambient atlas-ambient-delayed absolute left-[58%] top-32 -z-10 h-56 w-56 rounded-full border border-white/10 sm:h-72 sm:w-72" />

        <div className="mx-auto max-w-7xl px-4 pb-10 pt-8 sm:px-6 sm:pb-12 sm:pt-10 lg:flex lg:flex-col lg:px-8 lg:pb-8 lg:pt-4">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4 lg:mb-2">
            <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-white/60"><Compass size={16} className="text-[#ffcc00]" /> MyWisata / Atlas</div>
            <Link href="/customer/explore" className="inline-flex items-center gap-2 rounded-full border border-white/20 px-4 py-2 text-xs font-bold text-white/80 transition hover:border-[#ffcc00] hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ffcc00]/30">{t("ui.home.viewFullMap")} <ArrowRight size={14} /></Link>
          </div>

          <div className="grid items-center gap-8 md:grid-cols-[minmax(0,1fr)_minmax(300px,0.82fr)] md:gap-7 lg:flex-none lg:grid-cols-[minmax(0,0.92fr)_minmax(420px,1.08fr)] lg:gap-10">
            <div className="max-w-2xl">
              <div className="atlas-enter atlas-delay-1 mb-5 inline-flex items-center gap-2 rounded-full border border-[#ffcc00]/35 bg-[#ffcc00]/10 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#ffcc00] lg:mb-4"><Sparkles size={13} /> {t("ui.home.heroKicker")}</div>
              <h1 className="atlas-enter atlas-delay-2 max-w-xl font-[family-name:var(--font-display)] text-5xl font-bold leading-[0.96] tracking-[-0.04em] text-[#ffffff] sm:text-7xl lg:text-6xl">{t("ui.home.heroTitleStart")} <span className="text-[#ffcc00]">{t("ui.home.heroTitleAccent")}</span></h1>
              <p className="atlas-enter atlas-delay-3 mt-6 max-w-lg text-base leading-7 text-white/65 sm:text-lg lg:mt-4 lg:text-base">{t("ui.home.heroDescription")}</p>

              <form onSubmit={submitSearch} className="atlas-enter atlas-delay-4 mt-8 flex max-w-xl flex-col gap-2 rounded-[22px] border border-white/15 bg-card p-2 shadow-[0_18px_48px_rgba(0,0,0,0.2)] sm:flex-row sm:items-center lg:mt-6">
                <div className="flex min-w-0 flex-1 items-center gap-3 px-3"><Search size={18} className="shrink-0 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={placeholderText} aria-label={t("ui.home.searchAria")} className="min-w-0 flex-1 bg-transparent py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground" /></div>
                <button type="submit" className="atlas-shimmer inline-flex items-center justify-center gap-2 rounded-[16px] bg-[#ffcc00] px-5 py-3 text-sm font-bold text-[#010066] transition hover:bg-[#ffcc00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ffcc00]/40">{t("ui.home.startExploring")} <ArrowRight size={15} /></button>
              </form>

              <div className="atlas-enter atlas-delay-5 mt-8 grid max-w-xl grid-cols-3 gap-4 border-t border-white/15 pt-5 lg:mt-5 lg:pt-4">
                <div><p className="font-mono text-lg font-bold text-[#ffcc00]">{MALAYSIA_DESTINATIONS.length}</p><p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/50">{t("ui.home.destinationCount")}</p></div>
                <div><p className="font-mono text-lg font-bold text-[#ffcc00]">{popular.length}</p><p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/50">{t("ui.home.experienceCount")}</p></div>
                <div><p className="font-mono text-lg font-bold text-[#ffcc00]">∞</p><p className="mt-1 text-[10px] uppercase tracking-[0.14em] text-white/50">{t("ui.home.wanderWays")}</p></div>
              </div>
            </div>

            <div className="atlas-enter atlas-delay-3 relative mx-auto min-h-[540px] w-full max-w-[460px] md:min-h-[500px] md:max-w-[390px] lg:min-h-[500px] lg:max-w-[560px]">
              <div className="atlas-depth-card absolute right-0 top-7 hidden w-[72%] rotate-[5deg] overflow-hidden rounded-[28px] border border-white/20 bg-[#11115f] shadow-2xl lg:block lg:top-8 lg:h-[380px] lg:w-[68%]" aria-hidden="true">
                <div className="relative aspect-[0.72] opacity-80 lg:h-full lg:aspect-auto"><Image src={nextDestination.image} alt="" fill sizes="320px" className="object-cover" /><div className="absolute inset-0 bg-[#010066]/35" /></div>
              </div>
              <div className="atlas-note absolute left-0 top-14 z-30 hidden w-[80%] -rotate-[3deg] rounded-2xl border border-[#ffcc00]/40 bg-card px-4 py-3 text-foreground shadow-xl lg:block lg:left-2 lg:top-20 lg:w-[70%]">
                <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{t("ui.home.postcard", { current: String(activeIndex + 1).padStart(2, "0"), total: MALAYSIA_DESTINATIONS.length })}</span><MapPin size={15} className="text-highlight-yellow" /></div>
                <p className="mt-1 font-[family-name:var(--font-display)] text-lg font-bold">{t("ui.home.keepClose")}</p>
              </div>
              <div key={activeDestination.state} className="atlas-active-card absolute bottom-0 right-0 z-20 w-full overflow-hidden rounded-[30px] border border-white/20 bg-black/20 shadow-[0_28px_70px_rgba(0,0,0,0.35)] lg:w-[88%]">
                <div className="relative aspect-[0.78] lg:h-[500px] lg:aspect-auto">
                  <Image src={activeDestination.image} alt={`${activeDestination.attraction}, ${activeDestination.state}`} fill sizes="(max-width: 768px) 46vw, 560px" priority className="atlas-active-image object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
                  <div className="atlas-mobile-note absolute left-5 top-5 z-30 w-[calc(100%-10rem)] max-w-[12rem] rounded-2xl border border-[#ffcc00]/40 bg-card/95 px-3 py-2.5 text-foreground shadow-lg backdrop-blur lg:hidden">
                    <div className="flex items-center justify-between gap-2"><span className="text-[9px] font-bold uppercase tracking-[0.14em] text-primary">{t("ui.home.postcard", { current: String(activeIndex + 1).padStart(2, "0"), total: MALAYSIA_DESTINATIONS.length })}</span><MapPin size={13} className="shrink-0 text-highlight-yellow" /></div>
                    <p className="mt-1 font-[family-name:var(--font-display)] text-base font-bold leading-tight">{t("ui.home.keepClose")}</p>
                  </div>
                  <div className="atlas-desktop-spotlight absolute right-5 top-5 z-30 hidden rounded-2xl border border-white/20 bg-[#00004d]/90 px-4 py-3 text-right shadow-lg backdrop-blur lg:block"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/45">{t("ui.home.spotlight")}</p><p className="mt-1 text-sm font-bold text-white">{activeDestination.state}</p><p className="mt-1 text-[11px] text-[#ffcc00]">{t("ui.home.islandMood")}</p></div>
                  <div className="absolute inset-x-5 bottom-5 sm:inset-x-7 sm:bottom-7"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ffcc00]">{activeDestination.zone}</p><h2 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold leading-none text-white sm:text-6xl">{activeDestination.state}</h2><p className="mt-3 text-sm font-semibold text-white/85">{activeDestination.attraction}</p><p className="mt-1 text-xs leading-5 text-white/60">{activeDestination.tagline}</p><div className="mt-5 flex flex-wrap items-center gap-2"><button type="button" onClick={() => setPreviewDestination(activeDestination)} className="atlas-press inline-flex items-center gap-2 rounded-full bg-[#ffcc00] px-4 py-2.5 text-xs font-bold text-[#010066] transition hover:bg-[#ffcc00] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ffcc00]/40">{t("ui.home.viewDestination")} <ArrowUpRight size={14} /></button><button type="button" onClick={() => void toggleSaved(activeDestination.state)} aria-pressed={savedStates.has(activeDestination.state)} className="atlas-press inline-flex items-center gap-2 rounded-full border border-white/30 bg-[#00004d]/35 px-3.5 py-2.5 text-xs font-bold text-white backdrop-blur transition hover:border-[#ffcc00] hover:bg-[#00004d]/55 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ffcc00]/40"><Bookmark size={14} fill={savedStates.has(activeDestination.state) ? "currentColor" : "none"} /> {savedStates.has(activeDestination.state) ? t("ui.home.savedToAtlas") : t("ui.home.saveFeeling")}</button></div></div>
                </div>
              </div>
            </div>
          </div>

          <nav aria-label={t("ui.home.destinationCarousel")} className="mt-12 border-t border-white/15 pt-8 lg:mt-10 lg:pt-8">
            <div className="mb-6 flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#ffcc00]">{t("ui.home.exploreDestinations")}</p>
                <p className="mt-1 text-xs text-white/55">{t("ui.home.swipeDestinations", { count: MALAYSIA_DESTINATIONS.length })}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <div className="flex items-center gap-1" aria-label="Destination carousel controls">
                  <button type="button" onClick={() => scrollDestinations("previous")} aria-label="Previous destinations" className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/70 transition hover:border-[#ffcc00] hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ffcc00]/30">
                    <ChevronLeft size={16} />
                  </button>
                  <button type="button" onClick={() => scrollDestinations("next")} aria-label="Next destinations" className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/70 transition hover:border-[#ffcc00] hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ffcc00]/30">
                    <ChevronRight size={16} />
                  </button>
                </div>
                <Link href="/customer/explore" className="text-xs font-bold text-[#ffcc00] hover:underline">{t("ui.actions.viewAll")}</Link>
              </div>
            </div>
            <div ref={destinationRailRef} className="flex gap-4 overflow-x-auto pb-4 hide-scrollbar snap-x snap-mandatory scroll-smooth">
              {MALAYSIA_DESTINATIONS.map((dest) => {
                const isSelected = dest.state === activeState;
                return (
                  <button
                    key={dest.state}
                    onClick={() => setActiveState(dest.state)}
                    className={`group relative h-48 w-36 shrink-0 snap-start overflow-hidden rounded-2xl bg-secondary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#ffcc00]/40 sm:h-56 sm:w-44 lg:h-44 transition border ${isSelected ? "border-[#ffcc00] ring-2 ring-[#ffcc00]/35" : "border-white/15 hover:border-white/40"}`}
                  >
                    <Image src={dest.image} alt={dest.state} fill className="object-cover transition duration-700 group-hover:scale-105" sizes="(min-width: 640px) 176px, 144px" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                    <div className="absolute bottom-3 left-3 text-left">
                      <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#ffcc00]">{dest.zone}</p>
                      <p className="mt-1 text-sm font-bold text-white">{dest.state}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">


        {/* 3. Recommended Experiences */}
        {recommendationItems.length > 0 && (
          <section className="mt-12">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold font-[family-name:var(--font-display)] flex items-center gap-2">
                  <Sparkles size={20} className="text-primary" /> {hasPersonalizedRecommendations ? t("ui.home.forYou") : t("ui.home.popularExperiences")}
                </h2>
              </div>
              <Link href="/customer/for-you" className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">{t("ui.actions.viewAll")} <ArrowRight size={14} /></Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {recommendationItems.map((activity) => (
                <ActivityCard key={activity.id} activity={activity} />
              ))}
            </div>
          </section>
        )}

        {/* 4. Popular Experiences */}
        <section className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold font-[family-name:var(--font-display)]">{t("ui.home.popularExperiences")}</h2>
            <Link href="/customer/explore" className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">{t("ui.actions.viewAll")} <ArrowRight size={14} /></Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {popular.slice(0, 8).map((activity) => (
              <ActivityCard key={activity.id} activity={activity} />
            ))}
          </div>
        </section>

        {/* 5. Featured Partners */}
        <section className="mt-12">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold font-[family-name:var(--font-display)]">{t("ui.home.featuredPartners")}</h2>
            <Link href="/customer/partners" className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">{t("ui.home.viewPartners")} <ArrowRight size={14} /></Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {vendors.slice(0, 8).map((vendor) => (
              <VendorCard key={vendor.id} vendor={vendor} />
            ))}
          </div>
        </section>
      </div>

      {previewDestination && (
        <DestinationPreviewModal
          destination={previewDestination}
          onExplore={() => {
            setPreviewDestination(null);
            router.push(destinationHref(previewDestination.state));
          }}
          onClose={() => setPreviewDestination(null)}
        />
      )}

      {/* Hero motion. The markup above was copied from the design-demo prototype
          without this block, so every atlas-* class below had no rule and the hero
          sat still. Restored from app/customer/design-demo/design-demo-client.tsx,
          trimmed to the classes this page actually uses. */}
      <style jsx>{`
        :global(:root) {
          --atlas-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
          --atlas-ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
        }

        .atlas-enter {
          animation: atlas-enter 900ms var(--atlas-ease-out) both;
        }

        .atlas-delay-1 { animation-delay: 80ms; }
        .atlas-delay-2 { animation-delay: 150ms; }
        .atlas-delay-3 { animation-delay: 230ms; }
        .atlas-delay-4 { animation-delay: 330ms; }
        .atlas-delay-5 { animation-delay: 430ms; }

        .atlas-ambient {
          animation: atlas-orbit 18s var(--atlas-ease-in-out) infinite alternate;
          transform-origin: 50% 50%;
        }

        .atlas-ambient-delayed { animation-delay: -7s; animation-direction: alternate-reverse; }

        .atlas-depth-card { animation: atlas-depth-drift 8s var(--atlas-ease-in-out) infinite alternate; }

        .atlas-note { animation: atlas-note-float 6s ease-in-out infinite; }

        .atlas-active-card { animation: atlas-card-in 720ms var(--atlas-ease-out) both; }

        /* :global because styled-jsx only adds its scoping class to plain DOM
           elements, never to an imported component like next/image — a scoped
           rule here would never match the <Image> and the zoom would not run. */
        :global(.atlas-active-image) { animation: atlas-photo-breathe 16s var(--atlas-ease-in-out) infinite alternate; }

        .atlas-press {
          transition-property: transform, background-color, border-color, color, box-shadow;
          transition-duration: 160ms;
          transition-timing-function: var(--atlas-ease-out);
        }

        .atlas-press:active { transform: scale(0.97); }

        .atlas-shimmer {
          position: relative;
          isolation: isolate;
          overflow: hidden;
          transform: translateZ(0);
        }

        .atlas-shimmer::after {
          position: absolute;
          inset: 0 auto 0 -45%;
          width: 36%;
          content: "";
          background: linear-gradient(105deg, transparent, rgba(255,255,255,0.54), transparent);
          transform: skewX(-18deg);
          animation: atlas-sheen 4.8s var(--atlas-ease-in-out) infinite;
          pointer-events: none;
        }

        .atlas-shimmer > :global(*) { position: relative; z-index: 1; }

        @keyframes atlas-enter {
          from { opacity: 0; transform: translateY(24px); filter: blur(6px); }
          to { opacity: 1; transform: translateY(0); filter: blur(0); }
        }

        @keyframes atlas-orbit {
          from { transform: rotate(-9deg) scale(0.96); opacity: 0.55; }
          to { transform: rotate(8deg) scale(1.05); opacity: 1; }
        }

        @keyframes atlas-depth-drift {
          from { transform: translate3d(0, 0, 0) rotate(5deg); }
          to { transform: translate3d(-12px, -10px, 0) rotate(8deg); }
        }

        @keyframes atlas-note-float {
          0%, 100% { transform: translate3d(0, 0, 0) rotate(-3deg); }
          50% { transform: translate3d(0, -9px, 0) rotate(-1deg); }
        }

        @keyframes atlas-card-in {
          from { opacity: 0; transform: translate3d(0, 26px, 0) scale(0.97); filter: blur(3px); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); filter: blur(0); }
        }

        @keyframes atlas-photo-breathe {
          from { transform: scale(1.02); }
          to { transform: scale(1.09); }
        }

        @keyframes atlas-sheen {
          0%, 35% { transform: translateX(0) skewX(-18deg); opacity: 0; }
          50% { opacity: 1; }
          75%, 100% { transform: translateX(420%) skewX(-18deg); opacity: 0; }
        }

        @media (hover: hover) and (pointer: fine) {
          .atlas-shimmer:hover::after { animation-duration: 1.6s; }
        }

        @media (min-width: 1024px) and (max-height: 850px) {
          .atlas-hero-section {
            height: auto;
            min-height: 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .atlas-enter,
          .atlas-ambient,
          .atlas-depth-card,
          .atlas-note,
          .atlas-active-card,
          .atlas-shimmer::after {
            animation: none;
          }

          :global(.atlas-active-image) { animation: none; transform: none; }

          .atlas-press:active { transform: none; }
        }
      `}</style>
    </div>
  );
}
