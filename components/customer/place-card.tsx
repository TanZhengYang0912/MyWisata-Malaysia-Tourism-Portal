"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, MapPin } from "lucide-react";
import type { Place } from "@/backend/core/types";

export function entryLabel(place: Place, t?: (key: string, options?: Record<string, unknown>) => string): { text: string; tone: string } {
  if (place.entryFee === null) return { text: t?.("ui.place.noGate", { defaultValue: "Public access" }) ?? "Public access", tone: "bg-muted text-muted-foreground" };
  if (place.entryFee === 0) return { text: t?.("ui.place.freeEntry", { defaultValue: "Free entry" }) ?? "Free entry", tone: "bg-emerald-100 text-emerald-800" };
  return { text: t?.("ui.place.entryFee", { price: place.entryFee, defaultValue: "RM{{price}} entry" }) ?? `RM${place.entryFee} entry`, tone: "bg-amber-100 text-amber-900" };
}

/** A region or POI card in a state/region listing — productCount is precomputed by the page, not fetched here. */
export function PlaceCard({ place, productCount }: { place: Place; productCount: number }) {
  const { t } = useTranslation("customer");
  const entry = entryLabel(place, t);
  const location = [place.district, place.state].filter(Boolean).join(", ");
  return (
    <Link
      href={`/customer/place/${place.slug}`}
      aria-label={t("ui.place.explorePlace", { name: place.name, defaultValue: "Explore {{name}}" })}
      className="group flex h-full min-h-[390px] flex-col overflow-hidden rounded-[1.5rem] border border-border bg-card shadow-sm transition duration-300 hover:-translate-y-1 hover:border-primary/25 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
    >
      <div className="relative h-48 shrink-0 overflow-hidden bg-secondary sm:h-52">
        {place.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={place.imageUrl} alt={place.name} className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-primary/15 via-secondary to-primary/5 text-5xl font-black text-primary/30">
            {place.name.charAt(0)}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-slate-950/5" aria-hidden="true" />
        <div className="absolute left-4 right-4 top-4 flex items-start justify-between gap-2">
          <span className="rounded-full bg-white/90 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary backdrop-blur-sm">
            {place.level}
          </span>
          <span className={`rounded-full px-3 py-1 text-[10px] font-bold ${entry.tone}`}>{entry.text}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="line-clamp-2 min-h-[3.5rem] font-[family-name:var(--font-display)] text-2xl font-bold leading-tight tracking-tight text-foreground">
          {place.name}
        </h3>
        <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <MapPin size={13} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">{location}</span>
        </p>
        <p className="mt-3 line-clamp-2 min-h-[2.75rem] text-sm leading-6 text-muted-foreground">
          {place.tagline || t("ui.place.cardFallback", { defaultValue: "Discover local stories, places and experiences worth the stop." })}
        </p>
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-border pt-5">
          <span className="text-xs font-bold text-primary">
            {productCount === 0 ? t("ui.labels.freeToExplore") : t("ui.place.vendorOptions", { count: productCount })}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-bold text-white">
            {productCount === 0 ? t("ui.actions.viewDetails") : t("ui.outletMenu.chooseOptions", { defaultValue: "View options" })}
            <ArrowUpRight size={14} aria-hidden="true" />
          </span>
        </div>
      </div>
    </Link>
  );
}
