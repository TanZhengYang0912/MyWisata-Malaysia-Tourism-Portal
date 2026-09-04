"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMYRNumber } from "@/lib/i18n/format";
import { ArrowUpRight, Compass, Ticket } from "lucide-react";
import type { PlaceProduct } from "@/backend/core/types";
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
              <article key={product.id} className="group flex flex-col sm:flex-row overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/25 hover:shadow-md">
                <Link href={activityHref} className="block relative shrink-0 sm:w-[35%] lg:w-[40%] aspect-[16/10] sm:aspect-auto overflow-hidden bg-primary/10">
                  {product.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img 
                      src={product.image} 
                      alt={product.name} 
                      className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105" 
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Compass size={24} className="text-primary/30" />
                    </div>
                  )}
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-card/95 px-2.5 py-1 text-[11px] font-bold text-primary shadow-sm">
                    <RelationIcon relation={relation} />
                    {t(`ui.place.relations.${relation}`)}
                  </span>
                </Link>

                <div className="flex flex-1 flex-col p-4 sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={activityHref} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                        <h3 className="line-clamp-2 text-lg font-bold leading-tight text-foreground transition-colors group-hover:text-primary">
                          {product.name}
                        </h3>
                      </Link>
                      <p className="mt-1 text-xs font-semibold text-primary">{vendor.name}</p>
                    </div>
                    <p className="shrink-0 text-right text-sm font-bold text-foreground">
                      <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("ui.vendor.from")}</span>
                      {product.price === 0 ? t("ui.placeActivity.free") : t("ui.placeActivity.price", { value: formatMYRNumber(product.price) })}
                    </p>
                  </div>

                  <p className="mt-3 mb-5 line-clamp-2 text-xs leading-5 text-muted-foreground">
                    {product.description || t("ui.place.activityFallback")}
                  </p>

                  <div className="mt-auto flex items-center justify-between gap-4 border-t border-border pt-4">
                    <span className="text-xs font-semibold text-muted-foreground">{t(product.requiresBooking ? "ui.place.reserveSpot" : "ui.place.availablePurchase")}</span>
                    <Link
                      href={activityHref}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-2 text-xs font-bold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      {product.requiresBooking ? t("ui.actions.bookNow") : t("ui.actions.viewDetails")}
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
