"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";
import { DirectoryPagination } from "@/components/customer/directory-pagination";
import { DISCOVERY_CATEGORIES } from "@/lib/customer/discovery-categories";
import { getOutletShopHref } from "@/lib/customer/shop-navigation";
import type { Outlet } from "@/backend/core/types";

const PAGE_SIZE = 8;

// Real categories only — "Hidden Gem" is a collection, not something an
// outlet carries, so it never applies here.
const CATEGORY_LABELS = DISCOVERY_CATEGORIES.filter((c) => c.kind === "category").map((c) => c.label);

function OutletRow({ outlet, km }: { outlet: Outlet; km: number }) {
  return (
    <Link
      href={getOutletShopHref(outlet.id)}
      className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
    >
      {outlet.category && (
        <span className="mt-0.5 shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
          {outlet.category}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{outlet.name}</p>
        {outlet.vendorName && <p className="truncate text-xs text-muted-foreground">{outlet.vendorName}</p>}
      </div>
      <p className="shrink-0 text-xs font-bold text-muted-foreground">{km.toFixed(1)} km</p>
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
  const radiusOptions = [...new Set([1, 3, maxRadiusKm].filter((km) => km <= maxRadiusKm))];
  const [radius, setRadius] = useState(maxRadiusKm);
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

  return (
    <section className="mt-8">
      <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
        Nearby businesses
      </h2>

      {outlets.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => {
                setCategory(null);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                category === null ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            {categoriesPresent.map((label) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setCategory(category === label ? null : label);
                  setPage(1);
                }}
                className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                  category === label ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {radiusOptions.length > 1 && (
            <div className="flex flex-wrap gap-1.5 border-l border-border pl-3">
              {radiusOptions.map((km) => (
                <button
                  key={km}
                  type="button"
                  onClick={() => {
                    setRadius(km);
                    setPage(1);
                  }}
                  className={`rounded-full px-3 py-1 text-xs font-bold transition ${
                    radius === km ? "bg-primary text-white" : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {km} km
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No other outlets in range.
        </p>
      ) : (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {filtered.slice(pageStart, pageStart + PAGE_SIZE).map((entry) => (
              <OutletRow key={entry.outlet.id} outlet={entry.outlet} km={entry.km} />
            ))}
          </div>
          <DirectoryPagination
            ariaLabel="Nearby business pages"
            currentPage={safePage}
            itemLabel="businesses"
            onPageChange={setPage}
            pageSize={PAGE_SIZE}
            totalItems={filtered.length}
            totalPages={totalPages}
          />
        </>
      )}

      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-5 text-muted-foreground">
        <MapPin size={12} className="mt-0.5 shrink-0" />
        Computed from coordinates, not a foreign key — it crosses district and state boundaries, which a parent/child lookup cannot.
      </p>
    </section>
  );
}
