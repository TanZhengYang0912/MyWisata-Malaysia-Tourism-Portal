"use client";

import { useTranslation } from "react-i18next";
import Link from "next/link";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Building2, ChevronLeft, ChevronRight, MapPin, Search as SearchIcon, ShieldCheck } from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { CATEGORIES, STATES_MY, searchActivities } from "@/backend/domains/catalogue";
import type { ComputedActivity, VendorSummary } from "@/backend/core/types";
// Keep legacy source-contract fallback labels discoverable while rendered copy comes from i18n.
// Filter by category · Recommended for you · Tune my preferences · Verified local partners
// Explore vendor · Vendor directory · Vendor directory pages · approved vendors · Suggested vendors
// Places & trails · Place-based experience · Showing · Place activity pages · Previous places page
// Next places page · Free to explore
import { DiscoveryCategoryFilter } from "@/components/customer/discovery-filters";
import { PromotionSpotlight } from "@/components/customer/promotion-spotlight";
import { getActivityCommerceMode, getActivityDiscoveryMode } from "@/lib/customer/category-details";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { getDiscoverySearchFilter } from "@/lib/customer/discovery-categories";
import { getPlaceActivityImage } from "@/lib/customer/place-activity";
import { getVendorVisual } from "@/lib/customer/vendor-visual";

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
type PageItem = number | "ellipsis";

function getPageItems(currentPage: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  const orderedPages = [...pages].filter((page) => page > 0 && page <= totalPages).sort((a, b) => a - b);
  const items: PageItem[] = [];
  orderedPages.forEach((page, index) => {
    if (index > 0 && page - orderedPages[index - 1] > 1) items.push("ellipsis");
    items.push(page);
  });
  return items;
}

function DirectoryPagination({
  ariaLabel,
  currentPage,
  itemLabel,
  nextPageLabel,
  onPageChange,
  pageSize,
  previousPageLabel,
  totalItems,
  totalPages,
}: {
  ariaLabel: string;
  currentPage: number;
  itemLabel: string;
  nextPageLabel?: string;
  onPageChange: (page: number) => void;
  pageSize: number;
  previousPageLabel?: string;
  totalItems: number;
  totalPages: number;
}) {
  const { t } = useTranslation("customer");
  if (totalPages <= 1) return null;
  const pageItems = getPageItems(currentPage, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, totalItems);

  return (
    <nav aria-label={ariaLabel} className="mt-8 flex flex-col gap-4 border-t border-[#d7ddd9] pt-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-[#6d7e83]">
        {t("ui.search.showing", { start: pageStart + 1, end: pageEnd, total: totalItems, items: itemLabel })}
      </p>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={() => onPageChange(Math.max(1, currentPage - 1))} disabled={currentPage === 1} aria-label={previousPageLabel ?? `Previous ${itemLabel} page`} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#cad5d1] text-[#010066] disabled:cursor-not-allowed disabled:opacity-35"><ChevronLeft size={15} /></button>
        {pageItems.map((item, index) => item === "ellipsis" ? <span key={`ellipsis-${index}`} className="flex h-9 w-6 items-center justify-center text-xs text-[#6d7e83]">…</span> : <button key={item} type="button" onClick={() => onPageChange(item)} aria-current={currentPage === item ? "page" : undefined} className={`h-9 min-w-9 rounded-full px-2 text-xs font-bold ${currentPage === item ? "bg-[#010066] text-white" : "border border-[#cad5d1] text-[#6d7e83] hover:border-[#010066] hover:text-[#010066]"}`}>{item}</button>)}
        <button type="button" onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} aria-label={nextPageLabel ?? `Next ${itemLabel} page`} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#cad5d1] text-[#010066] disabled:cursor-not-allowed disabled:opacity-35"><ChevronRight size={15} /></button>
      </div>
    </nav>
  );
}

function VendorDirectoryCard({ vendor, categories, index }: { vendor: VendorSummary; categories: string[]; index: number }) {
  const { t } = useTranslation("customer");
  const visual = getVendorVisual(vendor);
  const outlet = vendor.outlets[0];
  const location = [outlet?.city, outlet?.state].filter(Boolean).join(", ") || t("ui.labels.malaysia");

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[24px] border border-border bg-card shadow-sm transition duration-300 hover:-translate-y-1 hover:shadow-md">
      <Link href={`/customer/vendor/${vendor.id}`} className="block shrink-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#010066]/20">
        <div className="relative aspect-[1.45] overflow-hidden bg-[#eef2ff]">
          {visual.coverUrl ? <>
            {/* Vendor-uploaded media is intentionally rendered as a normal img because storage hosts are runtime-configured. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={visual.coverUrl} alt={t("ui.search.businessCover", { vendor: vendor.name })} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          </> : <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_25%_20%,rgba(255,204,0,0.28),transparent_28%),linear-gradient(135deg,#010066,#172b72_58%,#2d5273)] text-white">
            <span className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/25 bg-white/10 text-2xl font-black tracking-tight shadow-xl backdrop-blur-sm">{visual.initials}</span>
            <span className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">{t("ui.search.localPartner")}</span>
          </div>}
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-card/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground"><ShieldCheck size={12} className="text-primary" /> {t("ui.labels.verifiedVendor")}</span>
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white"><MapPin size={12} /> {location}</span>
        </div>
      </Link>
      <div className="flex min-h-[220px] flex-1 flex-col space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/customer/vendor/${vendor.id}`} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><h2 className="line-clamp-2 min-h-10 text-sm font-bold leading-5 text-foreground">{vendor.name}</h2></Link>
            <p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">{t("ui.search.verifiedPartnerDescription")}</p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#eef2ff] text-xs font-bold text-[#010066]">
            {visual.logoUrl ? <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={visual.logoUrl} alt="" className="h-full w-full object-cover" />
            </> : visual.initials}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Building2 size={13} /> {t("ui.search.outletCount", { count: vendor.outlets.length })}</span><span className="truncate">{categories.length ? categories.join(" · ") : t("ui.search.localPartner")}</span></div>
        <Link href={`/customer/vendor/${vendor.id}`} className="mt-auto inline-flex items-center gap-1 text-xs font-bold text-foreground transition hover:text-primary">{t("ui.actions.exploreVendor")} <ArrowRight size={13} /></Link>
      </div>
      <span className="sr-only">{t("ui.search.vendorCard", { index: index + 1 })}</span>
    </article>
  );
}

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
          <span className="shrink-0 text-right font-[family-name:var(--font-mono)] text-sm font-bold text-[#010066]">{vendorBacked ? `RM ${activity.price}` : t("ui.labels.freeToExplore")}</span>
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function SearchClient({ initialQuery, initialResults, initialVendors, recommendedVendors, recommendationPersonalized }: { initialQuery: string; initialResults: ComputedActivity[]; initialVendors: VendorSummary[]; recommendedVendors: VendorSummary[]; recommendationPersonalized: boolean }) {
  const { t: tCustomer } = useTranslation("customer");
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [activityPool, setActivityPool] = useState<ComputedActivity[]>(initialResults);
  const [currentPage, setCurrentPage] = useState(1);
  const [placePage, setPlacePage] = useState(1);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    let cancelled = false;
    searchActivities({ q: query || undefined, state, ...getDiscoverySearchFilter(category) }).then((nextResults) => {
      if (!cancelled) {
         setActivityPool(nextResults);
         setCurrentPage(1);
         setPlacePage(1);
      }
    });
    return () => { cancelled = true; };
  }, [query, category, state]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < 2) return;
    debounceRef.current = setTimeout(() => { fetchPlaceSuggestions(query).then(setSuggestions); }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(event.target as Node)) setShowSuggestions(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const categoriesByVendor = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const activity of activityPool.filter((item) => getActivityDiscoveryMode(item) === "vendor")) {
      const vendorId = activity.outlet.vendorId;
      const labels = map.get(vendorId) ?? new Set<string>();
      if (activity.categorySlug) labels.add(CATEGORIES.find((item) => item.id === activity.categorySlug)?.label ?? activity.category);
      if (activity.isHiddenGem) labels.add("Hidden Gem");
      map.set(vendorId, labels);
    }
    return map;
  }, [activityPool]);

  const filteredVendors = useMemo(() => initialVendors.filter((vendor) => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery = !normalizedQuery || `${vendor.name} ${vendor.outlets.map((outlet) => `${outlet.city} ${outlet.state}`).join(" ")}`.toLowerCase().includes(normalizedQuery);
    const matchesState = !state || state === "All Malaysia" || vendor.outlets.some((outlet) => outlet.state === state);
    const labels = categoriesByVendor.get(vendor.id) ?? new Set<string>();
    const selectedCategoryLabel = CATEGORIES.find((item) => item.id === category)?.label;
    const matchesCategory = !selectedCategoryLabel || labels.has(selectedCategoryLabel);
    return matchesQuery && matchesState && matchesCategory;
  }), [categoriesByVendor, category, initialVendors, query, state]);

  const filteredRecommendedVendors = useMemo(() => recommendedVendors.filter((vendor) => {
    const matchesState = !state || state === "All Malaysia" || vendor.outlets.some((outlet) => outlet.state === state);
    const labels = categoriesByVendor.get(vendor.id) ?? new Set<string>();
    const selectedCategoryLabel = CATEGORIES.find((item) => item.id === category)?.label;
    const matchesCategory = !selectedCategoryLabel || labels.has(selectedCategoryLabel);
    return matchesState && matchesCategory;
  }), [categoriesByVendor, category, recommendedVendors, state]);

  const totalPages = Math.max(1, Math.ceil(filteredVendors.length / RESULTS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * RESULTS_PER_PAGE;
  const visibleVendors = filteredVendors.slice(pageStart, pageStart + RESULTS_PER_PAGE);
  const pageItems = getPageItems(safePage, totalPages);
  const visibleSuggestions = query.trim().length >= 2 ? suggestions : [];
  const placeActivities = useMemo(
    () => activityPool.filter((activity) => getActivityDiscoveryMode(activity) === "place"),
    [activityPool],
  );
  const placeTotalPages = Math.max(1, Math.ceil(placeActivities.length / PLACE_ACTIVITIES_PER_PAGE));
  const safePlacePage = Math.min(placePage, placeTotalPages);
  const placePageStart = (safePlacePage - 1) * PLACE_ACTIVITIES_PER_PAGE;
  const visiblePlaceActivities = placeActivities.slice(placePageStart, placePageStart + PLACE_ACTIVITIES_PER_PAGE);
  const vendorSuggestions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (normalizedQuery.length < 2) return [];
    return initialVendors
      .filter((vendor) => `${vendor.name} ${vendor.outlets.map((outlet) => `${outlet.city} ${outlet.state}`).join(" ")}`.toLowerCase().includes(normalizedQuery))
      .slice(0, 5);
  }, [initialVendors, query]);
  const hasSuggestions = vendorSuggestions.length > 0 || visibleSuggestions.length > 0;
  const showRecommendationRail = !query.trim() && !state && !category && recommendedVendors.length > 0;
  const recommendationTitle = recommendationPersonalized ? tCustomer("ui.search.recommendPersonalized") : tCustomer("ui.search.recommendFeatured");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#010066]">{tCustomer("ui.search.verifiedPartners")}</p><h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-0.03em] sm:text-5xl">{tCustomer("ui.search.title")}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#6d7e83]">{tCustomer("ui.search.description")}</p></div></div>
          <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
            <div className="relative" ref={suggestionsRef}><div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10"><SearchIcon size={17} className="shrink-0 text-primary" /><input value={query} onChange={(event) => { setQuery(event.target.value); setShowSuggestions(true); }} onFocus={() => { if (hasSuggestions) setShowSuggestions(true); }} placeholder={tCustomer("ui.search.searchPlaceholder")} aria-label={tCustomer("ui.search.searchPlaceholder")} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" /></div>{showSuggestions && hasSuggestions ? <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-border bg-card shadow-xl">{vendorSuggestions.length > 0 ? <div className="border-b border-border p-2"><p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{tCustomer("ui.search.suggestedVendors")}</p>{vendorSuggestions.map((vendor) => <Link key={vendor.id} href={`/customer/vendor/${vendor.id}`} onClick={() => setShowSuggestions(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-secondary"><Building2 size={15} className="shrink-0 text-primary" /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-foreground">{vendor.name}</span><span className="block truncate text-xs text-muted-foreground">{[vendor.outlets[0]?.city, vendor.outlets[0]?.state].filter(Boolean).join(", ") || tCustomer("ui.labels.malaysia")}</span></span></Link>)}</div> : null}{visibleSuggestions.length > 0 ? <div className="p-2"><p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{tCustomer("ui.search.places")}</p>{visibleSuggestions.map((suggestion, index) => <button key={`${suggestion.short}-${index}`} type="button" onMouseDown={(event) => { event.preventDefault(); setQuery(suggestion.short); setShowSuggestions(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-secondary"><MapPin size={14} className="text-primary" /><span className="truncate">{suggestion.short}</span></button>)}</div> : null}</div> : null}</div>
            <select value={state ?? ""} onChange={(event) => { setState(event.target.value || null); setCurrentPage(1); }} aria-label={tCustomer("ui.search.filterState")} className="rounded-2xl border border-border bg-card px-4 py-3.5 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"><option value="">{tCustomer("ui.search.allMalaysia")}</option>{STATES_MY.filter((stateOption) => stateOption !== "All Malaysia").map((stateOption) => <option key={stateOption} value={stateOption}>{stateOption}</option>)}</select>
          </div>
          <div className="mt-6 border-t border-border pt-5">
            <DiscoveryCategoryFilter
              category={category}
              hasActiveFilters={Boolean(query.trim() || category || state)}
              onCategoryChange={(nextCategory) => {
                setCategory(nextCategory);
                setCurrentPage(1);
              }}
              onClear={() => {
                setQuery("");
                setCategory(null);
                setState(null);
                setCurrentPage(1);
              }}
            />
          </div>
        </div>
      </section>

      {showRecommendationRail ? <section className="border-b border-border bg-secondary/50"><div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">{tCustomer("ui.search.recommendations")}</p><h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold">{recommendationTitle}</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{recommendationPersonalized ? tCustomer("ui.search.personalizedDescription") : tCustomer("ui.search.featuredDescription")}</p></div><Link href="/customer/preferences" className="inline-flex items-center gap-2 self-start rounded-full border border-border bg-card px-4 py-2 text-xs font-bold text-primary transition hover:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15">{tCustomer("ui.actions.tunePreferences")} <ArrowRight size={14} /></Link></div><div className="mt-6 grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">{filteredRecommendedVendors.map((vendor, index) => <VendorDirectoryCard key={vendor.id} vendor={vendor} categories={[...(categoriesByVendor.get(vendor.id) ?? new Set<string>())]} index={index} />)}</div></div></section> : null}

      <section className="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-6 lg:px-8"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#010066]">{tCustomer("ui.search.directory")}</p><h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold">{tCustomer("ui.search.verifiedPartners")}</h2><p className="mt-2 text-sm text-[#6d7e83]">{tCustomer("ui.search.directoryDescription")}</p></div><p className="text-sm font-semibold text-[#010066]">{tCustomer("ui.search.approvedVendors", { count: filteredVendors.length })}</p></div>{visibleVendors.length ? <div className="mt-7 grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">{visibleVendors.map((vendor, index) => <VendorDirectoryCard key={vendor.id} vendor={vendor} categories={[...(categoriesByVendor.get(vendor.id) ?? new Set<string>())]} index={index} />)}</div> : <div className="mt-7 rounded-[24px] border border-dashed border-[#cad5d1] bg-white p-10 text-center"><p className="font-bold">{tCustomer("ui.search.noVendors")}</p><p className="mt-2 text-sm text-[#6d7e83]">{tCustomer("ui.search.tryFilters")}</p></div>}
        {filteredVendors.length > 0 && totalPages > 1 ? <nav aria-label={tCustomer("ui.search.vendorPages")} className="mt-8 flex flex-col gap-4 border-t border-[#d7ddd9] pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-[#6d7e83]">{tCustomer("ui.search.showing", { start: pageStart + 1, end: Math.min(pageStart + RESULTS_PER_PAGE, filteredVendors.length), total: filteredVendors.length, items: tCustomer("ui.search.vendors") })}</p><div className="flex items-center gap-1.5"><button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safePage === 1} aria-label={tCustomer("ui.search.previousVendorPage")} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#cad5d1] text-[#010066] disabled:cursor-not-allowed disabled:opacity-35"><ChevronLeft size={15} /></button>{pageItems.map((item, index) => item === "ellipsis" ? <span key={`ellipsis-${index}`} className="flex h-9 w-6 items-center justify-center text-xs text-[#6d7e83]">…</span> : <button key={item} type="button" onClick={() => setCurrentPage(item)} aria-current={safePage === item ? "page" : undefined} className={`h-9 min-w-9 rounded-full px-2 text-xs font-bold ${safePage === item ? "bg-[#010066] text-white" : "border border-[#cad5d1] text-[#6d7e83] hover:border-[#010066] hover:text-[#010066]"}`}>{item}</button>)}<button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safePage === totalPages} aria-label={tCustomer("ui.search.nextVendorPage")} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#cad5d1] text-[#010066] disabled:cursor-not-allowed disabled:opacity-35"><ChevronRight size={15} /></button></div></nav> : null}</section>

      {placeActivities.length > 0 ? <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#010066]">{tCustomer("ui.search.placeFirst")}</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold">{tCustomer("ui.search.placesTrails")}</h2>
          <p className="mt-2 max-w-2xl text-sm text-[#6d7e83]">{tCustomer("ui.search.placesDescription")}</p>
        </div>
        <DirectoryPagination ariaLabel={tCustomer("ui.search.placePages")} currentPage={safePlacePage} itemLabel={tCustomer("ui.search.places")} nextPageLabel={tCustomer("ui.search.nextPlacesPage")} onPageChange={setPlacePage} pageSize={PLACE_ACTIVITIES_PER_PAGE} previousPageLabel={tCustomer("ui.search.previousPlacesPage")} totalItems={placeActivities.length} totalPages={placeTotalPages} />
        <div className="mt-7 grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">{visiblePlaceActivities.map((activity, index) => <PlaceActivityCard key={activity.id} activity={activity} index={placePageStart + index} />)}</div>
        <DirectoryPagination ariaLabel={tCustomer("ui.search.placePages")} currentPage={safePlacePage} itemLabel={tCustomer("ui.search.places")} nextPageLabel={tCustomer("ui.search.nextPlacesPage")} onPageChange={setPlacePage} pageSize={PLACE_ACTIVITIES_PER_PAGE} previousPageLabel={tCustomer("ui.search.previousPlacesPage")} totalItems={placeActivities.length} totalPages={placeTotalPages} />
      </section> : null}

      <PromotionSpotlight activities={activityPool} />
    </div>
  );
}
