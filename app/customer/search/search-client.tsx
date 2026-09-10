"use client";

import { useTranslation } from "react-i18next";
import Link from "next/link";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { STATES_MY, searchActivities } from "@/backend/domains/catalogue";
import type { ComputedActivity, SponsoredPlacement, VendorSummary } from "@/backend/core/types";
import { getPageItems } from "@/components/customer/directory-pagination";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { PromotionSpotlight } from "@/components/customer/promotion-spotlight";
import { getActivityCommerceMode, getActivityDiscoveryMode } from "@/lib/customer/category-details";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { canonicalCategorySlug, getDiscoverySearchFilter, getOptionalDiscoveryCategoryLabelKey } from "@/lib/customer/discovery-categories";
import { getPlaceActivityImage } from "@/lib/customer/place-activity";
import { DiscoveryCategoryFilter, DiscoverySearchField } from "@/components/customer/discovery-filters";
import { VendorCard } from "@/components/customer/vendor-card";
import { formatMYR } from "@/lib/i18n/format";
import {
  rankPartnerDirectory,
  selectPartnerAdvertisements,
  type PartnerSort,
  type PartnerView,
} from "@/lib/customer/partner-directory";
import { SponsoredPartnerRail } from "@/components/customer/sponsored-partner-rail";

type PlaceSuggestion = { display_name: string; short: string };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function fetchPlaceSuggestions(query: string): Promise<PlaceSuggestion[]> {
  if (query.trim().length < 2) return [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=my&format=json&limit=6&addressdetails=1`;
    const response = await fetch(url, { headers: { "Accept-Language": "en" } });
    if (!response.ok) return [];
    const data = await response.json() as Array<{ display_name: string; address?: { city?: string; town?: string; village?: string; state?: string } }>;
    return data.map((item) => {
      const address = item.address ?? {};
      const locality = address.city ?? address.town ?? address.village ?? "";
      const state = address.state ?? "";
      const short = [locality, state].filter(Boolean).join(", ") || item.display_name.split(",").slice(0, 2).join(",").trim();
      return { display_name: item.display_name, short };
    });
  } catch {
    return [];
  }
}

const RESULTS_PER_PAGE = 8;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const PLACE_ACTIVITIES_PER_PAGE = 8;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function PlaceActivityCard({ activity, index }: { activity: ComputedActivity; index: number }) {
  const { t } = useTranslation("customer");
  const location = [activity.outlet.city, activity.outlet.state].filter(Boolean).join(", ") || t("ui.labels.malaysia");
  const typeLabel = activity.typeSlugs?.[0]?.replace(/-/g, " ") || t("ui.search.outdoorExperience");
  const provider = activity.outlet.vendorName;
  const vendorBacked = getActivityCommerceMode(activity) === "vendor";
  const image = getPlaceActivityImage(activity);

  return (
    <article className="group overflow-hidden rounded-[24px] border border-border bg-card shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md">
      <Link href={`/customer/activity/${activity.id}`} className="block focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#010066]/20">
        <div className="relative aspect-[1.55] overflow-hidden bg-[#eef2ff]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={activity.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#071923]/80 via-[#071923]/5 to-transparent" />
          <span className="absolute left-3 top-3 rounded-full bg-card/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">{t("ui.labels.placeBasedExperience")}</span>
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white"><MapPin size={12} /> {location}</span>
        </div>
      </Link>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/customer/activity/${activity.id}`} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#010066]/40"><h3 className="line-clamp-2 text-sm font-bold leading-5 text-[#122b3a]">{activity.name}</h3></Link>
            <p className="mt-1 text-xs capitalize text-[#6d7e83]">{typeLabel} · {vendorBacked && activity.requiresBooking ? t("ui.search.guidedBookable") : vendorBacked ? t("ui.search.vendorExperience") : t("ui.labels.publicPlace")}</p>
          </div>
          <span className="shrink-0 text-right font-[family-name:var(--font-mono)] text-sm font-bold text-[#010066]">{vendorBacked ? formatMYR(Number(activity.price)) : t("ui.labels.freeToExplore")}</span>
        </div>
        <p className="line-clamp-2 text-xs leading-5 text-[#6d7e83]">{activity.description}</p>
        <div className="flex items-center justify-between gap-3 text-[11px] text-[#6d7e83]">
          <span className="truncate">{vendorBacked ? t("ui.search.providedBy", { vendor: provider }) : t("ui.search.noVendorRequired")}</span>
          <Link href={`/customer/activity/${activity.id}`} className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[#122b3a] transition hover:text-[#010066]">{t("ui.actions.viewDetails")} <ArrowRight size={13} /></Link>
        </div>
      </div>
      <span className="sr-only">{t("ui.search.placeCard", { index: index + 1 })}</span>
    </article>
  );
}

export function SearchClient({ initialQuery, initialResults, initialVendors, recommendedVendors, sponsoredPlacements }: { initialQuery: string; initialResults: ComputedActivity[]; initialVendors: VendorSummary[]; recommendedVendors: VendorSummary[]; sponsoredPlacements: SponsoredPlacement[] }) {
  const { t } = useTranslation("customer");
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [partnerView, setPartnerView] = useState<PartnerView>("all");
  const [partnerSort, setPartnerSort] = useState<PartnerSort>("featured");
  const [advertisementRankingTimestamp] = useState(() => new Date().toISOString());

  const categoriesByVendor = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const activity of initialResults.filter((item) => getActivityDiscoveryMode(item) === "vendor")) {
      const vendorId = activity.outlet.vendorId;
      const labels = map.get(vendorId) ?? new Set<string>();
      const canonicalSlug = canonicalCategorySlug(activity.categorySlug);
      labels.add(canonicalSlug ?? activity.categorySlug ?? activity.category);
      if (activity.isHiddenGem) labels.add("hidden_gem");
      map.set(vendorId, labels);
    }
    return map;
  }, [initialResults]);

  const matchingVendors = useMemo(() => initialVendors.filter((vendor) => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery = !normalizedQuery || `${vendor.name} ${vendor.outlets.map((outlet) => `${outlet.city} ${outlet.state}`).join(" ")}`.toLowerCase().includes(normalizedQuery);
    const matchesState = !state || state === "All Malaysia" || vendor.outlets.some((outlet) => outlet.state === state);
    const labels = categoriesByVendor.get(vendor.id) ?? new Set<string>();
    const matchesCategory = !category || labels.has(category);
    return matchesQuery && matchesState && matchesCategory;
  }), [categoriesByVendor, category, initialVendors, query, state]);

  const featuredVendorIds = useMemo(
    () => new Set(recommendedVendors.map((vendor) => vendor.id)),
    [recommendedVendors],
  );

  const filteredVendors = useMemo(() => rankPartnerDirectory({
    vendors: matchingVendors,
    featuredVendorIds,
    view: partnerView,
    sort: partnerSort,
  }), [featuredVendorIds, matchingVendors, partnerSort, partnerView]);

  const advertisements = useMemo(() => selectPartnerAdvertisements({
    activities: initialResults,
    placements: sponsoredPlacements,
    query: "",
    state: null,
    category: null,
    now: advertisementRankingTimestamp,
  }), [advertisementRankingTimestamp, initialResults, sponsoredPlacements]);

  const totalPages = Math.max(1, Math.ceil(filteredVendors.length / RESULTS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * RESULTS_PER_PAGE;
  const visibleVendors = filteredVendors.slice(pageStart, pageStart + RESULTS_PER_PAGE);
  const pageItems = getPageItems(safePage, totalPages);
  const hasActiveFilters = Boolean(query.trim() || category || state);
  const categoryLabel = category
    ? (() => {
        const key = getOptionalDiscoveryCategoryLabelKey(category);
        return key ? t(key) : category;
      })()
    : null;
  const clearFilters = () => {
    setQuery("");
    setCategory(null);
    setState(null);
    setCurrentPage(1);
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 pb-8 pt-8 sm:px-6 sm:pb-8 sm:pt-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{t("ui.search.verifiedPartners")}</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-foreground sm:text-4xl">
            {t("ui.search.title")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("ui.search.description")}
          </p>

          <div data-testid="partner-filter-bar" className="mt-6 rounded-2xl border border-border/80 bg-card p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <DiscoverySearchField
                value={query} 
                onChange={(v) => { setQuery(v); setCurrentPage(1); }} 
                placeholder={t("ui.search.searchVendors")}
              />
              <label className="flex min-h-11 w-full shrink-0 items-center rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm font-semibold text-foreground outline-none focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 sm:w-[220px]">
                <span className="sr-only">{t("ui.discovery.state")}</span>
                <select
                  aria-label={t("ui.discovery.state")}
                  value={state ?? ""}
                  onChange={(e) => { setState(e.target.value || null); setCurrentPage(1); }}
                  className="w-full bg-transparent outline-none cursor-pointer"
                >
                  <option value="">{t("ui.search.allMalaysia")}</option>
                  {STATES_MY.filter(s => s !== "All Malaysia").map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-4 border-t border-border/60 pt-4">
              <DiscoveryCategoryFilter variant="compact"
                headingKey="ui.search.category"
                includeAll
                category={category}
                hasActiveFilters={false}
                onCategoryChange={(c) => { setCategory(c); setCurrentPage(1); }}
                onClear={clearFilters}
                showClear={false}
              />
            </div>

            <div className="mt-3.5 flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
              {hasActiveFilters ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{t("ui.search.activeFilters")}</span>
                  <div data-testid="active-filter-summary" className="flex flex-wrap items-center gap-1.5">
                    {query.trim() && (
                      <button type="button" onClick={() => { setQuery(""); setCurrentPage(1); }} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10">
                        <span>{t("ui.discovery.searchLabel")}: {query.trim()}</span>
                        <span aria-hidden="true" className="font-bold">×</span>
                      </button>
                    )}
                    {state && (
                      <button type="button" onClick={() => { setState(null); setCurrentPage(1); }} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10">
                        <span>{t("ui.discovery.state")}: {state}</span>
                        <span aria-hidden="true" className="font-bold">×</span>
                      </button>
                    )}
                    {categoryLabel && (
                      <button type="button" onClick={() => { setCategory(null); setCurrentPage(1); }} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary hover:bg-primary/10">
                        <span>{t("ui.search.category")}: {categoryLabel}</span>
                        <span aria-hidden="true" className="font-bold">×</span>
                      </button>
                    )}
                  </div>
                  <button type="button" onClick={clearFilters} className="text-xs font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                    {t("ui.actions.clearFilters")}
                  </button>
                </div>
              ) : <div />}

              <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
                <label data-testid="partner-view-control" className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <span className="shrink-0">{t("ui.search.partnerView")}</span>
                  <select
                    value={partnerView}
                    onChange={(event) => { setPartnerView(event.target.value as PartnerView); setCurrentPage(1); }}
                    className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="all">{t("ui.search.allPartnersOption")}</option>
                    <option value="featured">{t("ui.search.featuredOnly")}</option>
                  </select>
                </label>
                <label data-testid="partner-sort-control" className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  <span className="shrink-0">{t("ui.search.sortPartners")}</span>
                  <select
                    value={partnerSort}
                    onChange={(event) => { setPartnerSort(event.target.value as PartnerSort); setCurrentPage(1); }}
                    className="h-9 rounded-lg border border-border bg-background px-2.5 text-xs font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="featured">{t("ui.search.featuredFirst")}</option>
                    <option value="name">{t("ui.search.nameAscending")}</option>
                    <option value="outlets">{t("ui.search.mostOutlets")}</option>
                  </select>
                </label>
              </div>
            </div>
          </div>
        </div>
      </section>

      <SponsoredPartnerRail advertisements={advertisements} />

      {/* All Vendors */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold">
              {query || category || state || partnerView === "featured" ? t("ui.search.searchResults") : t("ui.search.allPartners")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("ui.search.directoryDescription")}</p>
          </div>
        </div>
        
        {visibleVendors.length ? (
          <div className="grid items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {visibleVendors.map((vendor, index) => (
              <VendorCard
                key={vendor.id}
                vendor={vendor}
                categories={[...(categoriesByVendor.get(vendor.id) ?? new Set<string>())]}
                description={t("ui.search.approvedPartnerDescription")}
                index={index}
                isFeatured={featuredVendorIds.has(vendor.id)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-border bg-secondary/50 p-12 text-center">
            <p className="font-bold text-lg">{t("ui.search.noVendors")}</p>
            <p className="mt-2 text-sm text-muted-foreground">{t("ui.search.tryFilters")}</p>
          </div>
        )}

        {filteredVendors.length > 0 && totalPages > 1 && (
          <nav aria-label={t("ui.search.vendorPages")} className="mt-10 flex flex-col gap-4 border-t border-border pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {t("ui.search.showing", { start: pageStart + 1, end: Math.min(pageStart + RESULTS_PER_PAGE, filteredVendors.length), total: filteredVendors.length, items: t("ui.search.vendors") })}
            </p>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1} aria-label={t("ui.search.previousVendorPage")} className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-primary disabled:opacity-35"><ChevronLeft size={15} /></button>
              {pageItems.map((item, index) => item === "ellipsis" ? <span key={`ellipsis-${index}`} className="flex h-9 w-6 items-center justify-center text-xs text-muted-foreground">…</span> : <button key={item} type="button" onClick={() => setCurrentPage(item)} className={`h-9 min-w-9 rounded-full px-2 text-xs font-bold ${safePage === item ? "bg-primary text-white border-primary" : "border border-border text-muted-foreground hover:border-primary hover:text-primary"}`}>{item}</button>)}
              <button type="button" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} aria-label={t("ui.search.nextVendorPage")} className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-primary disabled:opacity-35"><ChevronRight size={15} /></button>
            </div>
          </nav>
        )}
      </section>
    </div>
  );
}
