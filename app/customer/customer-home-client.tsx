"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronLeft, ChevronRight, MapPin, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ComputedActivity, DiscoveryPropertySummary, DiscoveryResult } from "@/backend/core/types";
import { ActivityCard } from "@/components/customer/activity-card";
import { ProductCard } from "@/components/customer/product-card";
import { toDiscoveryCatalogueCard } from "@/lib/customer/product-catalogue";
import { SaveToggleButton } from "@/components/customer/save-toggle-button";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { VendorCard, type CustomerVendorCardVendor } from "@/components/customer/vendor-card";
import { useSavedDestinations } from "@/components/providers/saved-destinations";
import { destinationHref, MALAYSIA_DESTINATIONS } from "@/lib/customer/malaysia-destinations";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";
import { useCallback, useEffect, useRef, useState, type TransitionEvent } from "react";
import { useAuth } from "@/components/providers/auth";
import { PromotionCampaignSpotlight } from "@/components/customer/promotion-campaign-spotlight";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";
import { EventPartnersSection, type EventPartner } from "@/components/customer/event-partners-section";
import { HomeDestinationWormIndicator } from "@/components/customer/home-destination-worm-indicator";
import { useHomeDestinationPager } from "@/components/customer/use-home-destination-pager";
import { Button } from "@/components/ui/button";
import { SeeMoreLink } from "@/components/customer/see-more-link";
import { CardCarousel } from "@/components/customer/card-carousel";
import { HOME_HIGHLIGHT_LIMIT } from "@/lib/customer/discovery-ranking";
import { useRouter } from "next/navigation";

const HERO_CROSSFADE_DURATION_MS = 240;
// Match the card widths from the responsive rail, including its outer and trailing padding.
const HOME_DESTINATION_IMAGE_SIZES = "(min-width: 1420px) 339px, (min-width: 1024px) calc(25vw - 16px), (min-width: 640px) calc(50vw - 48px), calc(50vw - 32px)";
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
  highlightItems,
  forYouItems,
  vendors,
  eventPartners = [],
  campaign,
  campaigns,
  campaignUnavailable = false,
  titleFontClassName = "",
}: {
  highlightItems: (DiscoveryResult & { property?: DiscoveryPropertySummary })[];
  forYouItems: (ComputedActivity & { property?: DiscoveryPropertySummary })[];
  vendors: DemoVendor[];
  eventPartners?: EventPartner[];
  campaign: PromotionCampaignPublic | null;
  campaigns?: PromotionCampaignPublic[];
  campaignUnavailable?: boolean;
  titleFontClassName?: string;
}) {
  const { t } = useTranslation("customer");
  const router = useRouter();
  const { currentUser } = useAuth();
  const gate = useCustomerCapabilityGate();
  const { savedStates, toggleSaved } = useSavedDestinations();
  const isGuest = !currentUser;
  // Same Sponsored analytics as Explore: one impression per placement, a click on navigation.
  const impressedPlacementIds = useRef(new Set<string>());
  const recordSponsoredEvent = useCallback((activity: DiscoveryResult, eventType: "impression" | "click") => {
    if (!activity.sponsorship) return;
    void fetch(`/api/sponsored-placements/${activity.sponsorship.placementId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, productId: activity.id }),
      keepalive: true,
    });
  }, []);
  const featuredHighlights = highlightItems.slice(0, HOME_HIGHLIGHT_LIMIT);
  // Impressions only for the highlight page the carousel settled on.
  const recordHighlightImpressions = (first: number, perPage: number) => {
    for (const activity of featuredHighlights.slice(first, first + perPage)) {
      const placementId = activity.sponsorship?.placementId;
      if (!placementId || impressedPlacementIds.current.has(placementId)) continue;
      impressedPlacementIds.current.add(placementId);
      recordSponsoredEvent(activity, "impression");
    }
  };
  const [activeState, setActiveState] = useState(() => HOME_DESTINATIONS[0].state);
  const [outgoingHeroState, setOutgoingHeroState] = useState<string | null>(null);
  const [incomingHeroVisible, setIncomingHeroVisible] = useState(false);
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

  function navigateToDestination(destinationState: string) {
    router.push(destinationHref(destinationState));
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

  return (
    <div className={`${titleFontClassName} bg-background min-h-screen text-foreground pb-20`}>
      <section className="atlas-hero-section @container relative isolate bg-background text-white">
        {/* Title and photo are one 16:9 picture sized in cqw, so every screen shows the same picture, only smaller. */}
        <div className="relative aspect-video overflow-hidden bg-[#061326]">
        <div className="absolute inset-0 z-0 overflow-hidden bg-[#061326]">
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
              className={`atlas-hero-photo atlas-hero-photo--outgoing object-cover ${outgoingHeroDestination.state === "Kuala Lumpur" ? "object-[60%_48%] md:object-center" : "object-[56%_48%]"}`}
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
            className={`atlas-hero-photo object-cover ${outgoingHeroDestination ? `atlas-hero-photo--incoming${incomingHeroVisible ? " atlas-hero-photo--incoming-visible" : ""}` : ""} ${activeDestination.state === "Kuala Lumpur" ? "object-[60%_48%] md:object-center" : "object-[56%_48%]"}`}
          />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(4,15,36,0.27)_0%,rgba(4,15,36,0.16)_27%,rgba(4,15,36,0.04)_64%,rgba(4,15,36,0.01)_100%),linear-gradient(0deg,rgba(4,17,39,0.36)_0%,rgba(4,17,39,0.16)_22%,rgba(4,17,39,0.02)_59%),linear-gradient(180deg,rgba(4,17,39,0.05)_0%,rgba(4,17,39,0)_52%)]" />
        </div>

          <header className="atlas-enter atlas-delay-1 absolute left-[6cqw] top-[7.5cqw] z-10">
            <h1 className="atlas-discover-title max-w-[88cqw] font-[family-name:var(--font-discover-title)] text-[8.6cqw] font-normal leading-[1.05] tracking-[-0.025em]">
              <span className="atlas-discover-title__ending">{activeDestination.state}</span>
            </h1>
            {/* Screen readers and touch turn activation into a plain click, so double-click alone would strand them; this link is their way in, visible only on keyboard focus. */}
            <Link
              href={destinationHref(activeDestination.state)}
              data-destination-entry=""
              className="sr-only focus-visible:not-sr-only focus-visible:mt-3 focus-visible:inline-block focus-visible:rounded-full focus-visible:bg-white focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-bold focus-visible:text-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#f4bd00]/40"
            >
              {t("ui.home.viewDestination")}
            </Link>
            <svg
              className="atlas-title-accent ml-[8cqw] mt-[1.6cqw] block w-[16cqw] text-[#f4b900]"
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
        </div>

        {/* Below 1024px the cards would crowd the photo, so they take their own row under it. */}
        <nav aria-label={t("ui.home.destinationCarousel")} className="atlas-destination-rail atlas-enter atlas-delay-2 relative z-10 px-5 pt-4 sm:px-9 lg:absolute lg:inset-x-[4.5cqw] lg:bottom-[1.6cqw] lg:p-0">
            <div ref={destinationPagerRef} className="atlas-destination-pager pb-6">
              {HOME_DESTINATIONS.map((destination) => {
                const isSelected = destination.state === activeState;
                const isSaved = savedStates.has(destination.state);
                const saveLabel = t(isSaved ? "ui.map.savedToAtlas" : "ui.map.saveToAtlas");
                return (
                  <div key={destination.state} className="atlas-destination-card relative min-w-0">
                    <button
                      type="button"
                      onClick={() => selectDestination(destination.state)}
                      onDoubleClick={() => navigateToDestination(destination.state)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          // Holding Enter repeats keydown; only the first press navigates.
                          if (!event.repeat) navigateToDestination(destination.state);
                        }
                      }}
                      aria-pressed={isSelected}
                      title={t("ui.home.destinationDoubleClick", { state: destination.state })}
                      className={`group relative block aspect-square w-full overflow-hidden rounded-[14px] border text-left transition duration-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#f4bd00]/40 sm:aspect-[4/3] lg:aspect-auto lg:h-[13cqw] ${isSelected ? "border-2 border-[#f4bd00]" : "border-border shadow-[0_4px_14px_rgb(27_35_51/0.12)] lg:border-white/70 lg:shadow-none lg:hover:border-white"}`}
                    >
                      <Image src={destination.image} alt="" fill sizes={HOME_DESTINATION_IMAGE_SIZES} className="object-cover" />
                      <span className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
                      <span className="absolute inset-x-3 bottom-2 truncate font-[family-name:var(--font-display)] text-[15px] font-semibold leading-tight text-white sm:inset-x-4 sm:bottom-3 sm:text-lg lg:text-[1.75cqw]">{destination.state}</span>
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
            <div className="flex items-center gap-3">
              <div className="lg:hidden [&_button]:bg-foreground/20">
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
              <div className="hidden lg:block">
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
              <div className="ml-auto flex items-center">
                <Button variant="ghost" size="icon" aria-label={t("ui.map.previous")} disabled={destinationPager.page <= 0} onClick={() => destinationPager.goToPage(destinationPager.page - 1)} className="text-foreground hover:bg-transparent hover:text-accent active:bg-transparent active:text-accent active:scale-[.94] disabled:text-foreground/30 disabled:opacity-100 dark:hover:bg-transparent lg:text-white lg:disabled:text-white/30">
                  <ChevronLeft size={20} aria-hidden="true" />
                </Button>
                <Button variant="ghost" size="icon" aria-label={t("ui.map.next")} disabled={destinationPager.page >= destinationPager.pageCount - 1} onClick={() => destinationPager.goToPage(destinationPager.page + 1)} className="text-foreground hover:bg-transparent hover:text-accent active:bg-transparent active:text-accent active:scale-[.94] disabled:text-foreground/30 disabled:opacity-100 dark:hover:bg-transparent lg:text-white lg:disabled:text-white/30">
                  <ChevronRight size={20} aria-hidden="true" />
                </Button>
              </div>
            </div>
        </nav>
      </section>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <PromotionCampaignSpotlight campaign={campaign} campaigns={campaigns} unavailable={campaignUnavailable} />

        {highlightItems.length > 0 && (
          <section aria-labelledby="featured-highlights-heading" className="mt-12">
            <div className="mb-5 flex items-center justify-between gap-4 border-b border-border/70 pb-4">
              <h2 id="featured-highlights-heading" className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
                {t("ui.home.featuredHighlights")}
              </h2>
              <SeeMoreLink href="/customer/explore" />
            </div>
            <CardCarousel label={t("ui.home.featuredHighlights")} onPageView={recordHighlightImpressions}>
              {featuredHighlights.map((activity) => (
                activity.property
                  ? <ActivityCard key={activity.id} activity={activity} onSponsoredClick={activity.sponsorship ? () => recordSponsoredEvent(activity, "click") : undefined} />
                  : <ProductCard key={activity.id} listing={toDiscoveryCatalogueCard(activity)} returnTo="/customer" source="home" onSponsoredClick={activity.sponsorship ? () => recordSponsoredEvent(activity, "click") : undefined} />
              ))}
            </CardCarousel>
          </section>
        )}

        {!isGuest && forYouItems.length > 0 && (
          <section aria-labelledby="for-you-heading" className="mt-12 rounded-[28px] border border-border/70 bg-secondary/35 p-4 sm:p-6 lg:p-7">
            <div className="mb-5 flex items-end justify-between gap-4">
              <h2 id="for-you-heading" className="flex items-center gap-2 font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">
                <Sparkles size={19} className="text-primary" aria-hidden="true" /> {t("ui.home.forYou")}
              </h2>
              <SeeMoreLink href="/customer/for-you" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 lg:grid-cols-4">
              {forYouItems.map((activity) => (
                activity.property
                  ? <ActivityCard key={activity.id} activity={activity} />
                  : <ProductCard key={activity.id} listing={toDiscoveryCatalogueCard(activity, { labels: false })} returnTo="/customer" />
              ))}
            </div>
          </section>
        )}

        <EventPartnersSection partners={eventPartners.slice(0, HOME_HIGHLIGHT_LIMIT)} featured />

        <section className="mt-12" aria-labelledby="nearby-partners-heading">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-border/70 pb-4">
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
              <SeeMoreLink href="/customer/vendors" />
            </div>
          </div>

          {nearbyError && <p role="alert" className="mb-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{nearbyError}</p>}
          {nearbyLoading ? (
            <p role="status" aria-live="polite" className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">{t("ui.states.loading")}</p>
          ) : nearbyPartners && nearbyPartners.length > 0 ? (
            <CardCarousel label={t("ui.home.nearbyPartners")}>
              {nearbyPartners.slice(0, HOME_HIGHLIGHT_LIMIT).map((partner, index) => <VendorCard key={partner.id} vendor={partner} index={index} />)}
            </CardCarousel>
          ) : nearbyPartners ? (
            <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground">
              {t(nearbyLocationSource === "none" ? "ui.home.nearbyNoLocation" : "ui.home.noNearbyPartners")} {" "}
              <SeeMoreLink href="/customer/vendors" ariaLabel={t("ui.home.viewPartners")} />
            </p>
          ) : null}
        </section>

        {/* 5. Featured Partners */}
        <section className="mt-12">
          <div className="mb-5 flex items-center justify-between gap-4 border-b border-border/70 pb-4">
            <h2 className="text-2xl font-bold font-[family-name:var(--font-display)]">{t("ui.home.featuredPartners")}</h2>
            <SeeMoreLink href="/customer/vendors" />
          </div>
          <CardCarousel label={t("ui.home.featuredPartners")}>
            {vendors.slice(0, HOME_HIGHLIGHT_LIMIT).map((vendor, index) => <VendorCard key={vendor.id} vendor={vendor} index={index} />)}
          </CardCarousel>
        </section>
      </div>

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
        /* Four destinations per page from 1024px, three on tablets, two on phones. */
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
          /* scale, not transform: the entry animation keeps its transform after it ends. */
          transform-origin: top center;
          transition: scale 180ms var(--atlas-ease-out);
        }

        @media (hover: hover) and (pointer: fine) {
          .atlas-destination-card:hover { scale: 1.04; z-index: 2; }
        }

        @media (max-width: 639.98px) {
          .atlas-destination-card:nth-child(2n + 1) { scroll-snap-align: start; scroll-snap-stop: always; }
          .atlas-destination-card:nth-child(2n + 1) { transform-origin: top left; }
          .atlas-destination-card:nth-child(2n) { transform-origin: top right; }
        }

        @media (min-width: 640px) and (max-width: 1023.98px) {
          .atlas-destination-pager { --per-page: 3; }
          .atlas-destination-card:nth-child(3n + 1) { scroll-snap-align: start; scroll-snap-stop: always; }
          .atlas-destination-card:nth-child(3n + 1) { transform-origin: top left; }
          .atlas-destination-card:nth-child(3n) { transform-origin: top right; }
        }

        @media (min-width: 1024px) {
          .atlas-destination-pager { --per-page: 4; --destination-gap: 1rem; }
          .atlas-destination-card:nth-child(4n + 1) { scroll-snap-align: start; scroll-snap-stop: always; }
          .atlas-destination-card:nth-child(4n + 1) { transform-origin: top left; }
          .atlas-destination-card:nth-child(4n) { transform-origin: top right; }
        }

        .atlas-discover-title {
          font-style: italic;
          font-weight: 400;
          text-shadow: 0 3px 18px color-mix(in srgb, var(--malaysia-blue) 38%, transparent);
        }

        .atlas-discover-title__lead,
        .atlas-discover-title__ending {
          padding: 0 .12em .22em 0;
          background-image: linear-gradient(108deg, #fff8e9 0%, #fff1d2 28%, var(--malaysia-yellow) 78%, #f4b900 100%);
          background-clip: text;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        :global(html:lang(zh-CN)) .atlas-discover-title {
          font-family: var(--font-display), serif;
          font-style: normal;
          font-weight: 600;
          letter-spacing: -0.055em;
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

          .atlas-destination-card:hover { scale: none; }

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
