"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import { ArrowRight, MapPin, Store } from "lucide-react";
import { DirectoryPagination } from "@/components/customer/directory-pagination";
import { DISCOVERY_CATEGORIES } from "@/lib/customer/discovery-categories";
import { getOutletShopHref } from "@/lib/customer/shop-navigation";
import type { Outlet } from "@/backend/core/types";

const PAGE_SIZE = 8;

// Real categories only — "Hidden Gem" is a collection, not something an
// outlet carries, so it never applies here.
const CATEGORY_LABELS = DISCOVERY_CATEGORIES.filter((c) => c.kind === "category").map((c) => c.label);
const RADIUS_OPTIONS_KM = [1, 3, 8] as const;

function OutletRow({ outlet, km }: { outlet: Outlet; km: number }) {
  return (
    <Link
      href={getOutletShopHref(outlet.id)}
      aria-label={`View ${outlet.name} shop`}
      className="group flex min-h-[96px] items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:gap-4"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary transition group-hover:bg-primary group-hover:text-white">
        <Store size={18} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="line-clamp-1 text-sm font-bold text-foreground">{outlet.name}</p>
          {outlet.category && (
            <span className="hidden shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-primary sm:inline-flex">
              {outlet.category}
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{outlet.vendorName || outlet.address || "Local partner"}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-bold text-foreground">{km.toFixed(1)} km</p>
        <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-primary">View shop <ArrowRight size={13} /></p>
      </div>
    </Link>
  );
}

/**
 * The one section every place level shares: outlets found by distance, not
 * by a `product_places` link. `outlets` is already bounded to `maxRadiusKm`
 * by the server query — the radius chips only narrow within that set, they
 * never re-fetch.
 */
export function NearbyOutlets({
  outlets,
  maxRadiusKm,
}: {
  outlets: { outlet: Outlet; km: number }[];
  maxRadiusKm: number;
}) {
  const { t } = useTranslation("customer");
  const defaultRadius = Math.min(3, maxRadiusKm);
  const [radius, setRadius] = useState(Math.min(3, maxRadiusKm));
  const [category, setCategory] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const categoriesPresent = useMemo(
    () => CATEGORY_LABELS.filter((label) => outlets.some((entry) => entry.outlet.category === label)),
    [outlets],
  );

  const filtered = outlets.filter(
    (entry) => entry.km <= radius && (!category || entry.outlet.category === category),
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE;

  function clearFilters() {
    setCategory(null);
    setRadius(defaultRadius);
    setPage(1);
  }

  return (
    <section className="mt-14" aria-labelledby="nearby-businesses-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Local partners nearby</p>
          <h2 id="nearby-businesses-heading" className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Nearby businesses
          </h2>
          <p aria-live="polite" className="mt-2 text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "business" : "businesses"} within {radius} km
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-primary">
          <MapPin size={13} aria-hidden="true" /> Approximate distance
        </span>
      </div>

      {outlets.length > 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(120px,auto)] lg:items-center">
            <div className="min-w-0 flex flex-wrap items-center gap-1.5" aria-label="Filter nearby businesses by type">
              <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Type</span>
            <button
              type="button"
              aria-pressed={category === null}
              onClick={() => {
                setCategory(null);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                category === null ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("ui.nearbyOutlets.all")}
            </button>
            {categoriesPresent.map((label) => (
              <button
                key={label}
                type="button"
                aria-pressed={category === label}
                onClick={() => {
                  setCategory(category === label ? null : label);
                  setPage(1);
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                  category === label ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(DISCOVERY_CATEGORIES.find((categoryOption) => categoryOption.label === label)?.labelKey ?? "categories.activity", { defaultValue: label })}
              </button>
            ))}
            </div>
            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto border-t border-border pt-4 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0 lg:min-w-[280px] lg:flex-nowrap lg:overflow-visible" aria-label="Filter nearby businesses by distance">
                <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Within</span>
              {RADIUS_OPTIONS_KM.map((km) => (
                <button
                  key={km}
                  type="button"
                  aria-pressed={radius === km}
                  onClick={() => {
                    setRadius(km);
                    setPage(1);
                  }}
                  className={`min-w-[64px] shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    radius === km ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("ui.nearbyOutlets.radius", { km })}
                </button>
              ))}
            </div>
            <div className="flex min-h-7 min-w-[120px] items-center justify-start lg:justify-end">
              {(category !== null || radius !== defaultRadius) && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="w-fit text-xs font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-secondary/30 px-6 py-10 text-center">
          <p className="font-semibold text-foreground">No businesses match this view.</p>
          <p className="mt-1 text-sm text-muted-foreground">Try a wider radius or clear the category filter.</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 text-sm font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <>
          <div className="mt-6 grid items-stretch gap-3 sm:grid-cols-2">
            {filtered.slice(pageStart, pageStart + PAGE_SIZE).map((entry) => (
              <OutletRow key={entry.outlet.id} outlet={entry.outlet} km={entry.km} />
            ))}
          </div>
          <DirectoryPagination
            ariaLabel={t("ui.nearbyOutlets.paginationLabel")}
            currentPage={safePage}
            itemLabel={t("ui.nearbyOutlets.itemLabel")}
            onPageChange={setPage}
            pageSize={PAGE_SIZE}
            totalItems={filtered.length}
            totalPages={totalPages}
          />
        </>
      )}

      <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-5 text-muted-foreground">
        <MapPin size={12} className="mt-0.5 shrink-0" />
        {t("ui.nearbyOutlets.coordinateNote")}
      </p>
    </section>
  );
}
