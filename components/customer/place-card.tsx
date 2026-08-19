"use client";

import { useTranslation } from "react-i18next";
import Link from "next/link";
import type { Place } from "@/backend/core/types";
import type { TFunction } from "i18next";

export function entryLabel(place: Place, t: TFunction): { text: string; tone: string } {
  if (place.entryFee === null) return { text: t("ui.place.noGate"), tone: "bg-muted text-muted-foreground" };
  if (place.entryFee === 0) return { text: t("ui.place.freeEntry"), tone: "bg-emerald-100 text-emerald-800" };
  return { text: t("ui.place.entryFee", { price: place.entryFee }), tone: "bg-amber-100 text-amber-900" };
}

/** A region or POI card in a state/region listing — productCount is precomputed by the page, not fetched here. */
export function PlaceCard({ place, productCount }: { place: Place; productCount: number }) {
  const { t } = useTranslation("customer");
  const entry = entryLabel(place, t);
  return (
    <Link
      href={`/customer/place/${place.slug}`}
      className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      {place.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={place.imageUrl} alt={place.name} className="h-28 w-full object-cover" />
      ) : (
        <div className="flex h-28 w-full items-center justify-center bg-primary/10 text-2xl font-black text-primary/40">
          {place.name.charAt(0)}
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-bold text-foreground">{place.name}</h3>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${entry.tone}`}>{entry.text}</span>
        </div>
        {place.tagline && <p className="mt-1 text-xs leading-5 text-muted-foreground">{place.tagline}</p>}
        <p className="mt-2 text-[11px] font-semibold text-primary">
          {productCount === 0 ? t("ui.place.noVendorSells") : t("ui.place.vendorOptions", { count: productCount })}
        </p>
      </div>
    </Link>
  );
}
