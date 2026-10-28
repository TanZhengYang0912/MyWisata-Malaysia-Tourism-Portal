"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, CalendarDays, MapPin, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ComputedActivity } from "@/backend/core/types";
import { ActivityCard } from "@/components/customer/activity-card";
import { groupAccommodationByProperty } from "@/lib/customer/discovery-ranking";
import { SaveToggleButton } from "@/components/customer/save-toggle-button";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { VendorCard, type CustomerVendorCardVendor } from "@/components/customer/vendor-card";
import { useSavedDestinations } from "@/components/providers/saved-destinations";
import { destinationHref, MALAYSIA_DESTINATIONS } from "@/lib/customer/malaysia-destinations";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";
import dynamic from "next/dynamic";

const EventCalendarDialog = dynamic(
  () => import("@/components/customer/event-calendar-dialog").then((m) => m.EventCalendarDialog),
  { ssr: false, loading: () => null },
);
import { useEffect, useRef, useState, type TransitionEvent } from "react";
import { useAuth } from "@/components/providers/auth";
import { PromotionCampaignSpotlight } from "@/components/customer/promotion-campaign-spotlight";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";
import { EventPartnersSection, type EventPartner } from "@/components/customer/event-partners-section";
import { HomeDestinationWormIndicator } from "@/components/customer/home-destination-worm-indicator";
import { useHomeDestinationPager } from "@/components/customer/use-home-destination-pager";
import { Button } from "@/components/ui/button";

const HERO_CROSSFADE_DURATION_MS = 240;
const FEATURED_DESTINATION_STATES = ["Kuala Lumpur", "Penang", "Sabah", "Melaka"];
const FEATURED_DESTINATIONS = FEATURED_DESTINATION_STATES.flatMap((state) =>
  MALAYSIA_DESTINATIONS.filter((destination) => destination.state === state),
);
export const HOME_DESTINATION_IMAGE_OVERRIDES: Record<string, string> = {
  "Kuala Lumpur": "/customer/klcc-home-hero-match.webp",
  Penang: "/customer/penang-home-destination.webp",
  Sabah: "/customer/sabah-home-destination.webp",
  Melaka: "/customer/melaka-home-destination.webp",
  Johor: "/customer/johor-home-destination.webp",
  Sarawak: "/customer/sarawak-home-destination.webp",
  Kedah: "/customer/kedah-home-destination.webp",
  Pahang: "/customer/pahang-home-destination.webp",
  Terengganu: "/customer/terengganu-home-destination.webp",
  Selangor: "/customer/selangor-home-destination.webp",
  Perak: "/customer/perak-home-destination.webp",
  "Negeri Sembilan": "/customer/negeri-sembilan-home-destination.webp",
  Kelantan: "/customer/kelantan-home-destination.webp",
  Perlis: "/customer/perlis-home-destination.webp",
  Putrajaya: "/customer/putrajaya-home-destination.webp",
  Labuan: "/customer/labuan-home-destination.webp",
};
const toHomeDestination = (destination: (typeof MALAYSIA_DESTINATIONS)[number]) => ({
  ...destination,
  image: HOME_DESTINATION_IMAGE_OVERRIDES[destination.state] ?? destination.image,
});
const HOME_DESTINATIONS = [
  ...FEATURED_DESTINATIONS.map(toHomeDestination),
  ...MALAYSIA_DESTINATIONS
    .filter((destination) => !FEATURED_DESTINATION_STATES.includes(destination.state))
    .map(toHomeDestination),
];

export type DemoVendor = CustomerVendorCardVendor & { businessType: string | null };
type NearbyPartner = CustomerVendorCardVendor & { distanceKm: number };
type NearbyLocationSource = "browser" | "city" | "none";

export function CustomerHomeClient({
  recommended,
  popular,
  vendors,
  eventPartners = [],
  campaign,
  campaigns,
  campaignUnavailable = false,
  titleFontClassName = "",
}: {
  recommended: ComputedActivity[];
  popular: ComputedActivity[];
  vendors: DemoVendor[];
  eventPartners?: EventPartner[];
  campaign: PromotionCampaignPublic | null;
  campaigns?: PromotionCampaignPublic[];
  campaignUnavailable?: boolean;
  titleFontClassName?: string;
}) {
  const { t } = useTranslation("customer");
  const { currentUser } = useAuth();
  const gate = useCustomerCapabilityGate();
  const { savedStates, toggleSaved } = useSavedDestinations();
  const isGuest = !currentUser;
  const [activeState, setActiveState] = useState(() => HOME_DESTINATIONS[0].state);
  const [outgoingHeroState, setOutgoingHeroState] = useState<string | null>(null);
  const [incomingHeroVisible, setIncomingHeroVisible] = useState(false);
  const [eventCalendarOpen, setEventCalendarOpen] = useState(false);
  const [nearbyPartners, setNearbyPartners] = useState<NearbyPartner[] | null>(null);
  const [nearbyLocationSource, setNearbyLocationSource] = useState<NearbyLocationSource | null>(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const activeStateRef = useRef(activeState);
  const destinationPagerRef = useRef<HTMLDivElement>(null);
  const heroCrossfadeTimeoutRef = useRef<number | null>(null);
  const destinationPager = useHomeDestinationPager(destinationPagerRef);
  const activeDestination = HOME_DESTINATIONS.find((destination) => destination.state === activeState) ?? HOME_DESTINATIONS[0];
  const outgoingHeroDestination = outgoingHeroState
    ? HOME_DESTINATIONS.find((destination) => destination.state === outgoingHeroState) ?? null
    : null;
  const activeHeroImage = activeDestination.image;

  function clearHeroCrossfadeTimeout() {
    if (heroCrossfadeTimeoutRef.current !== null) {
      window.clearTimeout(heroCrossfadeTimeoutRef.current);
      heroCrossfadeTimeoutRef.current = null;
    }
  }

  function settleHeroCrossfade(destinationState: string) {
    if (destinationState !== activeStateRef.current) return;
    clearHeroCrossfadeTimeout();
    setOutgoingHeroState(null);
    setIncomingHeroVisible(false);
  }

  function completeHeroPhotoTransition(
    event: TransitionEvent<HTMLImageElement>,
    destinationState: string,
  ) {
    if (event.propertyName !== "opacity" || event.target !== event.currentTarget) return;
    settleHeroCrossfade(destinationState);
  }

  function handleHeroPhotoLoaded(destinationState: string) {
    if (destinationState !== activeStateRef.current || outgoingHeroState === null) return;
    setIncomingHeroVisible(true);
    clearHeroCrossfadeTimeout();
    heroCrossfadeTimeoutRef.current = window.setTimeout(
      () => settleHeroCrossfade(destinationState),
      HERO_CROSSFADE_DURATION_MS + 80,
    );
  }

  function selectDestination(destinationState: string) {
    if (destinationState === activeStateRef.current) return;
    clearHeroCrossfadeTimeout();
    const visibleHeroState = incomingHeroVisible
      ? activeStateRef.current
      : outgoingHeroState ?? activeStateRef.current;
    activeStateRef.current = destinationState;
    setOutgoingHeroState(visibleHeroState);
    setIncomingHeroVisible(false);
    setActiveState(destinationState);
  }

  useEffect(() => () => clearHeroCrossfadeTimeout(), []);

  async function loadNearbyPartners(coordinates?: { latitude: number; longitude: number }) {
    setNearbyLoading(true);
    setNearbyError(null);
    try {
      const response = await fetch("/api/customer/nearby-partners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(coordinates ?? {}),
      });
      const body = await response.json() as {
        data?: { locationSource: NearbyLocationSource; partners: NearbyPartner[] };
        error?: { message?: string };
      };
      if (!response.ok || !body.data) {
        throw new Error(body.error?.message ?? t("ui.home.nearbyLoadError"));
      }
      setNearbyPartners(body.data.partners.slice(0, 4));
      setNearbyLocationSource(body.data.locationSource);
    } catch (error) {
      setNearbyError(error instanceof Error ? error.message : t("ui.home.nearbyLoadError"));
      setNearbyLocationSource(null);
      setNearbyPartners(null);
    } finally {
      setNearbyLoading(false);
    }
  }

  function useMyLocationForPartners() {
    setNearbyError(null);
    if (!navigator.geolocation) {
      void loadNearbyPartners();
      return;
    }

    setNearbyLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => void loadNearbyPartners({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      }),
      () => void loadNearbyPartners(),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  }

  const highlightItems = groupAccommodationByProperty(popular).slice(0, 4);
  const highlightIds = new Set(highlightItems.map((activity) => activity.id));
  const forYouItems = groupAccommodationByProperty(recommended).filter((activity) => !highlightIds.has(activity.id)).slice(0, 4);
  return (
    <div className={`${titleFontClassName} bg-background min-h-screen text-foreground pb-20`}>
      <section className="atlas-hero-section relative isolate min-h-[calc(100svh-var(--customer-header-h,6.3125rem))] overflow-hidden bg-[#061326] text-white xl:min-h-[calc(100svh-var(--customer-header-h,4.3125rem))]">
        <div className="absolute inset-0 z-0 overflow-hidden bg-[#061326]">
          <Image key={`${activeDestination.state}-placeholder`} src={activeHeroImage} alt="" aria-hidden="true" fill quality={75} sizes="(max-width: 639px) 44vw, (max-width: 1023px) 45vw, 340px" className={`atlas-hero-placeholder object-cover ${activeDestination.state === "Kuala Lumpur" ? "object-[60%_center] sm:object-center" : "object-[56%_48%]"}`} />
          {outgoingHeroDestination && (
            <Image
              key={`${outgoingHeroDestination.state}-outgoing`}
              src={outgoingHeroDestination.image}
              alt=""
              aria-hidden="true"
              fill
              loading="eager"
              quality={90}
              sizes="100vw"
              className={`atlas-hero-photo atlas-hero-photo--outgoing object-cover ${outgoingHeroDestination.state === "Kuala Lumpur" ? "object-[60%_center] sm:object-center" : "object-[56%_48%]"}`}
            />
          )}
          <Image
            key={activeDestination.state}
            src={activeHeroImage}
            alt=""
            fill
            loading="eager"
            quality={90}
            sizes="100vw"
            onLoad={() => handleHeroPhotoLoaded(activeDestination.state)}
            onTransitionEnd={(event) => completeHeroPhotoTransition(event, activeDestination.state)}
            className={`atlas-hero-photo object-cover ${outgoingHeroDestination ? `atlas-hero-photo--incoming${incomingHeroVisible ? " atlas-hero-photo--incoming-visible" : ""}` : ""} ${activeDestination.state === "Kuala Lumpur" ? "object-[60%_center] sm:object-center" : "object-[56%_48%]"}`}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,15,36,0.27)_0%,rgba(4,15,36,0.16)_27%,rgba(4,15,36,0.04)_64%,rgba(4,15,36,0.01)_100%),linear-gradient(0deg,rgba(4,17,39,0.36)_0%,rgba(4,17,39,0.16)_22%,rgba(4,17,39,0.02)_59%),linear-gradient(180deg,rgba(4,17,39,0.05)_0%,rgba(4,17,39,0)_52%)]" />
        </div>

        <div className="relative z-10 mx-auto flex min-h-[calc(100svh-var(--customer-header-h,6.3125rem))] w-full max-w-[1420px] flex-col px-5 pb-8 pt-[12svh] sm:px-9 xl:min-h-[calc(100svh-var(--customer-header-h,4.3125rem))] lg:px-0 lg:pb-9 lg:pt-[14.5svh]">
          <header className="atlas-enter atlas-delay-1 mb-auto pl-0 sm:pl-4 lg:pl-[3.4%]">
            <h1 className="atlas-discover-title max-w-[760px] font-[family-name:var(--font-discover-title)] text-[clamp(4.2rem,min(9vw,14svh),9.2rem)] font-normal leading-[1.05] tracking-[-0.025em]">
              {t("ui.guest.discoverMalaysia")}
            </h1>
            <svg
              className="atlas-title-accent ml-28 mt-8 block w-[clamp(132px,16vw,250px)] text-[#f4b900] sm:ml-32 sm:mt-9"
              viewBox="0 0 228 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                className="atlas-title-accent__stroke"
                d="M4 20 C 72 15 146 5 222 7"
                pathLength={1}
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="5"
              />
            </svg>
          </header>

          <nav aria-label={t("ui.home.destinationCarousel")} className="atlas-destination-rail atlas-enter atlas-delay-2 mt-10 w-full">
            <div className="mb-3 flex items-center gap-3 sm:mb-1">
              <div className="flex items-center gap-3">
                <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f4bd00] sm:text-xs">{t("ui.home.exploreDestinations")}</h2>
                <Button asChild variant="outline" size="icon" className="rounded-full border-white/35 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                  <Link
                    href={destinationHref(activeDestination.state)}
                    aria-label={t("ui.home.viewDestination")}
                    title={t("ui.home.viewDestination")}
                  >
                    <ArrowUpRight size={16} aria-hidden="true" />
                  </Link>
                </Button>
              </div>
            </div>
            <div ref={destinationPagerRef} className="atlas-destination-pager pb-3">
              {HOME_DESTINATIONS.map((destination) => {
                const isSelected = destination.state === activeState;
                const isSaved = savedStates.has(destination.state);
                const saveLabel = t(isSaved ? "ui.map.savedToAtlas" : "ui.map.saveToAtlas");
                return (
                  <div key={destination.state} className="atlas-destination-card relative min-w-0">
                    <button
                      type="button"
                      onClick={() => selectDestination(destination.state)}
                      aria-pressed={isSelected}
                      className={`group relative block h-[clamp(108px,22svh,220px)] w-full overflow-hidden rounded-[14px] border text-left transition duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#f4bd00]/40 ${isSelected ? "border-2 border-[#f4bd00]" : "border-white/70 hover:border-white"}`}
                    >
                      <Image src={destination.image} alt="" fill sizes="(min-width: 1200px) 20vw, (min-width: 740px) 34vw, 50vw" className="object-cover transition duration-700 group-hover:scale-[1.045]" />
                      <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                      <span className="absolute inset-x-3 bottom-2 truncate font-[family-name:var(--font-display)] text-[15px] font-semibold leading-tight text-white sm:inset-x-4 sm:bottom-3 sm:text-xl lg:text-[25px]">{destination.state}</span>
                    </button>
                    <SaveToggleButton
                      appearance="icon"
                      saved={isSaved}
                      aria-label={saveLabel}
                      title={saveLabel}
                      onClick={() => {
                        if (!gate(CUSTOMER_CAPABILITY.ACCOUNT_MUTATION)) return;
                        void toggleSaved(destination.state);
                      }}
                      className="absolute right-2 top-2 z-10 h-9 w-9 sm:right-3 sm:top-3"
                    />
                    <span className={`atlas-selected-progress absolute -bottom-2.5 left-1 h-[3px] w-[46%] rounded-full bg-[#f4bd00] ${isSelected ? "atlas-selected-progress--active" : ""}`} aria-hidden="true" />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 lg:hidden">
              <HomeDestinationWormIndicator
                count={destinationPager.pageCount}
                progress={destinationPager.progress}
                current={destinationPager.page}
                sizes={{ dot: 11, pill: 36, gap: 8 }}
                label={t("ui.home.destinationCarouselControls")}
                pageLabel={(page, count) => t("ui.home.destinationPage", { page, total: count })}
                onSelect={destinationPager.goToPage}
              />
            </div>
            <div className="mt-2 hidden lg:block">
              <HomeDestinationWormIndicator
                count={destinationPager.pageCount}
                progress={destinationPager.progress}
                current={destinationPager.page}
                sizes={{ dot: 14, pill: 50, gap: 10 }}
                label={t("ui.home.destinationCarouselControls")}
                pageLabel={(page, count) => t("ui.home.destinationPage", { page, total: count })}
                onSelect={destinationPager.goToPage}
              />
            </div>
          </nav>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mt-8 flex flex-col gap-4 rounded-3xl border border-border/70 bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <h2 className="text-lg font-bold text-foreground">{t("ui.home.eventCalendar")}</h2>
          <button type="button" onClick={() => setEventCalendarOpen(true)} aria-label={t("ui.home.eventCalendar")} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-primary-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/25"><CalendarDays size={17} /> {t("ui.home.viewEventCalendar")} <ArrowRight size={15} /></button>
        </div>
        <PromotionCampaignSpotlight campaign={campaign} campaigns={campaigns} unavailable={campaignUnavailable} />

        {highlightItems.length > 0 && (
          <section aria-labelledby="featured-highlights-heading" className="mt-12">
            <div className="mb-5 flex items-end justify-between gap-4 border-b border-border/70 pb-4">
              <div>
                <h2 id="featured-highlights-heading" className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
                  {t("ui.home.featuredHighlights")}
                </h2>
              </div>
              <Link href="/customer/explore" className="inline-flex min-h-10 shrink-0 items-center gap-1 text-sm font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
                {t("ui.actions.viewAll")} <ArrowRight size={14} />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {highlightItems.map((activity) => (
                <ActivityCard key={activity.id} activity={activity} />
              ))}
            </div>
          </section>
        )}

        {!isGuest && forYouItems.length > 0 && (
          <section aria-labelledby="for-you-heading" className="mt-12 rounded-[28px] border border-border/70 bg-secondary/35 p-4 sm:p-6 lg:p-7">
            <div className="mb-5 flex items-end justify-between gap-4">
              <h2 id="for-you-heading" className="flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
                <Sparkles size={19} className="text-primary" aria-hidden="true" /> {t("ui.home.forYou")}
              </h2>
              <Link href="/customer/for-you" className="inline-flex min-h-10 shrink-0 items-center gap-1 text-sm font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
                {t("ui.actions.viewAll")} <ArrowRight size={14} />
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {forYouItems.map((activity) => (
                <ActivityCard key={activity.id} activity={activity} recommendationReason={activity.aiTag ?? undefined} />
              ))}
            </div>
          </section>
        )}

        <EventPartnersSection partners={eventPartners.slice(0, 4)} featured />

        <section className="mt-12" aria-labelledby="nearby-partners-heading">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="nearby-partners-heading" className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
                {t("ui.home.nearbyPartners")}
              </h2>
              {nearbyLocationSource === "browser" && <p role="status" className="mt-2 text-sm text-muted-foreground">{t("ui.home.nearbyFromCurrentLocation")}</p>}
              {nearbyLocationSource === "city" && <p role="status" className="mt-2 text-sm text-muted-foreground">{t("ui.home.nearbyFromProfile")}</p>}
              {nearbyPartners === null && <p className="mt-2 text-sm text-muted-foreground">{t("ui.home.nearbyPrompt")}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={useMyLocationForPartners}
                disabled={nearbyLoading}
                aria-busy={nearbyLoading}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 py-2 text-sm font-semibold text-primary transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 disabled:cursor-wait disabled:opacity-60"
              >
                <MapPin size={15} aria-hidden="true" />
                {nearbyLoading ? t("ui.states.loading") : t("ui.map.useCurrentLocation")}
              </button>
              <Link href="/customer/partners" className="inline-flex min-h-10 items-center gap-1 text-sm font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
                {t("ui.home.viewPartners")} <ArrowRight size={14} />
              </Link>
            </div>
          </div>

          {nearbyError && <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{nearbyError}</p>}
          {nearbyLoading ? (
            <p role="status" aria-live="polite" className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">{t("ui.states.loading")}</p>
          ) : nearbyPartners && nearbyPartners.length > 0 ? (
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {nearbyPartners.slice(0, 4).map((partner, index) => {
                const primaryOutlet = partner.outlets[0];
                const location = [primaryOutlet?.city, primaryOutlet?.state].filter(Boolean).join(", ") || t("ui.labels.malaysia");
                return <VendorCard
                  key={partner.id}
                  vendor={partner}
                  description={partner.description}
                  descriptionFallback={t("ui.home.vendorDescription", { location })}
                  distanceLabel={t("ui.home.distanceAway", { distance: partner.distanceKm.toFixed(1) })}
                  index={index}
                />;
              })}
            </div>
          ) : nearbyPartners ? (
            <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
              {t(nearbyLocationSource === "none" ? "ui.home.nearbyNoLocation" : "ui.home.noNearbyPartners")} {" "}
              <Link href="/customer/partners" className="font-semibold text-primary underline-offset-4 hover:underline">{t("ui.home.viewPartners")}</Link>
            </p>
          ) : null}
        </section>

        {/* 5. Featured Partners */}
        <section className="mt-12">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-2xl font-bold font-[family-name:var(--font-display)]">{t("ui.home.featuredPartners")}</h2>
            <Link href="/customer/partners" className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">{t("ui.home.viewPartners")} <ArrowRight size={14} /></Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
            {vendors.slice(0, 4).map((vendor, index) => {
              const primaryOutlet = vendor.outlets[0];
              const location = [primaryOutlet?.city, primaryOutlet?.state].filter(Boolean).join(", ") || t("ui.labels.malaysia");
              return <VendorCard key={vendor.id} vendor={vendor} description={vendor.description} descriptionFallback={t("ui.home.vendorDescription", { location })} index={index} isFeatured />;
            })}
          </div>
        </section>
      </div>

      {eventCalendarOpen && <EventCalendarDialog open onOpenChange={setEventCalendarOpen} />}

      {/* Keep the title, photo, and carousel motion subtle and disable it for reduced-motion users. */}
      <style jsx>{`
        :global(:root) {
          --atlas-ease-out: cubic-bezier(0.23, 1, 0.32, 1);
        }

        .atlas-enter {
          animation: atlas-enter 760ms var(--atlas-ease-out) both;
        }

        .atlas-delay-1 { animation-delay: 80ms; }
        .atlas-delay-2 { animation-delay: 150ms; }

        :global(.atlas-hero-photo) {
          animation: atlas-photo-breathe 22s ease-in-out 850ms infinite alternate;
          filter: brightness(1.07) contrast(1.06) saturate(1.08);
          transform-origin: center;
        }

        :global(.atlas-hero-photo--incoming) {
          opacity: 0;
          transition: opacity 240ms var(--atlas-ease-out);
        }

        :global(.atlas-hero-photo--incoming-visible) { opacity: 1; }

        .atlas-selected-progress {
          opacity: 0;
          transform: scaleX(0.85);
          transform-origin: left center;
          transition: transform 160ms var(--atlas-ease-out), opacity 160ms var(--atlas-ease-out);
        }

        .atlas-selected-progress--active {
          opacity: 1;
          transform: scaleX(1);
        }

        .atlas-title-accent { animation: atlas-accent-in 700ms var(--atlas-ease-out) 460ms both; }
        .atlas-title-accent__stroke {
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          animation: atlas-accent-draw 800ms var(--atlas-ease-out) 460ms both;
        }
        /* Cards per page follow the rail's own width: about 220px minimum per card, 2 to 5 per page. */
        .atlas-destination-rail { container: destination-rail / inline-size; }

        .atlas-destination-pager {
          --per-page: 2;
          --destination-gap: 0.75rem;
          display: flex;
          gap: var(--destination-gap);
          overflow-x: auto;
          padding-right: var(--destination-gap);
          scroll-snap-type: x mandatory;
          overscroll-behavior-x: contain;
          scrollbar-width: none;
        }

        .atlas-destination-pager::-webkit-scrollbar { display: none; }

        .atlas-destination-card {
          flex: 0 0 calc((100% - ((var(--per-page) - 1) * var(--destination-gap))) / var(--per-page));
          scroll-snap-align: none;
          animation: atlas-enter 480ms var(--atlas-ease-out) both;
        }

        @container destination-rail (width < 692px) {
          .atlas-destination-card:nth-child(2n + 1) { scroll-snap-align: start; scroll-snap-stop: always; }
        }

        @container destination-rail (692px <= width < 928px) {
          .atlas-destination-pager { --per-page: 3; }
          .atlas-destination-card:nth-child(3n + 1) { scroll-snap-align: start; scroll-snap-stop: always; }
        }

        @container destination-rail (928px <= width < 1164px) {
          .atlas-destination-pager { --per-page: 4; --destination-gap: 1rem; }
          .atlas-destination-card:nth-child(4n + 1) { scroll-snap-align: start; scroll-snap-stop: always; }
        }

        @container destination-rail (width >= 1164px) {
          .atlas-destination-pager { --per-page: 5; --destination-gap: 1rem; }
          .atlas-destination-card:nth-child(5n + 1) { scroll-snap-align: start; scroll-snap-stop: always; }
        }

        .atlas-discover-title {
          background-image: linear-gradient(108deg, #fff8e9 0%, #fff1d2 25%, var(--malaysia-yellow) 43%, color-mix(in srgb, var(--malaysia-red) 55%, #fff1d2) 58%, #f1b948 76%, #f1b948 100%);
          background-clip: text;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          font-style: italic;
          font-weight: 400;
          text-shadow: 0 3px 18px color-mix(in srgb, var(--malaysia-blue) 38%, transparent);
        }

        :global(html:lang(zh-CN)) .atlas-discover-title {
          background-image: none;
          color: #fff6df;
          font-family: var(--font-display), serif;
          font-style: normal;
          font-weight: 600;
          letter-spacing: -0.055em;
          -webkit-text-fill-color: #fff6df;
        }

        @keyframes atlas-enter {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes atlas-photo-breathe {
          from { transform: scale(1.005); }
          to { transform: scale(1.015); }
        }

        @keyframes atlas-accent-in {
          from { opacity: 0; transform: translateX(-8px); }
          to { opacity: 1; transform: translateX(0); }
        }

        @keyframes atlas-accent-draw {
          to { stroke-dashoffset: 0; }
        }

        @media (prefers-reduced-motion: reduce) {
          .atlas-enter,
          .atlas-title-accent,
          .atlas-destination-card,
          :global(.atlas-hero-photo) {
            animation: none;
          }

          :global(.atlas-hero-photo--incoming) {
            transition-duration: 120ms;
          }

          .atlas-selected-progress {
            transition-duration: 100ms;
          }

          .atlas-title-accent__stroke {
            stroke-dashoffset: 0;
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
