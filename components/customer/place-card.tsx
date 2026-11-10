"use client";

import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import type { Place } from "@/backend/core/types";
import { PlaceActivityCard } from "@/components/customer/place-activity-card";
import { ReferencePrice } from "@/components/shared/reference-price";

/** What a visitor pays to enter, from the place's own entry fee (never from how many products link to it). */
export function entryLabel(place: Place, t: (key: string, options?: Record<string, unknown>) => string): ReactNode {
  if (place.entryFee === null) return t("ui.place.entryNotSpecified", { ns: "customer" });
  if (place.entryFee === 0) return <span className="text-emerald-700 dark:text-emerald-300">{t("ui.place.freeEntry", { ns: "customer" })}</span>;
  return <><ReferencePrice amountMYR={place.entryFee} className="font-bold text-foreground" /> {t("ui.place.referenceEntry", { ns: "customer" })}</>;
}

/** A region or POI card in a state/region listing — productCount is precomputed by the page, not fetched here. */
export function PlaceCard({ place, productCount }: { place: Place; productCount: number }) {
  const { t } = useTranslation("customer");
  // A real tagline first, then a real intro; nothing when both are blank (no generic copy).
  const descriptionField = place.tagline?.trim() ? "tagline" : place.intro?.trim() ? "intro" : undefined;
  return (
    <PlaceActivityCard
      href={`/customer/place/${place.slug}`}
      imageUrl={place.imageUrl}
      imageAlt={place.name}
      imageFallback={<span className="text-5xl font-black text-primary/30">{place.name.charAt(0)}</span>}
      meta={[place.district, place.state].filter(Boolean).join(", ")}
      title={place.name}
      description={descriptionField ? place[descriptionField] ?? undefined : undefined}
      translation={{ entityType: "place", entityId: place.id, titleField: "name", descriptionField }}
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs font-semibold text-muted-foreground">
          <span>{entryLabel(place, t)}</span>
          {productCount > 0 && <span className="text-primary">{t("ui.place.experienceCount", { count: productCount })}</span>}
        </div>
      )}
    />
  );
}
