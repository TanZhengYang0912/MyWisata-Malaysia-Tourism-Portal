"use client";

import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/auth";
import { Bookmark, Compass, MapPin, PackageOpen } from "lucide-react";
import type { ComputedActivity } from "@/backend/core/types";
import { ActivityCard } from "@/components/customer/activity-card";
import { SavedDestinationCard } from "@/components/customer/saved-destination-card";
import { useSavedDestinations } from "@/components/providers/saved-destinations";
import { useWishlist } from "@/components/providers/wishlist";
import { groupAccommodationByProperty } from "@/lib/customer/discovery-ranking";
import { MALAYSIA_DESTINATIONS } from "@/lib/customer/malaysia-destinations";

type SavedDestinationRow = { state: string; savedAt: string };
type SavedTab = "all" | "places" | "experiences";

function EmptySavedState({ tab }: { tab: SavedTab }) {
  const { t } = useTranslation("customer");
  const copy = tab === "places"
    ? { title: t("ui.wishlist.noPlaces"), description: t("ui.wishlist.savePlaces") }
    : tab === "experiences"
      ? { title: t("ui.wishlist.noExperiences"), description: t("ui.wishlist.saveExperiences") }
      : { title: t("ui.wishlist.empty"), description: t("ui.wishlist.saveBoth") };

  return (
    <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <Bookmark size={24} className="mx-auto text-primary" />
      <h2 className="mt-4 font-[family-name:var(--font-display)] text-xl font-bold text-foreground">{copy.title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{copy.description}</p>
      <Link href="/customer" className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:bg-primary/90"><Compass size={15} /> {t("ui.wishlist.explore")}</Link>
    </div>
  );
}

export function SavedHubClient({ ownerId, activities, destinations, hotelRooms = [] }: { ownerId: string; activities: ComputedActivity[]; destinations: SavedDestinationRow[]; hotelRooms?: ComputedActivity[] }) {
  const { t: tCustomer } = useTranslation("customer");
  const { currentUser, loading: authLoading } = useAuth();
  const { savedStates, savedAt, hydrated: placesHydrated, denied: placesDenied } = useSavedDestinations();
  const { savedIds, hydrated: productsHydrated, savedOutletIds, outletHydrated, denied, outletDenied, revision } = useWishlist();
  const router = useRouter();
  const [refreshingCards, startRefresh] = useTransition();
  const attemptedRefresh = useRef('');
  const owned = !authLoading && currentUser?.id === ownerId;
  const needsOwnerSnapshot = !authLoading && Boolean(currentUser) && !owned;
  useEffect(() => { attemptedRefresh.current = ''; }, [currentUser?.id, ownerId]);
  const [tab, setTab] = useState<SavedTab>("all");
  // Server snapshots remain useful after an initial read failure, but never
  // after denial or for a different authenticated owner.
  const hotels = groupAccommodationByProperty(hotelRooms).filter((hotel) => !outletDenied && (!outletHydrated || savedOutletIds.has(hotel.outlet.id)));
  const initialStates = new Set(destinations.map((destination) => destination.state));
  const effectiveSavedStates = placesDenied ? new Set<string>() : placesHydrated ? savedStates : initialStates;
  const initialProductIds = new Set(activities.map((activity) => activity.id));
  const effectiveSavedIds = denied ? new Set<string>() : productsHydrated ? savedIds : initialProductIds;
  const savedProducts = activities.filter((activity) => effectiveSavedIds.has(activity.id));
  const destinationRows = placesHydrated
    ? [...savedStates].map(state => ({ state, savedAt: savedAt.get(state) ?? '' }))
    : destinations;
  const savedPlaces = destinationRows
    .filter((destination) => effectiveSavedStates.has(destination.state))
    .map((record) => ({
      record,
      destination: MALAYSIA_DESTINATIONS.find((item) => item.state === record.state),
    }))
    .filter((item): item is { record: SavedDestinationRow; destination: (typeof MALAYSIA_DESTINATIONS)[number] } => Boolean(item.destination));
  const totalSaved = savedPlaces.length + hotels.length + savedProducts.length;
  const tabs: Array<{ id: SavedTab; label: string; count: number }> = [
    { id: "all", label: tCustomer("ui.wishlist.allSaved"), count: totalSaved },
    { id: "places", label: tCustomer("ui.labels.places"), count: savedPlaces.length },
    { id: "experiences", label: tCustomer("ui.wishlist.savedExperiences"), count: hotels.length + savedProducts.length },
  ];

  const showPlaces = tab === "all" || tab === "places";
  const showExperiences = tab === "all" || tab === "experiences";
  const hasVisibleContent = (showPlaces && savedPlaces.length > 0) || (showExperiences && (hotels.length > 0 || savedProducts.length > 0));

  const availableOutlets = new Set(hotelRooms.map(room => room.outlet.id));
  const missingCards = owned ? [
    ...(!denied && productsHydrated ? [...savedIds].filter(id => !initialProductIds.has(id)).map(id => `product:${id}`) : []),
    ...(!outletDenied && outletHydrated ? [...savedOutletIds].filter(id => !availableOutlets.has(id)).map(id => `outlet:${id}`) : []),
  ].sort().join('|') : '';
  useEffect(() => {
    if ((!missingCards && !needsOwnerSnapshot) || refreshingCards) return;
    const signature = needsOwnerSnapshot
      ? `owner:${currentUser?.id}:server:${ownerId}`
      : `${ownerId}:${revision}:${missingCards}`;
    if (attemptedRefresh.current === signature) return;
    let timer: number | null = null;
    const schedule = () => {
      if (timer !== null) window.clearTimeout(timer);
      if (document.visibilityState !== 'visible' || attemptedRefresh.current === signature) return;
      timer = window.setTimeout(() => {
        if (document.visibilityState !== 'visible') return;
        attemptedRefresh.current = signature;
        // RSC merges preserve this page's tab and scroll; never reload Profile.
        startRefresh(() => router.refresh());
      }, 250);
    };
    schedule();
    document.addEventListener('visibilitychange', schedule);
    window.addEventListener('focus', schedule);
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', schedule);
      window.removeEventListener('focus', schedule);
    };
  }, [currentUser?.id, missingCards, needsOwnerSnapshot, ownerId, refreshingCards, revision, router]);

  if (!owned) return null;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="rounded-3xl bg-primary px-5 py-7 text-white shadow-[0_18px_45px_rgba(1,0,102,0.18)] sm:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#ffcc00]"><Bookmark size={17} fill="currentColor" /><span className="text-xs font-bold uppercase tracking-[0.18em]">{tCustomer("ui.wishlist.shortlist")}</span></div>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold sm:text-4xl">{tCustomer("ui.wishlist.title")}</h1>
          </div>
          <Link href="/customer" className="inline-flex items-center gap-2 self-start rounded-full bg-[#ffcc00] px-4 py-2.5 text-xs font-bold text-primary dark:text-[#010066] transition hover:bg-[#ffd633] md:self-auto"><MapPin size={14} /> {tCustomer("ui.wishlist.explore")}</Link>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2" role="tablist" aria-label={tCustomer("ui.wishlist.savedContent")}>
        {tabs.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${tab === item.id ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-primary"}`}>
            {item.label} <span className={tab === item.id ? "ml-1 text-white/70" : "ml-1 text-muted-foreground/70"}>{item.count}</span>
          </button>
        ))}
        <span className="ml-auto hidden items-center gap-1.5 px-3 text-xs font-semibold text-muted-foreground sm:inline-flex"><PackageOpen size={14} /> {tCustomer("ui.cart.selected", { count: totalSaved })}</span>
      </div>

      {!hasVisibleContent ? <div className="mt-6"><EmptySavedState tab={tab} /></div> : <div className="mt-8 space-y-10">
        {showPlaces && savedPlaces.length > 0 && <section aria-labelledby="saved-places-heading"><div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{tCustomer("ui.wishlist.keepClose")}</p><h2 id="saved-places-heading" className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">{tCustomer("ui.wishlist.savedPlaces")}</h2></div><span className="text-xs font-semibold text-muted-foreground">{tCustomer("ui.wishlist.placeCount", { count: savedPlaces.length })}</span></div><div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{savedPlaces.map(({ record, destination }) => <SavedDestinationCard key={record.state} destination={destination} savedAt={savedAt.get(record.state) ?? record.savedAt} />)}</div></section>}
        {showExperiences && hotels.length > 0 && <section aria-labelledby="saved-hotels-heading"><h2 id="saved-hotels-heading" className="mb-4 font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">{tCustomer("ui.wishlist.savedHotels")}</h2><div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">{hotels.map((hotel) => <ActivityCard key={hotel.outlet.id} activity={hotel} returnTo="/customer/saved" />)}</div></section>}
        {showExperiences && savedProducts.length > 0 && <section aria-labelledby="saved-experiences-heading"><div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{tCustomer("ui.wishlist.ready")}</p><h2 id="saved-experiences-heading" className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">{tCustomer("ui.wishlist.savedExperiences")}</h2></div><span className="text-xs font-semibold text-muted-foreground">{tCustomer("ui.wishlist.experienceCount", { count: hotels.length + savedProducts.length })}</span></div><div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">{savedProducts.map((activity) => <ActivityCard key={activity.id} activity={activity} returnTo="/customer/wishlist" />)}</div></section>}
      </div>}
    </div>
  );
}
