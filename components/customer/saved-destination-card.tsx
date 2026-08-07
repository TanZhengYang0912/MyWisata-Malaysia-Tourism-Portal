"use client";

import Image from "next/image";
import Link from "next/link";
import { Bookmark, MapPin, Trash2 } from "lucide-react";
import { useSavedDestinations } from "@/components/providers/saved-destinations";
import type { MalaysiaDestination } from "@/lib/customer/malaysia-destinations";

export function SavedDestinationCard({ destination, savedAt }: { destination: MalaysiaDestination; savedAt?: string }) {
  const { savedStates, toggleSaved } = useSavedDestinations();
  const saved = savedStates.has(destination.state);

  return (
    <article className="group overflow-hidden rounded-3xl border border-border bg-card shadow-sm transition hover:-translate-y-1 hover:shadow-lg">
      <Link href={`/customer?state=${encodeURIComponent(destination.state)}`} className="block focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
        <div className="relative aspect-[1.65] overflow-hidden bg-secondary">
          <Image src={destination.image} alt={`${destination.attraction}, ${destination.state}`} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover transition duration-500 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#00004d]/85 via-[#00004d]/15 to-transparent" />
          <div className="absolute inset-x-4 bottom-4 text-white">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#ffcc00]">{destination.region}</p>
            <h3 className="mt-1 text-xl font-bold">{destination.state}</h3>
            <p className="mt-1 flex items-center gap-1 text-xs text-white/80"><MapPin size={12} /> {destination.attraction}</p>
          </div>
          <span className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary"><Bookmark size={11} fill="currentColor" /> Saved place</span>
        </div>
      </Link>
      <div className="space-y-3 p-4">
        <p className="line-clamp-2 min-h-10 text-sm leading-5 text-muted-foreground">{destination.tagline}</p>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-muted-foreground">{savedAt ? `Saved ${new Date(savedAt).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}` : "Saved to your atlas"}</span>
          <div className="flex items-center gap-2">
            <Link href={`/customer?state=${encodeURIComponent(destination.state)}`} className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white transition hover:bg-primary/90">View place</Link>
            {saved && <button type="button" onClick={() => void toggleSaved(destination.state)} aria-label={`Remove ${destination.state} from saved places`} title="Remove saved place" className="flex h-8 w-8 items-center justify-center rounded-full border border-border text-muted-foreground transition hover:border-destructive/30 hover:bg-destructive/10 hover:text-destructive"><Trash2 size={14} /></button>}
          </div>
        </div>
      </div>
    </article>
  );
}
