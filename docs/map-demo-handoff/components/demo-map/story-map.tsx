"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Bookmark, LocateFixed, MapPin, Navigation, Star } from "lucide-react";
import { DEMO_PLACES, DEMO_STATES, CATEGORY_OPTIONS, KL_LOCATION, RADIUS_OPTIONS_KM } from "@/lib/demo-map/data";
import { filterPlaces, loadDemoPreferences, saveDemoPreferences } from "@/lib/demo-map/store";
import type { DemoLocation } from "@/lib/demo-map/types";
import { MalaysiaStateMap } from "./malaysia-state-map";

export function StoryMap() {
  const [category, setCategory] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState<number>(50);
  const [selectedStateId, setSelectedStateId] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [savedPlaceIds, setSavedPlaceIds] = useState<string[]>([]);
  const [location, setLocation] = useState<DemoLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "granted" | "fallback" | "loading">("idle");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const preferences = loadDemoPreferences();
    queueMicrotask(() => {
      setCategory(preferences.category);
      setRadiusKm(preferences.radiusKm);
      setSelectedStateId(preferences.selectedStateId);
      setSavedPlaceIds(preferences.savedPlaceIds);
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveDemoPreferences({ category, radiusKm, selectedStateId, savedPlaceIds });
  }, [category, radiusKm, selectedStateId, savedPlaceIds, hydrated]);

  const places = useMemo(
    () => filterPlaces(DEMO_PLACES, { category, stateId: selectedStateId, near: location ?? undefined, radiusKm: location ? radiusKm : undefined }),
    [category, location, radiusKm, selectedStateId],
  );
  const selectedPlace = places.find((place) => place.id === selectedPlaceId) ?? null;
  const saved = selectedPlace ? savedPlaceIds.includes(selectedPlace.id) : false;

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

  function toggleSaved() {
    if (!selectedPlace) return;
    setSavedPlaceIds((current) => current.includes(selectedPlace.id) ? current.filter((id) => id !== selectedPlace.id) : [...current, selectedPlace.id]);
  }

  function selectState(stateId: string | null) {
    setSelectedStateId(stateId);
    setSelectedPlaceId(null);
  }

  return (
    <main className="min-h-screen bg-[#f4fbf8] text-[#173b3a]">
      <section className="relative overflow-hidden bg-[#0e5f58] text-white">
        <div className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full bg-[#f1c35d]/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-40 w-80 rounded-full bg-[#71c2b6]/20 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-5 pb-9 pt-8 sm:px-8 sm:pb-12 sm:pt-12">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-2xl">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.24em] text-[#f5d98f]">MyWisata · Local demo</p>
              <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold leading-[1.02] tracking-tight sm:text-6xl">Find your next story.</h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-[#d9f1eb] sm:text-base">Explore Malaysia state by state, then let the map guide you to food, culture, nature and coast.</p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-right backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#bde6dc]">Coverage</p>
              <p className="mt-1 font-[family-name:var(--font-mono)] text-2xl font-bold text-[#f5d98f]">16</p>
              <p className="text-[11px] text-[#d9f1eb]">states & territories</p>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-2" aria-label="Place categories">
            {CATEGORY_OPTIONS.map((option) => {
              const active = option.id === "all" ? category === null : category === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(option.id === "all" ? null : option.id)}
                  className={`rounded-full border px-3.5 py-2 text-xs font-bold transition ${active ? "border-[#f5d98f] bg-[#f5d98f] text-[#173b3a]" : "border-white/25 bg-white/10 text-white hover:bg-white/20"}`}
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
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#0e5f58]">Malaysia-wide discovery</p>
            <p className="mt-1 text-sm text-[#5d7774]">Tap any state, cluster or place to start a route.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex overflow-hidden rounded-full border border-[#b8ddd2] bg-white" aria-label="Nearby radius">
              {RADIUS_OPTIONS_KM.map((value) => (
                <button key={value} type="button" aria-pressed={radiusKm === value} onClick={() => setRadiusKm(value)} className={`px-3 py-2 text-[11px] font-bold ${radiusKm === value ? "bg-[#0e5f58] text-white" : "text-[#0e5f58] hover:bg-[#edf8f4]"}`}>{value} km</button>
              ))}
            </div>
            <button type="button" onClick={handleNearMe} disabled={locationStatus === "loading"} className="inline-flex items-center gap-2 rounded-full bg-[#e59a4e] px-4 py-2.5 text-xs font-bold text-[#173b3a] shadow-sm transition hover:bg-[#efb265] disabled:opacity-60">
              <LocateFixed size={14} />{locationStatus === "loading" ? "Locating…" : "Near me"}
            </button>
          </div>
        </div>

        {locationStatus === "fallback" && <p className="mb-4 rounded-xl border border-[#f1d49a] bg-[#fff9e9] px-4 py-3 text-xs font-semibold text-[#8c631a]">Location unavailable — using Kuala Lumpur for this demo.</p>}
        {locationStatus === "granted" && <p className="mb-4 rounded-xl border border-[#b8ddd2] bg-[#edf8f4] px-4 py-3 text-xs font-semibold text-[#0e5f58]">Showing places around your current location.</p>}

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
          <MalaysiaStateMap places={places} location={location} selectedPlaceId={selectedPlaceId} selectedStateId={selectedStateId} onSelectPlace={setSelectedPlaceId} onSelectState={selectState} />

          <aside className="rounded-[1.5rem] border border-[#d6ebe4] bg-white p-4 shadow-[0_12px_28px_rgba(19,76,68,0.06)]" aria-label="Malaysia state index">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0e5f58]">Browse by state</p>
                <h2 className="mt-1 font-[family-name:var(--font-display)] text-xl font-bold">Everywhere, clearly.</h2>
              </div>
              <MapPin size={18} className="mt-1 text-[#e59a4e]" />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-1.5">
              <button type="button" aria-pressed={selectedStateId === null} onClick={() => selectState(null)} className={`rounded-lg px-2 py-2 text-left text-[11px] font-bold ${selectedStateId === null ? "bg-[#0e5f58] text-white" : "bg-[#edf8f4] text-[#0e5f58] hover:bg-[#dff1eb]"}`}>All Malaysia</button>
              {DEMO_STATES.map((state) => (
                <button key={state.id} type="button" aria-pressed={selectedStateId === state.id} onClick={() => selectState(state.id)} className={`rounded-lg px-2 py-2 text-left text-[11px] font-semibold ${selectedStateId === state.id ? "bg-[#f5d98f] text-[#173b3a]" : "bg-[#f8fcfa] text-[#5d7774] hover:bg-[#edf8f4]"}`}>{state.name}</button>
              ))}
            </div>
          </aside>
        </div>

        {selectedPlace && (
          <div className="relative z-20 mx-auto -mt-20 max-w-2xl px-3 sm:-mt-24">
            <article className="rounded-[1.5rem] border border-[#e1eee9] bg-white p-4 shadow-[0_18px_40px_rgba(19,76,68,0.18)] sm:p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-2xl" style={{ backgroundColor: `${selectedPlace.accent}33` }}>✦</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-[#edf8f4] px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#0e5f58]">{selectedPlace.category}</span>
                    {selectedPlace.distanceKm !== undefined && <span className="text-[11px] font-semibold text-[#6d8581]">{selectedPlace.distanceKm.toFixed(1)} km away</span>}
                  </div>
                  <h2 className="mt-2 truncate font-[family-name:var(--font-display)] text-xl font-bold text-[#173b3a]">{selectedPlace.name}</h2>
                  <p className="mt-1 flex items-center gap-1 text-xs text-[#6d8581]"><MapPin size={12} />{selectedPlace.city} · {selectedPlace.stateId.replaceAll("-", " ")}</p>
                </div>
                <button type="button" aria-label={saved ? "Remove saved place" : "Save place"} aria-pressed={saved} onClick={toggleSaved} className={`rounded-xl p-2 ${saved ? "bg-[#f5d98f] text-[#173b3a]" : "bg-[#edf8f4] text-[#0e5f58]"}`}><Bookmark size={17} fill={saved ? "currentColor" : "none"} /></button>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[#edf2ef] pt-3">
                <div className="flex items-center gap-1 text-xs font-bold text-[#173b3a]"><Star size={13} fill="#e5a744" stroke="none" /> {selectedPlace.rating} <span className="font-normal text-[#81938f]">({selectedPlace.reviews} reviews)</span><span className="ml-2 font-[family-name:var(--font-mono)] text-sm text-[#0e5f58]">RM {selectedPlace.price}</span></div>
                <div className="flex items-center gap-2"><Link href={`/demo/map/${selectedPlace.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-[#0e5f58] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0a4b46]">View place <ArrowRight size={13} /></Link><Link href={`/demo/map/${selectedPlace.id}#directions`} className="inline-flex items-center gap-1.5 rounded-full border border-[#b8ddd2] px-4 py-2.5 text-xs font-bold text-[#0e5f58] hover:bg-[#edf8f4]"><Navigation size={13} /> Directions</Link></div>
              </div>
            </article>
          </div>
        )}

        <section className="mt-8">
          <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0e5f58]">Local stories</p><h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold">{selectedStateId ? DEMO_STATES.find((state) => state.id === selectedStateId)?.name : "Across Malaysia"}</h2></div><span className="text-xs font-semibold text-[#81938f]">{places.length} places</span></div>
          {places.length === 0 ? <div className="rounded-2xl border border-[#d6ebe4] bg-white p-8 text-center text-sm text-[#6d8581]">No local stories match this view. Try a wider radius or another state.</div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{places.slice(0, 8).map((place) => <button key={place.id} type="button" onClick={() => setSelectedPlaceId(place.id)} className={`group rounded-2xl border bg-white p-3 text-left shadow-[0_6px_18px_rgba(19,76,68,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(19,76,68,0.1)] ${place.id === selectedPlaceId ? "border-[#e5a744]" : "border-[#d6ebe4]"}`}><div className="flex items-start justify-between gap-2"><div className="flex h-9 w-9 items-center justify-center rounded-xl text-base" style={{ backgroundColor: `${place.accent}33` }}>✦</div><span className="font-[family-name:var(--font-mono)] text-[11px] font-bold text-[#0e5f58]">RM {place.price}</span></div><p className="mt-3 truncate text-sm font-bold text-[#173b3a]">{place.name}</p><p className="mt-1 truncate text-[11px] text-[#81938f]">{place.city} · {place.category}</p></button>)}</div>}
        </section>
      </section>
    </main>
  );
}
