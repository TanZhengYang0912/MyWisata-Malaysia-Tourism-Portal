"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPin } from "lucide-react";
import { Pagination } from "@/components/shared/pagination";
import { DISCOVERY_CATEGORIES } from "@/lib/customer/discovery-categories";
import { getOutletShopHref } from "@/lib/customer/shop-navigation";
import type { Outlet } from "@/backend/core/types";
import { OutletCard } from "@/components/customer/outlet-card";

const PAGE_SIZE = 8;

// Real categories only — "Hidden Gem" is a collection, not something an
// outlet carries, so it never applies here.
const CATEGORY_LABELS = DISCOVERY_CATEGORIES.filter((c) => c.kind === "category").map((c) => c.label);
const RADIUS_OPTIONS_KM = [1, 3, 8] as const;

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
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{t("ui.nearbyOutlets.eyebrow")}</p>
          <h2 id="nearby-businesses-heading" className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("ui.nearbyOutlets.title")}
          </h2>
          <p aria-live="polite" className="mt-2 text-sm text-muted-foreground">
            {t("ui.nearbyOutlets.summary", { count: filtered.length, radius })}
          </p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5 text-xs font-bold text-primary">
          <MapPin size={13} aria-hidden="true" /> {t("ui.nearbyOutlets.approximate")}
        </span>
      </div>

      {outlets.length > 0 && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto_minmax(120px,auto)] lg:items-center">
            <div className="min-w-0 flex flex-wrap items-center gap-1.5" aria-label={t("ui.nearbyOutlets.filterType")}>
              <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{t("ui.labels.type")}</span>
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
                {t(DISCOVERY_CATEGORIES.find((categoryOption) => categoryOption.label === label)?.labelKey ?? "categories.activity")}
              </button>
            ))}
            </div>
            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto border-t border-border pt-4 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0 lg:min-w-[280px] lg:flex-nowrap lg:overflow-visible" aria-label={t("ui.nearbyOutlets.filterDistance")}>
                <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{t("ui.nearbyOutlets.within")}</span>
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
                  {t("ui.actions.clearFilters")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border bg-secondary/30 px-6 py-10 text-center">
          <p className="font-semibold text-foreground">{t("ui.nearbyOutlets.empty")}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t("ui.nearbyOutlets.emptyHint")}</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 text-sm font-bold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {t("ui.actions.clearFilters")}
          </button>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 items-start gap-3 sm:gap-5 lg:grid-cols-4">
            {filtered.slice(pageStart, pageStart + PAGE_SIZE).map(({ outlet }) => (
              <OutletCard
                key={outlet.id}
                href={getOutletShopHref(outlet.id)}
                outlet={{
                  id: outlet.id, name: outlet.name, vendorName: outlet.vendorName, city: outlet.city, state: outlet.state,
                  imageUrl: outlet.coverUrl || outlet.vendorLogoUrl,
                  rating: outlet.reviews ? { value: outlet.rating, count: outlet.reviews } : undefined,
                  openNow: outlet.currentlyOpen ?? outlet.open,
                }}
              />
            ))}
          </div>
          <Pagination
            ariaLabel={t("ui.nearbyOutlets.paginationLabel")}
            currentPage={safePage}
            onPageChange={setPage}
            pageSize={PAGE_SIZE}
            totalItems={filtered.length}
            totalPages={totalPages}
          />
        </>
      )}

      <p className="mt-4 flex items-start gap-1.5 text-[11px] leading-5 text-muted-foreground">
        <MapPin size={12} aria-hidden="true" className="mt-0.5 shrink-0" />
        {t("ui.nearbyOutlets.coordinateNote")}
      </p>
    </section>
  );
}
