"use client";

import Link from "next/link";
import { useState } from "react";
import { Bookmark, Compass, Heart, MapPin, PackageOpen } from "lucide-react";
import type { ComputedActivity } from "@/backend/core/types";
import { ActivityCard } from "@/components/customer/activity-card";
import { SavedDestinationCard } from "@/components/customer/saved-destination-card";
import { useSavedDestinations } from "@/components/providers/saved-destinations";
import { MALAYSIA_DESTINATIONS } from "@/lib/customer/malaysia-destinations";

type SavedDestinationRow = { state: string; savedAt: string };
type SavedTab = "all" | "places" | "experiences";

function EmptySavedState({ tab }: { tab: SavedTab }) {
  const copy = tab === "places"
    ? { title: "No saved places yet", description: "Save a destination from the atlas and keep it close for your next trip." }
    : tab === "experiences"
      ? { title: "No saved experiences yet", description: "Tap the heart on an experience to build your travel shortlist." }
      : { title: "Your saved list is empty", description: "Save destinations and experiences while you explore Malaysia." };

  return (
    <div className="rounded-3xl border border-dashed border-border bg-card px-6 py-14 text-center">
      <Bookmark size={24} className="mx-auto text-primary" />
      <h2 className="mt-4 font-[family-name:var(--font-display)] text-xl font-bold text-foreground">{copy.title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">{copy.description}</p>
      <Link href="/customer" className="mt-5 inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:bg-primary/90"><Compass size={15} /> Explore Malaysia</Link>
    </div>
  );
}

export function SavedHubClient({ activities, destinations }: { activities: ComputedActivity[]; destinations: SavedDestinationRow[] }) {
  const { savedStates, savedAt, loading } = useSavedDestinations();
  const [tab, setTab] = useState<SavedTab>("all");
  const initialStates = new Set(destinations.map((destination) => destination.state));
  const effectiveSavedStates = loading ? initialStates : savedStates;
  const savedPlaces = destinations
    .filter((destination) => effectiveSavedStates.has(destination.state))
    .map((record) => ({
      record,
      destination: MALAYSIA_DESTINATIONS.find((item) => item.state === record.state),
    }))
    .filter((item): item is { record: SavedDestinationRow; destination: (typeof MALAYSIA_DESTINATIONS)[number] } => Boolean(item.destination));
  const totalSaved = savedPlaces.length + activities.length;
  const tabs: Array<{ id: SavedTab; label: string; count: number }> = [
    { id: "all", label: "All saved", count: totalSaved },
    { id: "places", label: "Places", count: savedPlaces.length },
    { id: "experiences", label: "Experiences", count: activities.length },
  ];

  const showPlaces = tab === "all" || tab === "places";
  const showExperiences = tab === "all" || tab === "experiences";
  const hasVisibleContent = (showPlaces && savedPlaces.length > 0) || (showExperiences && activities.length > 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <header className="rounded-3xl bg-primary px-5 py-7 text-white shadow-[0_18px_45px_rgba(1,0,102,0.18)] sm:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[#ffcc00]"><Heart size={17} fill="currentColor" /><span className="text-xs font-bold uppercase tracking-[0.18em]">Your travel shortlist</span></div>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold sm:text-4xl">Saved places & experiences</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/70">Keep the destinations that change your pace and the experiences you want to book next.</p>
          </div>
          <Link href="/customer" className="inline-flex items-center gap-2 self-start rounded-full bg-[#ffcc00] px-4 py-2.5 text-xs font-bold text-primary transition hover:bg-[#ffd633] md:self-auto"><MapPin size={14} /> Explore Malaysia</Link>
        </div>
      </header>

      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card p-2" role="tablist" aria-label="Saved content">
        {tabs.map((item) => (
          <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${tab === item.id ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-primary"}`}>
            {item.label} <span className={tab === item.id ? "ml-1 text-white/70" : "ml-1 text-muted-foreground/70"}>{item.count}</span>
          </button>
        ))}
        <span className="ml-auto hidden items-center gap-1.5 px-3 text-xs font-semibold text-muted-foreground sm:inline-flex"><PackageOpen size={14} /> {totalSaved} saved</span>
      </div>

      {!hasVisibleContent ? <div className="mt-6"><EmptySavedState tab={tab} /></div> : <div className="mt-8 space-y-10">
        {showPlaces && savedPlaces.length > 0 && <section aria-labelledby="saved-places-heading"><div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Keep this one close</p><h2 id="saved-places-heading" className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">Saved places</h2></div><span className="text-xs font-semibold text-muted-foreground">{savedPlaces.length} place{savedPlaces.length === 1 ? "" : "s"}</span></div><div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{savedPlaces.map(({ record, destination }) => <SavedDestinationCard key={record.state} destination={destination} savedAt={savedAt.get(record.state) ?? record.savedAt} />)}</div></section>}
        {showExperiences && activities.length > 0 && <section aria-labelledby="saved-experiences-heading"><div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Ready when you are</p><h2 id="saved-experiences-heading" className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold text-foreground">Saved experiences</h2></div><span className="text-xs font-semibold text-muted-foreground">{activities.length} experience{activities.length === 1 ? "" : "s"}</span></div><div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-3 lg:grid-cols-4">{activities.map((activity) => <ActivityCard key={activity.id} activity={activity} returnTo="/customer/wishlist" />)}</div></section>}
      </div>}
    </div>
  );
}
