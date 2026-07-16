"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Bookmark, LocateFixed, MapPin, Navigation, Star } from "lucide-react";
import { DEMO_STATES, KL_LOCATION, RADIUS_OPTIONS_KM, getState } from "@/lib/demo-map/data";
import { activityToMapPlace } from "@/lib/demo-map/adapt";
import { useWishlist } from "@/components/providers/wishlist";
import { CATEGORIES, searchActivities } from "@/backend/domains/catalogue";
import type { ComputedActivity } from "@/backend/core/types";
import type { DemoLocation } from "@/lib/demo-map/types";
import { MalaysiaStateMap } from "./malaysia-state-map";

export function StoryMap({ initialActivities }: { initialActivities: ComputedActivity[] }) {
  const { savedIds, toggleSaved } = useWishlist();
  const [category, setCategory] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(50);
  const [selectedStateId, setSelectedStateId] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [location, setLocation] = useState<DemoLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "granted" | "fallback" | "loading">("idle");
  const [activities, setActivities] = useState<ComputedActivity[]>(initialActivities);

  // Skip the very first run: the default view is already server-rendered via
  // initialActivities. Only refetch once state/category/location actually change.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const stateName = selectedStateId ? getState(selectedStateId)?.name ?? "All Malaysia" : "All Malaysia";
    searchActivities({ state: stateName, category, near: location ?? undefined }).then(setActivities);
  }, [selectedStateId, category, location]);

  const visibleActivities = useMemo(
    () => (location ? activities.filter((a) => (a.distanceKm ?? Infinity) <= radiusKm) : activities),
    [activities, location, radiusKm],
  );
  const places = useMemo(() => visibleActivities.map(activityToMapPlace), [visibleActivities]);
  const selectedActivity = activities.find((a) => a.id === selectedPlaceId) ?? null;
  const saved = selectedActivity ? savedIds.has(selectedActivity.id) : false;

  function handleNearMe() {
    if (!navigator.geolocation) {
      setLocation(KL_LOCATION);
      setLocationStatus("fallback");
      return;
    }
    setLocationStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationStatus("granted");
      },
      () => {
        setLocation(KL_LOCATION);
        setLocationStatus("fallback");
      },
      { timeout: 5000 },
    );
  }

  function selectState(stateId: string | null) {
    setSelectedStateId(stateId);
    setSelectedPlaceId(null);
  }

  return (
    <div className="bg-background text-foreground">
      <section className="relative overflow-hidden bg-primary text-white">
        <div className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-40 w-80 rounded-full bg-white/10 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-5 pb-9 pt-8 sm:px-8 sm:pb-12 sm:pt-12">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-2xl">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.24em] text-accent">MyWisata · Discover Malaysia</p>
              <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold leading-[1.02] tracking-tight sm:text-6xl">Find your next story.</h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/80 sm:text-base">Explore Malaysia state by state, then let the map guide you to food, culture, nature and coast.</p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-right backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">Coverage</p>
              <p className="mt-1 font-[family-name:var(--font-mono)] text-2xl font-bold text-accent">{DEMO_STATES.length}</p>
              <p className="text-[11px] text-white/80">states &amp; territories</p>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-2" aria-label="Experience categories">
            <button
              type="button"
              aria-pressed={category === null}
              onClick={() => setCategory(null)}
              className={`rounded-full border px-3.5 py-2 text-xs font-bold transition ${category === null ? "border-accent bg-accent text-accent-foreground" : "border-white/25 bg-white/10 text-white hover:bg-white/20"}`}
            >
              All places
            </button>
            {CATEGORIES.map((option) => {
              const active = category === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(active ? null : option.id)}
                  className={`rounded-full border px-3.5 py-2 text-xs font-bold transition ${active ? "border-accent bg-accent text-accent-foreground" : "border-white/25 bg-white/10 text-white hover:bg-white/20"}`}
                >
                  <span className="mr-1.5 opacity-80">{option.icon}</span>{option.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Malaysia-wide discovery</p>
            <p className="mt-1 text-sm text-muted-foreground">Tap any state, cluster or place to start a route.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-full border border-border bg-card" aria-label="Nearby radius">
              {RADIUS_OPTIONS_KM.map((value) => (
                <button key={value} type="button" aria-pressed={radiusKm === value} onClick={() => setRadiusKm(value)} className={`px-3 py-2 text-[11px] font-bold ${radiusKm === value ? "bg-primary text-white" : "text-primary hover:bg-secondary"}`}>{value} km</button>
              ))}
            </div>
            <button type="button" onClick={handleNearMe} disabled={locationStatus === "loading"} className="inline-flex items-center gap-2 rounded-full bg-cta-orange px-4 py-2.5 text-xs font-bold text-[color:var(--cta-orange-foreground)] shadow-sm transition hover:bg-cta-orange/90 disabled:opacity-60">
              <LocateFixed size={14} />{locationStatus === "loading" ? "Locating…" : "Near me"}
            </button>
          </div>
        </div>

        {locationStatus === "fallback" && <p className="mb-4 rounded-xl border border-[#f1d49a] bg-[#fff9e9] px-4 py-3 text-xs font-semibold text-[#8c631a]">Location unavailable — using Kuala Lumpur for this demo.</p>}
        {locationStatus === "granted" && <p className="mb-4 rounded-xl border border-border bg-secondary px-4 py-3 text-xs font-semibold text-primary">Showing places around your current location.</p>}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
          <MalaysiaStateMap places={places} location={location} selectedPlaceId={selectedPlaceId} selectedStateId={selectedStateId} onSelectPlace={setSelectedPlaceId} onSelectState={selectState} />

          <aside className="rounded-[1.5rem] border border-border bg-card p-4 shadow-[0_12px_28px_rgba(1,0,102,0.06)]" aria-label="Malaysia state index">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Browse by state</p>
                <h2 className="mt-1 font-[family-name:var(--font-display)] text-xl font-bold">Everywhere, clearly.</h2>
              </div>
              <MapPin size={18} className="mt-1 text-cta-orange" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-1.5">
              <button type="button" aria-pressed={selectedStateId === null} onClick={() => selectState(null)} className={`rounded-lg px-2 py-2 text-left text-[11px] font-bold ${selectedStateId === null ? "bg-primary text-white" : "bg-secondary text-primary hover:bg-primary/10"}`}>All Malaysia</button>
              {DEMO_STATES.map((state) => (
                <button key={state.id} type="button" aria-pressed={selectedStateId === state.id} onClick={() => selectState(state.id)} className={`rounded-lg px-2 py-2 text-left text-[11px] font-semibold ${selectedStateId === state.id ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground hover:bg-secondary"}`}>{state.name}</button>
              ))}
            </div>
          </aside>
        </div>

        {selectedActivity && (
          <div className="relative z-20 mx-auto -mt-20 max-w-2xl px-3 sm:-mt-24">
            <article className="rounded-[1.5rem] border border-border bg-card p-4 shadow-[0_18px_40px_rgba(1,0,102,0.18)] sm:p-5">
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- catalogue image, not an optimizable static asset */}
                <img src={selectedActivity.image} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">{selectedActivity.category}</span>
                    {selectedActivity.distanceKm !== undefined && <span className="text-[11px] font-semibold text-muted-foreground">{selectedActivity.distanceKm.toFixed(1)} km away</span>}
                  </div>
                  <h2 className="mt-2 truncate font-[family-name:var(--font-display)] text-xl font-bold text-foreground">{selectedActivity.name}</h2>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={12} />{selectedActivity.outlet.city} · {selectedActivity.outlet.state}</p>
                </div>
                <button type="button" aria-label={saved ? "Remove saved place" : "Save place"} aria-pressed={saved} onClick={() => toggleSaved(selectedActivity.id)} className={`rounded-xl p-2 ${saved ? "bg-accent text-accent-foreground" : "bg-secondary text-primary"}`}><Bookmark size={17} fill={saved ? "currentColor" : "none"} /></button>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <div className="flex items-center gap-1 text-xs font-bold text-foreground"><Star size={13} fill="var(--accent)" stroke="none" /> {selectedActivity.rating} <span className="font-normal text-muted-foreground">({selectedActivity.reviews} reviews)</span><span className="ml-2 font-[family-name:var(--font-mono)] text-sm text-primary">RM {selectedActivity.price}</span></div>
                <div className="flex items-center gap-2"><Link href={`/customer/activity/${selectedActivity.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-white hover:bg-primary/90">View place <ArrowRight size={13} /></Link><a href={`https://www.google.com/maps/search/?api=1&query=${selectedActivity.outlet.lat},${selectedActivity.outlet.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-xs font-bold text-primary hover:bg-secondary"><Navigation size={13} /> Directions</a></div>
              </div>
            </article>
          </div>
        )}

        <section className="mt-8">
          <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Malaysia experiences</p><h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold">{selectedStateId ? getState(selectedStateId)?.name : "Across Malaysia"}</h2></div><span className="text-xs font-semibold text-muted-foreground">{visibleActivities.length} places</span></div>
          {visibleActivities.length === 0 ? <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No experiences match this view. Try a wider radius or another state.</div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{visibleActivities.slice(0, 8).map((activity) => <button key={activity.id} type="button" onClick={() => setSelectedPlaceId(activity.id)} className={`group rounded-2xl border bg-card p-3 text-left shadow-[0_6px_18px_rgba(1,0,102,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(1,0,102,0.1)] ${activity.id === selectedPlaceId ? "border-cta-orange" : "border-border"}`}><div className="flex items-start justify-between gap-2">{/* eslint-disable-next-line @next/next/no-img-element -- catalogue image, not an optimizable static asset */}<img src={activity.image} alt="" className="h-9 w-9 rounded-xl object-cover" /><span className="font-[family-name:var(--font-mono)] text-[11px] font-bold text-primary">RM {activity.price}</span></div><p className="mt-3 truncate text-sm font-bold text-foreground">{activity.name}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{activity.outlet.city} · {activity.category}</p></button>)}</div>}
        </section>
      </section>
    </div>
  );
}
