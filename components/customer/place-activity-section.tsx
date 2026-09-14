"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ReferencePrice } from "@/components/shared/reference-price";
import { ArrowUpRight, Compass, Ticket } from "lucide-react";
import type { PlaceProduct } from "@/backend/core/types";
import { PlaceActivityCard } from "@/components/customer/place-activity-card";
import { buildActivityPath } from "@/lib/customer/navigation-context";
import {
  filterPlaceActivities,
  getPlaceActivityFilterCounts,
  type PlaceActivityFilter,
} from "@/lib/customer/place-list";

const FILTERS: { value: PlaceActivityFilter; key: string }[] = [
  { value: "all", key: "ui.placeActivity.filters.all" },
  { value: "admission", key: "ui.placeActivity.filters.admission" },
  { value: "guide_service", key: "ui.placeActivity.filters.guideService" },
  { value: "addon", key: "ui.placeActivity.filters.addon" },
];

function RelationIcon({ relation }: Pick<PlaceProduct, "relation">) {
  return relation === "guide_service" ? <Compass size={14} aria-hidden="true" /> : <Ticket size={14} aria-hidden="true" />;
}

export function PlaceActivitySection({ products, returnTo }: { products: PlaceProduct[]; returnTo: string }) {
  const { t } = useTranslation("customer");
  const [filter, setFilter] = useState<PlaceActivityFilter>("all");
  const counts = getPlaceActivityFilterCounts(products);
  const filtered = filterPlaceActivities(products, filter);
  const providerCount = new Set(products.map(({ vendor }) => vendor.id)).size;

  return (
    <section className="mt-10" aria-labelledby="place-activities-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{t("ui.outlet.planVisit")}</p>
          <h2 id="place-activities-heading" className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("ui.placeActivity.title")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("ui.placeActivity.summary", { experiences: t("ui.place.activityCount", { count: products.length }), providers: t("ui.place.vendorCount", { count: providerCount }) })}
          </p>
        </div>

        <div className="flex shrink-0 rounded-full border border-border bg-card p-1 shadow-sm" role="group" aria-label={t("ui.placeActivity.filterLabel")}>
          {FILTERS.map(({ value, key }) => {
            const count = counts[value];
            const isActive = filter === value;
            return (
              <button
                key={value}
                type="button"
                aria-pressed={isActive}
                onClick={() => setFilter(value)}
                className={`rounded-full px-3 py-2 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:px-3.5 ${
                  isActive ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                {t(key)} <span className={isActive ? "text-white/75" : "text-muted-foreground/70"}>({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-secondary/30 px-6 py-10 text-center">
          <p className="font-semibold text-foreground">{t("ui.placeActivity.empty")}</p>
          <button type="button" onClick={() => setFilter("all")} className="mt-2 text-sm font-bold text-primary hover:underline">
            {t("ui.placeActivity.showAll")}
          </button>
        </div>
      ) : (
        <div className="mt-6 grid items-stretch gap-6 lg:gap-8 lg:grid-cols-2">
          {filtered.map(({ product, vendor, relation }) => {
            const activityHref = buildActivityPath(product.id, returnTo);
            return (
              <PlaceActivityCard
                key={product.id}
                href={activityHref}
                imageUrl={product.image}
                imageAlt={product.name}
                imageFallback={<Compass size={24} className="text-primary/30" />}
                badge={<><RelationIcon relation={relation} />{t(`ui.place.relations.${relation}`)}</>}
                title={product.name}
                supportingText={vendor.name}
                price={<><span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("ui.vendor.from")}</span>{product.price === 0 ? t("ui.placeActivity.free") : <ReferencePrice amountMYR={product.price} />}</>}
                description={product.description || t("ui.place.activityFallback")}
                footer={t(product.requiresBooking ? "ui.place.reserveSpot" : "ui.place.availablePurchase")}
                action={<Link href={activityHref} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-bold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{product.requiresBooking ? t("ui.actions.bookNow") : t("ui.actions.viewDetails")}<ArrowUpRight size={14} aria-hidden="true" /></Link>}
              />
            );
          })}
        </div>
      )}
    </section>
  );
}
