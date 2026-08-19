"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpRight, Compass, Ticket } from "lucide-react";
import type { PlaceProduct } from "@/backend/core/types";
import { buildActivityPath } from "@/lib/customer/navigation-context";
import {
  filterPlaceActivities,
  getPlaceActivityFilterCounts,
  type PlaceActivityFilter,
} from "@/lib/customer/place-list";

const FILTERS: { value: PlaceActivityFilter; labelKey: string }[] = [
  { value: "all", labelKey: "ui.placeActivity.filters.all" },
  { value: "admission", labelKey: "ui.placeActivity.filters.admission" },
  { value: "guide_service", labelKey: "ui.placeActivity.filters.guideService" },
  { value: "addon", labelKey: "ui.placeActivity.filters.addon" },
];

function RelationIcon({ relation }: Pick<PlaceProduct, "relation">) {
  return relation === "guide_service" ? <Compass size={14} aria-hidden="true" /> : <Ticket size={14} aria-hidden="true" />;
}

export function PlaceActivitySection({ products, returnTo }: { products: PlaceProduct[]; returnTo: string }) {
  const { t: tCustomer } = useTranslation("customer");
  const [filter, setFilter] = useState<PlaceActivityFilter>("all");
  const counts = getPlaceActivityFilterCounts(products);
  const filtered = filterPlaceActivities(products, filter);
  const providerCount = new Set(products.map(({ vendor }) => vendor.id)).size;

  return (
    <section className="mt-10" aria-labelledby="place-activities-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{tCustomer("ui.placeActivity.eyebrow")}</p>
          <h2 id="place-activities-heading" className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {tCustomer("ui.placeActivity.title")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {tCustomer("ui.placeActivity.summary", { experiences: products.length, providers: providerCount })}
          </p>
        </div>

        <div className="flex shrink-0 rounded-full border border-border bg-card p-1 shadow-sm" role="group" aria-label={tCustomer("ui.placeActivity.filterLabel")}>
          {FILTERS.map(({ value, labelKey }) => {
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
                {tCustomer(labelKey)} <span className={isActive ? "text-white/75" : "text-muted-foreground/70"}>({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-secondary/30 px-6 py-10 text-center">
          <p className="font-semibold text-foreground">{tCustomer("ui.placeActivity.empty")}</p>
          <button type="button" onClick={() => setFilter("all")} className="mt-2 text-sm font-bold text-primary hover:underline">
            {tCustomer("ui.placeActivity.showAll")}
          </button>
        </div>
      ) : (
        <div className="mt-6 grid items-stretch gap-4 lg:grid-cols-2">
          {filtered.map(({ product, vendor, relation }) => {
            const activityHref = buildActivityPath(product.id, returnTo);
            return (
              <article key={product.id} className="group flex min-h-[260px] flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-lg">
                <div className="flex items-start justify-between gap-4">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-primary">
                    <RelationIcon relation={relation} />
                    {tCustomer(`ui.placeActivity.relations.${relation}`)}
                  </span>
                  <p className="shrink-0 text-lg font-bold text-primary">{product.price === 0 ? tCustomer("ui.placeActivity.free") : tCustomer("ui.placeActivity.price", { value: product.price.toFixed(2) })}</p>
                </div>

                <div className="mt-5 min-w-0">
                  <h3 className="line-clamp-2 min-h-[3.5rem] font-[family-name:var(--font-display)] text-2xl font-bold leading-tight tracking-tight text-foreground">
                    {product.name}
                  </h3>
                  <p className="mt-2 text-sm font-semibold text-primary">{vendor.name}</p>
                  <p className="mt-3 line-clamp-2 min-h-[2.75rem] text-sm leading-6 text-muted-foreground">
                    {product.description || tCustomer("ui.placeActivity.fallbackDescription")}
                  </p>
                </div>

                <div className="mt-auto flex items-center justify-between gap-4 border-t border-border pt-5">
                  <span className="text-xs font-semibold text-muted-foreground">{tCustomer(product.requiresBooking ? "ui.placeActivity.reserveSpot" : "ui.placeActivity.availablePurchase")}</span>
                  <Link
                    href={activityHref}
                    className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-white transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                  >
                    {tCustomer(product.requiresBooking ? "ui.placeActivity.bookNow" : "ui.placeActivity.viewDetails")}
                    <ArrowUpRight size={15} aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
