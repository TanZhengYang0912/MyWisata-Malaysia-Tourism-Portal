"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Bike, Bus, Car, Check, Clock3, Footprints, LocateFixed, MapPin, Navigation, Star } from "lucide-react";
import { DEMO_STATES, getRouteSummary } from "@/lib/demo-map/data";
import { buildDirectionsUrl } from "@/lib/demo-map/store";
import type { DemoLocation, DemoPlace, TravelMode } from "@/lib/demo-map/types";
import { MalaysiaStateMap } from "./malaysia-state-map";

const TRAVEL_MODES: Array<{ id: TravelMode; label: string; icon: typeof Car }> = [
  { id: "driving", label: "Drive", icon: Car },
  { id: "walking", label: "Walk", icon: Footprints },
  { id: "bicycling", label: "Cycle", icon: Bike },
  { id: "transit", label: "Transit", icon: Bus },
];

export function PlaceDetail({ place }: { place: DemoPlace }) {
  const [mode, setMode] = useState<TravelMode>("driving");
  const [origin, setOrigin] = useState<DemoLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "granted" | "fallback">("idle");
  const summary = useMemo(() => getRouteSummary(place, mode), [mode, place]);
  const state = DEMO_STATES.find((item) => item.id === place.stateId);
  const directionsUrl = buildDirectionsUrl(place, mode, origin ?? undefined);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationStatus("fallback");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOrigin({ lat: position.coords.latitude, lng: position.coords.longitude });
        setLocationStatus("granted");
      },
      () => setLocationStatus("fallback"),
      { timeout: 5000 },
    );
  }

  return (
    <main className="min-h-screen bg-[#f4fbf8] text-[#173b3a]">
      <header className="bg-[#0e5f58] text-white"><div className="mx-auto max-w-5xl px-5 pb-10 pt-6 sm:px-8 sm:pb-14 sm:pt-8"><Link href="/demo/map" className="inline-flex items-center gap-2 text-xs font-bold text-[#d9f1eb] hover:text-white"><ArrowLeft size={15} /> Back to Story Map</Link><div className="mt-10 flex flex-wrap items-end justify-between gap-5"><div><p className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#f5d98f]">{state?.name ?? "Malaysia"} · local place</p><h1 className="mt-3 max-w-2xl font-[family-name:var(--font-display)] text-4xl font-bold leading-tight sm:text-6xl">{place.name}</h1><p className="mt-3 flex items-center gap-2 text-sm text-[#d9f1eb]"><MapPin size={15} />{place.address}</p></div><div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-right backdrop-blur-sm"><div className="flex items-center justify-end gap-1 text-[#f5d98f]"><Star size={14} fill="currentColor" /> <span className="font-bold">{place.rating}</span></div><p className="mt-1 text-[11px] text-[#d9f1eb]">{place.reviews} local reviews</p></div></div></div></header>

      <section className="mx-auto max-w-5xl px-5 py-7 sm:px-8 sm:py-9">
        <div className="grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
          <div className="rounded-[1.75rem] border border-[#d6ebe4] bg-white p-6 shadow-[0_12px_28px_rgba(19,76,68,0.06)]"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0e5f58]">About this place</p><p className="mt-3 text-sm leading-7 text-[#5d7774]">{place.description}</p></div><div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-2xl" style={{ backgroundColor: `${place.accent}33` }}>✦</div></div><div className="mt-5 flex flex-wrap gap-2">{place.tags.map((tag) => <span key={tag} className="rounded-full bg-[#edf8f4] px-3 py-1.5 text-[11px] font-bold text-[#0e5f58]">{tag}</span>)}</div><div className="mt-6 grid grid-cols-2 gap-3 border-t border-[#edf2ef] pt-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#81938f]">Starting from</p><p className="mt-1 font-[family-name:var(--font-mono)] text-xl font-bold text-[#0e5f58]">RM {place.price}</p></div><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#81938f]">Category</p><p className="mt-1 text-sm font-bold text-[#173b3a]">{place.category}</p></div></div></div>

          <div id="directions" className="rounded-[1.75rem] border border-[#c1e1d8] bg-[#eaf8f4] p-6 shadow-[0_12px_28px_rgba(19,76,68,0.06)]"><div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0e5f58]">Plan your route</p><h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold">Choose how to go.</h2></div><Clock3 size={21} className="text-[#e59a4e]" /></div><div className="mt-5 grid grid-cols-2 gap-2">{TRAVEL_MODES.map((travelMode) => { const active = mode === travelMode.id; return <button key={travelMode.id} type="button" aria-pressed={active} onClick={() => setMode(travelMode.id)} className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${active ? "border-[#0e5f58] bg-[#0e5f58] text-white" : "border-[#c1e1d8] bg-white text-[#0e5f58] hover:bg-[#f7fcfa]"}`}><travelMode.icon size={15} />{travelMode.label}</button>; })}</div><div className="mt-5 rounded-2xl bg-white p-4"><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#81938f]">Local demo estimate</p><div className="mt-2 flex items-end justify-between gap-3"><p className="font-[family-name:var(--font-mono)] text-3xl font-bold text-[#0e5f58]">{summary.durationText}</p><p className="text-sm font-semibold text-[#5d7774]">{summary.distanceText}</p></div></div><button type="button" onClick={useCurrentLocation} className="mt-4 inline-flex items-center gap-2 text-xs font-bold text-[#0e5f58] hover:underline"><LocateFixed size={14} />{locationStatus === "granted" ? "Current location ready" : "Use my current location"}</button>{locationStatus === "fallback" && <p className="mt-2 text-[11px] font-semibold text-[#8c631a]">Location unavailable; directions will open with the destination only.</p>}<a href={directionsUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#e59a4e] px-4 py-3 text-xs font-bold text-[#173b3a] hover:bg-[#efb265]"><Navigation size={15} /> Get directions in Google Maps</a></div>
        </div>

        <section className="mt-7"><div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#0e5f58]">Where it sits</p><h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold">{state?.name ?? "Malaysia"}</h2></div><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5d7774]"><Check size={14} className="text-[#0e5f58]" /> Local map data</span></div><MalaysiaStateMap places={[{ ...place }]} selectedPlaceId={place.id} selectedStateId={place.stateId} onSelectPlace={() => undefined} onSelectState={() => undefined} /></section>
      </section>
    </main>
  );
}
