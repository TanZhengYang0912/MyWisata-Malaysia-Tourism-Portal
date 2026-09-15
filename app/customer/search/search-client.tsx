"use client";

import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, MapPin } from "lucide-react";
import type { ComputedActivity, SponsoredPlacement, VendorSummary } from "@/backend/core/types";
import { getPageItems } from "@/components/customer/directory-pagination";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { PromotionSpotlight } from "@/components/customer/promotion-spotlight";
import { getActivityCommerceMode, getActivityDiscoveryMode } from "@/lib/customer/category-details";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { canonicalCategorySlug, getDiscoverySearchFilter, getOptionalDiscoveryCategoryLabelKey } from "@/lib/customer/discovery-categories";
import { getPlaceActivityImage } from "@/lib/customer/place-activity";
import { CustomerDiscoveryFilterPanel } from "@/components/customer/discovery-filters";
import { VendorCard } from "@/components/customer/vendor-card";
import { formatMYR } from "@/lib/i18n/format";
import {
  rankPartnerDirectory,
  selectPartnerAdvertisements,
  type PartnerSort,
  type PartnerView,
} from "@/lib/customer/partner-directory";
import { SponsoredPartnerRail } from "@/components/customer/sponsored-partner-rail";
import type { DiscoveryQuery } from "@/lib/customer/discovery-query";
import { isOperatingHoursAtAvailable, isOperatingHoursWindowAvailable } from "@/lib/customer/operating-hours";

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
  const [filters, setFilters] = useState<DiscoveryQuery>(() => ({
    q: initialQuery,
    state: null,
    categories: [],
    types: [],
    priceMax: null,
    operatingDays: [],
    hoursMode: "during",
    timeAt: null,
    timeFrom: null,
    timeTo: null,
    overnight: false,
    openNow: false,
    freeOnly: false,
    bookableOnly: false,
    hiddenGemOnly: false,
    familyFriendlyOnly: false,
    coupleFriendlyOnly: false,
  }));
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
    const normalizedQuery = filters.q.trim().toLowerCase();
    const matchesQuery = !normalizedQuery || `${vendor.name} ${vendor.outlets.map((outlet) => `${outlet.city} ${outlet.state}`).join(" ")}`.toLowerCase().includes(normalizedQuery);
    const matchesState = !filters.state || filters.state === "All Malaysia" || vendor.outlets.some((outlet) => outlet.state === filters.state);
    const labels = categoriesByVendor.get(vendor.id) ?? new Set<string>();
    const category = filters.categories.length === 1 ? filters.categories[0] : filters.hiddenGemOnly ? "hidden_gem" : null;
     const matchesCategory = !category || labels.has(category);
     const vendorActivities = initialResults.filter((activity) => activity.outlet.vendorId === vendor.id);
     const matchesActivities = vendorActivities.some((activity) => {
       const activityCategory = canonicalCategorySlug(activity.categorySlug) ?? activity.categorySlug ?? activity.category;
       const matchesTypes = filters.types.length === 0 || filters.types.some((token) => {
         const [selectedCategory, selectedType] = token.split(":", 2);
         return selectedCategory === activityCategory && Boolean(selectedType && activity.typeSlugs?.includes(selectedType));
       });
       const matchesCategoryBranch = filters.categories.length === 0 || filters.categories.includes(activityCategory) || (filters.hiddenGemOnly && activity.isHiddenGem);
       const matchesBoolean = !(filters.hiddenGemOnly || filters.familyFriendlyOnly || filters.coupleFriendlyOnly) ||
         (filters.hiddenGemOnly && activity.isHiddenGem) ||
         (filters.familyFriendlyOnly && activity.isFamilyFriendly) ||
         (filters.coupleFriendlyOnly && activity.isCoupleFriendly);
       const matchesPrice = filters.priceMax === null || activity.price <= filters.priceMax;
       const matchesCommerce = (!filters.freeOnly || activity.price === 0) && (!filters.bookableOnly || activity.requiresBooking);
       const hours = activity.outlet.operatingHours ?? null;
       if (filters.openNow && !(activity.outlet.currentlyOpen ?? activity.outlet.open)) return false;
       if (!matchesCategoryBranch || !matchesTypes || !matchesBoolean || !matchesPrice || !matchesCommerce) return false;
       if (filters.hoursMode === "at" && filters.timeAt) {
         return activity.outlet.open && hours ? isOperatingHoursAtAvailable(filters.timeAt, hours, filters.operatingDays) : false;
      }
      if (filters.hoursMode !== "at" && filters.timeFrom && filters.timeTo) {
        return activity.outlet.open && hours ? isOperatingHoursWindowAvailable(filters.timeFrom, filters.timeTo, hours, filters.operatingDays, { overnight: filters.overnight }) : false;
       }
       return true;
     });
     return matchesQuery && matchesState && matchesCategory && matchesActivities;
  }), [categoriesByVendor, filters, initialResults, initialVendors]);

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

  const query = filters.q;
  const category = filters.categories.length === 1 ? filters.categories[0] : filters.hiddenGemOnly ? "hidden_gem" : null;
  const state = filters.state;
  const timeFrom = filters.timeFrom;
  const timeTo = filters.timeTo;
  const openNow = filters.openNow;

  const totalPages = Math.max(1, Math.ceil(filteredVendors.length / RESULTS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * RESULTS_PER_PAGE;
  const visibleVendors = filteredVendors.slice(pageStart, pageStart + RESULTS_PER_PAGE);
  const pageItems = getPageItems(safePage, totalPages);
  const hasActiveFilters = Boolean(query.trim() || category || state || filters.types.length || filters.priceMax !== null || filters.operatingDays.length || filters.hoursMode !== "during" || filters.timeAt || timeFrom || timeTo || filters.overnight || openNow || filters.freeOnly || filters.bookableOnly || filters.familyFriendlyOnly || filters.coupleFriendlyOnly);
  const categoryLabel = category
    ? (() => {
        const key = getOptionalDiscoveryCategoryLabelKey(category);
        return key ? t(key) : category;
      })()
    : null;
  const clearFilters = () => {
    setFilters((current) => ({ ...current, q: "", state: null, categories: [], types: [], priceMax: null, hiddenGemOnly: false, operatingDays: [], hoursMode: "during", timeAt: null, timeFrom: null, timeTo: null, overnight: false, openNow: false, freeOnly: false, bookableOnly: false, familyFriendlyOnly: false, coupleFriendlyOnly: false }));
    setCurrentPage(1);
  };
  const updateFilters = (patch: Partial<DiscoveryQuery>) => {
    setFilters((current) => ({ ...current, ...patch }));
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

           <div data-testid="partner-filter-bar" className="mt-6">
            <CustomerDiscoveryFilterPanel
              value={filters}
              hasActiveFilters={hasActiveFilters}
              onChange={updateFilters}
              onClear={clearFilters}
              placeholder={t("ui.search.searchVendors")}
              category={category}
              onCategoryChange={(nextCategory) => updateFilters({ categories: nextCategory ? [nextCategory] : [], types: [], hiddenGemOnly: false })}
              categoryVariant="compact"
            />

            <div className="mt-3.5 flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
              <div data-testid="active-filter-summary" className="flex flex-wrap items-center gap-2">
                {hasActiveFilters && <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{t("ui.search.activeFilters")}</span>}
                {categoryLabel && <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary">{t("ui.search.category")}: {categoryLabel}</span>}
              </div>

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
              {query || category || state || timeFrom || timeTo || openNow || partnerView === "featured" ? t("ui.search.searchResults") : t("ui.search.allPartners")}
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
             <p className="mt-2 text-sm text-muted-foreground">{hasActiveFilters ? t("ui.discovery.adjustFilters") : t("ui.search.tryFilters")}</p>
             {hasActiveFilters && <button type="button" onClick={clearFilters} className="mt-4 rounded-full border border-primary px-4 py-2 text-xs font-bold text-primary hover:bg-background">{t("ui.actions.clearFilters")}</button>}
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
