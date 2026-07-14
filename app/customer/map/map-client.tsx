"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, List, LocateFixed, Map as MapIcon, MapPin, Star } from "lucide-react";
import { CategoryIcon } from "@/components/customer/category-icon";
import { MapView } from "@/components/map/map-view";
import { CATEGORIES, searchActivities } from "@/backend/domains/catalogue";
import { EmptyState } from "@/components/shared/empty-state";
import type { ComputedActivity } from "@/backend/core/types";

const KL_CENTER: [number, number] = [3.139, 101.6869];
const RADIUS_OPTIONS_KM = [2, 5, 10];
type SortOption = "recommended" | "distance" | "price";
type MobileView = "map" | "list";

export function MapClient({ initialActivities }: { initialActivities: ComputedActivity[] }) {
  const [category, setCategory] = useState<string | null>(null);
  const [userLoc, setUserLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locStatus, setLocStatus] = useState<"idle" | "granted" | "denied">("idle");
  const [radiusKm, setRadiusKm] = useState(5);
  const [sortBy, setSortBy] = useState<SortOption>("recommended");
  const [mobileView, setMobileView] = useState<MobileView>("map");
  const [activities, setActivities] = useState<ComputedActivity[] | null>(initialActivities);

  // Skip the very first run: the default (no category, no location) listing
  // is already server-rendered via initialActivities. Only refetch once the
  // user changes category or triggers Near Me.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    searchActivities({ category, near: userLoc ?? undefined, sort: userLoc ? "distance_asc" : "recommended" }).then(setActivities);
  }, [category, userLoc]);

  function handleNearMe() {
    if (!navigator.geolocation) {
      setUserLoc(KL_CENTER[0] === 0 ? null : { lat: KL_CENTER[0], lng: KL_CENTER[1] });
      setLocStatus("denied");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocStatus("granted");
      },
      () => {
        setUserLoc({ lat: KL_CENTER[0], lng: KL_CENTER[1] });
        setLocStatus("denied");
      },
      { timeout: 5000 },
    );
  }

  const center: [number, number] = userLoc ? [userLoc.lat, userLoc.lng] : KL_CENTER;
  // Radius filter only applies once we actually have the user's location; distanceKm
  // is populated by searchActivities whenever `near` is passed.
  const visibleActivities = userLoc ? (activities ?? []).filter((a) => (a.distanceKm ?? Infinity) <= radiusKm) : activities;
  const sortedActivities = [...(visibleActivities ?? [])].sort((a, b) => {
    if (sortBy === "price") return a.price - b.price;
    if (sortBy === "distance") return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
    return 0;
  });
  const pins = sortedActivities.map((a) => ({
    id: a.id,
    lat: a.outlet.lat,
    lng: a.outlet.lng,
    label: a.name,
    sublabel: `RM ${a.price} · ${a.outlet.city}`,
    href: `/customer/activity/${a.id}`,
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Near you</p>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold text-foreground sm:text-3xl">Explore nearby experiences</h1>
          <p className="mt-1 text-sm text-muted-foreground">Find places to eat, explore and unwind around Malaysia.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center overflow-hidden rounded-xl border border-border bg-card text-xs font-semibold shadow-sm">
            {RADIUS_OPTIONS_KM.map((km) => (
              <button
                key={km}
                onClick={() => setRadiusKm(km)}
                className="px-3 py-2 transition-colors"
                style={{
                  backgroundColor: radiusKm === km ? "var(--travel-blue)" : "transparent",
                  color: radiusKm === km ? "white" : "var(--foreground)",
                }}
              >
                {km}km
              </button>
            ))}
          </div>
          <button
            onClick={handleNearMe}
            className="flex items-center gap-1.5 rounded-xl bg-travel-blue px-4 py-2.5 text-xs font-bold text-white shadow-sm transition hover:opacity-90"
          >
            <LocateFixed size={13} /> Near Me
          </button>
        </div>
      </div>

      {locStatus === "denied" && (
        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Location unavailable — showing experiences around Kuala Lumpur instead.</p>
      )}

      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-border bg-card p-2 shadow-sm">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto hide-scrollbar">
          <button
            onClick={() => setCategory(null)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors"
            style={{
              borderColor: category === null ? "var(--travel-blue)" : "var(--border)",
              backgroundColor: category === null ? "var(--travel-blue)" : "var(--card)",
              color: category === null ? "white" : "var(--foreground)",
            }}
          >
            All
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setCategory(category === c.id ? null : c.id)}
              className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 py-2 text-xs font-semibold transition-colors"
              style={{
                borderColor: category === c.id ? "var(--travel-blue)" : "var(--border)",
                backgroundColor: category === c.id ? "var(--travel-blue)" : "var(--card)",
                color: category === c.id ? "white" : "var(--foreground)",
              }}
            >
              <CategoryIcon category={c.id} size={13} strokeWidth={2} /> {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 flex items-center justify-between gap-3 md:hidden">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-muted-foreground">Browse results</p>
        <div className="inline-flex rounded-xl border border-border bg-card p-1">
          <button type="button" onClick={() => setMobileView("map")} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${mobileView === "map" ? "bg-primary text-white" : "text-muted-foreground"}`}><MapIcon size={13} /> Map</button>
          <button type="button" onClick={() => setMobileView("list")} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${mobileView === "list" ? "bg-primary text-white" : "text-muted-foreground"}`}><List size={13} /> List</button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)] lg:items-stretch">
        <section className={`${mobileView === "list" ? "hidden lg:block" : "block"} min-w-0 rounded-3xl border border-border bg-card p-2 shadow-[0_12px_35px_rgba(1,0,102,0.08)]`} aria-label="Nearby map">
          <MapView
            pins={pins}
            center={center}
            zoom={userLoc ? 12 : 7}
            height="clamp(420px, 68vh, 680px)"
            cluster
            radiusCenter={userLoc ? [userLoc.lat, userLoc.lng] : undefined}
            radiusKm={userLoc ? radiusKm : undefined}
          />
        </section>

        <section className={`${mobileView === "map" ? "hidden lg:flex" : "flex"} min-w-0 flex-col rounded-3xl border border-border bg-card p-4 shadow-[0_12px_35px_rgba(1,0,102,0.06)]`} aria-label="Nearby experiences">
          <div className="mb-4 flex items-start justify-between gap-3 border-b border-border pb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Live results</p>
              <h2 className="mt-1 text-lg font-bold text-foreground">Nearby experiences</h2>
              <p className="mt-1 text-xs text-muted-foreground">{visibleActivities?.length ?? 0} places found in this area</p>
            </div>
            <label>
              <span className="sr-only">Sort experiences</span>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortOption)} className="rounded-lg border border-border bg-background px-2 py-1.5 text-xs font-semibold text-foreground outline-none focus:border-primary">
                <option value="recommended">Recommended</option>
                <option value="distance">Distance</option>
                <option value="price">Price</option>
              </select>
            </label>
          </div>

          {visibleActivities === null ? (
            <div className="py-10 text-sm text-muted-foreground">Loading…</div>
          ) : visibleActivities.length === 0 ? (
            <EmptyState title="No nearby results" description="Try a different category, a wider radius, or reset your filters." />
          ) : (
            <div className="min-h-0 space-y-2 overflow-y-auto pr-1 lg:max-h-[clamp(420px,68vh,680px)]">
              {sortedActivities.map((a) => (
                <Link key={a.id} href={`/customer/activity/${a.id}`} className="group flex items-center gap-3 rounded-2xl border border-border p-2.5 transition hover:border-primary/30 hover:bg-secondary/60">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.image} alt={a.name} className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2">
                      <p className="line-clamp-2 text-sm font-bold leading-snug text-foreground">{a.name}</p>
                      {a.outlet.verified && <span className="mt-0.5 shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-bold text-primary">Verified</span>}
                    </div>
                    <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground"><MapPin size={11} /> {a.outlet.city}, {a.outlet.state}</p>
                    <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><Star size={11} fill="var(--highlight-yellow)" stroke="none" /><b className="text-foreground">{a.rating}</b></span>
                      {a.distanceKm !== undefined && <span>{a.distanceKm.toFixed(1)} km away</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <p className="font-[family-name:var(--font-mono)] text-sm font-bold text-primary">RM {a.price}</p>
                    <ChevronRight size={16} className="text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
