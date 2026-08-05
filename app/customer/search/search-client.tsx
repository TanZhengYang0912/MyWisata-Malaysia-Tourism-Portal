"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Building2, ChevronLeft, ChevronRight, MapPin, Search as SearchIcon, ShieldCheck } from "lucide-react";
import { CATEGORIES, STATES_MY, searchActivities } from "@/backend/domains/catalogue";
import type { ComputedActivity, VendorSummary } from "@/backend/core/types";
import { CategoryIcon } from "@/components/customer/category-icon";
import { PromotionSpotlight } from "@/components/customer/promotion-spotlight";
import { getActivityCommerceMode, getActivityDiscoveryMode } from "@/lib/customer/category-details";
import { getDiscoverySearchFilter } from "@/lib/customer/discovery-categories";
import { getPlaceActivityImage } from "@/lib/customer/place-activity";
import { getVendorVisual } from "@/lib/customer/vendor-visual";

type PlaceSuggestion = { display_name: string; short: string };

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
  if (totalPages <= 1) return null;
  const pageItems = getPageItems(currentPage, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, totalItems);

  return (
    <nav aria-label={ariaLabel} className="mt-8 flex flex-col gap-4 border-t border-[#d7ddd9] pt-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs text-[#6d7e83]">
        Showing <span className="font-bold text-[#122b3a]">{pageStart + 1}–{pageEnd}</span> of <span className="font-bold text-[#122b3a]">{totalItems}</span> {itemLabel}
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
  const visual = getVendorVisual(vendor);
  const outlet = vendor.outlets[0];
  const location = [outlet?.city, outlet?.state].filter(Boolean).join(", ") || "Malaysia";

  return (
    <article className="group overflow-hidden rounded-[24px] border border-[#d7ddd9] bg-white shadow-[0_12px_30px_rgba(22,43,52,0.06)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_42px_rgba(22,43,52,0.11)]">
      <Link href={`/customer/vendor/${vendor.id}`} className="block focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#010066]/20">
        <div className="relative aspect-[1.45] overflow-hidden bg-[#eef2ff]">
          {visual.coverUrl ? <>
            {/* Vendor-uploaded media is intentionally rendered as a normal img because storage hosts are runtime-configured. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={visual.coverUrl} alt={`${vendor.name} business cover`} className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#071923]/80 via-[#071923]/5 to-transparent" />
          </> : <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_25%_20%,rgba(255,204,0,0.28),transparent_28%),linear-gradient(135deg,#010066,#172b72_58%,#2d5273)] text-white">
            <span className="flex h-20 w-20 items-center justify-center rounded-3xl border border-white/25 bg-white/10 text-2xl font-black tracking-tight shadow-xl backdrop-blur-sm">{visual.initials}</span>
            <span className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">Local partner</span>
          </div>}
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#173247]"><ShieldCheck size={12} className="text-[#010066]" /> Verified vendor</span>
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white"><MapPin size={12} /> {location}</span>
        </div>
      </Link>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/customer/vendor/${vendor.id}`} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#010066]/40"><h2 className="line-clamp-2 text-sm font-bold leading-5 text-[#122b3a]">{vendor.name}</h2></Link>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#6d7e83]">Verified local partner with active outlets across Malaysia.</p>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#eef2ff] text-xs font-bold text-[#010066]">
            {visual.logoUrl ? <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={visual.logoUrl} alt="" className="h-full w-full object-cover" />
            </> : visual.initials}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3 text-[11px] text-[#6d7e83]"><span className="inline-flex items-center gap-1.5"><Building2 size={13} /> {vendor.outlets.length} outlet{vendor.outlets.length === 1 ? "" : "s"}</span><span className="truncate">{categories.length ? categories.join(" · ") : "Local partner"}</span></div>
        <Link href={`/customer/vendor/${vendor.id}`} className="inline-flex items-center gap-1 text-xs font-bold text-[#122b3a] transition hover:text-[#010066]">Explore vendor <ArrowRight size={13} /></Link>
      </div>
      <span className="sr-only">Vendor card {index + 1}</span>
    </article>
  );
}

function PlaceActivityCard({ activity, index }: { activity: ComputedActivity; index: number }) {
  const location = [activity.outlet.city, activity.outlet.state].filter(Boolean).join(", ") || "Malaysia";
  const typeLabel = activity.typeSlugs?.[0]?.replace(/-/g, " ") || "Outdoor experience";
  const provider = activity.outlet.vendorName;
  const vendorBacked = getActivityCommerceMode(activity) === "vendor";
  const image = getPlaceActivityImage(activity);

  return (
    <article className="group overflow-hidden rounded-[24px] border border-[#cbd7f2] bg-white shadow-[0_12px_30px_rgba(22,43,52,0.06)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_42px_rgba(22,43,52,0.11)]">
      <Link href={`/customer/activity/${activity.id}`} className="block focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#010066]/20">
        <div className="relative aspect-[1.55] overflow-hidden bg-[#eef2ff]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={activity.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#071923]/80 via-[#071923]/5 to-transparent" />
          <span className="absolute left-3 top-3 rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#010066]">Place-based experience</span>
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white"><MapPin size={12} /> {location}</span>
        </div>
      </Link>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/customer/activity/${activity.id}`} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#010066]/40"><h3 className="line-clamp-2 text-sm font-bold leading-5 text-[#122b3a]">{activity.name}</h3></Link>
            <p className="mt-1 text-xs capitalize text-[#6d7e83]">{typeLabel} · {vendorBacked && activity.requiresBooking ? "Guided & bookable" : vendorBacked ? "Vendor experience" : "Public place"}</p>
          </div>
          <span className="shrink-0 text-right font-[family-name:var(--font-mono)] text-sm font-bold text-[#010066]">{vendorBacked ? `RM ${activity.price}` : "Free to explore"}</span>
        </div>
        <p className="line-clamp-2 text-xs leading-5 text-[#6d7e83]">{activity.description}</p>
        <div className="flex items-center justify-between gap-3 text-[11px] text-[#6d7e83]">
          <span className="truncate">{vendorBacked ? `Provided by: ${provider}` : "No vendor required"}</span>
          <Link href={`/customer/activity/${activity.id}`} className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[#122b3a] transition hover:text-[#010066]">View details <ArrowRight size={13} /></Link>
        </div>
      </div>
      <span className="sr-only">Place activity card {index + 1}</span>
    </article>
  );
}

export function SearchClient({ initialQuery, initialResults, initialVendors, recommendedVendors, recommendationPersonalized }: { initialQuery: string; initialResults: ComputedActivity[]; initialVendors: VendorSummary[]; recommendedVendors: VendorSummary[]; recommendationPersonalized: boolean }) {
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
  const recommendationTitle = recommendationPersonalized ? "Recommended for you" : "Featured local partners";

  return (
    <div className="min-h-screen bg-white text-[#122b3a]">
      <section className="border-b border-[#d7ddd9] bg-white">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 lg:px-8">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#010066]">Verified local partners</p><h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-0.03em] sm:text-5xl">Find your next local partner.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-[#6d7e83]">Browse approved vendors by category and state, then open a vendor profile to compare its outlets and experiences.</p></div></div>
          <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,1fr)_240px]">
            <div className="relative" ref={suggestionsRef}><div className="flex items-center gap-3 rounded-2xl border border-[#cad5d1] bg-white px-4 py-3.5 focus-within:border-[#010066] focus-within:ring-4 focus-within:ring-[#010066]/10"><SearchIcon size={17} className="shrink-0 text-[#010066]" /><input value={query} onChange={(event) => { setQuery(event.target.value); setShowSuggestions(true); }} onFocus={() => { if (hasSuggestions) setShowSuggestions(true); }} placeholder="Search vendors, places or states…" aria-label="Search vendors, places or states" className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[#91a0a1]" /></div>{showSuggestions && hasSuggestions ? <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-2xl border border-[#d7ddd9] bg-white shadow-xl">{vendorSuggestions.length > 0 ? <div className="border-b border-[#d7ddd9] p-2"><p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#010066]">Suggested vendors</p>{vendorSuggestions.map((vendor) => <Link key={vendor.id} href={`/customer/vendor/${vendor.id}`} onClick={() => setShowSuggestions(false)} className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[#f3f5ff]"><Building2 size={15} className="shrink-0 text-[#010066]" /><span className="min-w-0"><span className="block truncate text-sm font-semibold text-[#122b3a]">{vendor.name}</span><span className="block truncate text-xs text-[#6d7e83]">{[vendor.outlets[0]?.city, vendor.outlets[0]?.state].filter(Boolean).join(", ") || "Malaysia"}</span></span></Link>)}</div> : null}{visibleSuggestions.length > 0 ? <div className="p-2"><p className="px-3 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#6d7e83]">Places</p>{visibleSuggestions.map((suggestion, index) => <button key={`${suggestion.short}-${index}`} type="button" onMouseDown={(event) => { event.preventDefault(); setQuery(suggestion.short); setShowSuggestions(false); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-[#f3f5ff]"><MapPin size={14} className="text-[#010066]" /><span className="truncate">{suggestion.short}</span></button>)}</div> : null}</div> : null}</div>
            <select value={state ?? ""} onChange={(event) => { setState(event.target.value || null); setCurrentPage(1); }} aria-label="Filter vendors by state" className="rounded-2xl border border-[#cad5d1] bg-white px-4 py-3.5 text-sm font-semibold text-[#122b3a] outline-none focus:border-[#010066] focus:ring-4 focus:ring-[#010066]/10"><option value="">All Malaysia</option>{STATES_MY.filter((stateOption) => stateOption !== "All Malaysia").map((stateOption) => <option key={stateOption} value={stateOption}>{stateOption}</option>)}</select>
          </div>
          <div className="mt-6 border-t border-[#d7ddd9] pt-5">
            <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-[0.16em] text-[#010066]">Filter by category</p>{category ? <button type="button" onClick={() => setCategory(null)} className="text-xs font-bold text-[#010066] hover:underline">Clear category</button> : null}</div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{CATEGORIES.map((categoryOption) => <button key={categoryOption.id} type="button" onClick={() => { setCategory((value) => value === categoryOption.id ? null : categoryOption.id); setCurrentPage(1); }} aria-pressed={category === categoryOption.id} className={`inline-flex h-16 w-full min-w-0 items-center gap-3 rounded-2xl border px-4 text-left text-sm font-bold transition ${category === categoryOption.id ? "border-[#010066] bg-[#eef2ff] text-[#010066] shadow-[0_8px_20px_rgba(1,0,102,0.08)]" : "border-[#d7ddd9] bg-white text-[#122b3a] hover:border-[#010066]/50"}`}><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${category === categoryOption.id ? "bg-[#010066] text-white" : "bg-[#eef2ff] text-[#010066]"}`}><CategoryIcon category={categoryOption.id} size={17} /></span><span className="min-w-0 truncate leading-tight">{categoryOption.label}</span></button>)}</div>
          </div>
        </div>
      </section>

      {showRecommendationRail ? <section className="border-b border-[#d7ddd9] bg-[#f7f8ff]"><div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#010066]">Partner recommendations</p><h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold">{recommendationTitle}</h2><p className="mt-2 max-w-2xl text-sm text-[#6d7e83]">{recommendationPersonalized ? "Partners selected from experiences that match your travel preferences." : "A stable starting point while you build your travel preferences."}</p></div><Link href="/customer/preferences" className="inline-flex items-center gap-2 self-start rounded-full border border-[#c5cfee] bg-white px-4 py-2 text-xs font-bold text-[#010066] transition hover:border-[#010066] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#010066]/15">Tune my preferences <ArrowRight size={14} /></Link></div><div className="mt-6 grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">{recommendedVendors.map((vendor, index) => <VendorDirectoryCard key={vendor.id} vendor={vendor} categories={[...(categoriesByVendor.get(vendor.id) ?? new Set<string>())]} index={index} />)}</div></div></section> : null}

      <section className="mx-auto max-w-7xl px-4 pb-14 pt-8 sm:px-6 lg:px-8"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#010066]">Vendor directory</p><h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold">Verified local partners</h2><p className="mt-2 text-sm text-[#6d7e83]">All vendors are approved partners. Choose one first; outlet and package choices stay clear on its profile.</p></div><p className="text-sm font-semibold text-[#010066]">{filteredVendors.length} approved vendors</p></div>{visibleVendors.length ? <div className="mt-7 grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">{visibleVendors.map((vendor, index) => <VendorDirectoryCard key={vendor.id} vendor={vendor} categories={[...(categoriesByVendor.get(vendor.id) ?? new Set<string>())]} index={index} />)}</div> : <div className="mt-7 rounded-[24px] border border-dashed border-[#cad5d1] bg-white p-10 text-center"><p className="font-bold">No approved vendors match these filters.</p><p className="mt-2 text-sm text-[#6d7e83]">Try another category, state or search term.</p></div>}
        {filteredVendors.length > 0 && totalPages > 1 ? <nav aria-label="Vendor directory pages" className="mt-8 flex flex-col gap-4 border-t border-[#d7ddd9] pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-[#6d7e83]">Showing <span className="font-bold text-[#122b3a]">{pageStart + 1}–{Math.min(pageStart + RESULTS_PER_PAGE, filteredVendors.length)}</span> of <span className="font-bold text-[#122b3a]">{filteredVendors.length}</span> vendors</p><div className="flex items-center gap-1.5"><button type="button" onClick={() => setCurrentPage((page) => Math.max(1, page - 1))} disabled={safePage === 1} aria-label="Previous vendor page" className="flex h-9 w-9 items-center justify-center rounded-full border border-[#cad5d1] text-[#010066] disabled:cursor-not-allowed disabled:opacity-35"><ChevronLeft size={15} /></button>{pageItems.map((item, index) => item === "ellipsis" ? <span key={`ellipsis-${index}`} className="flex h-9 w-6 items-center justify-center text-xs text-[#6d7e83]">…</span> : <button key={item} type="button" onClick={() => setCurrentPage(item)} aria-current={safePage === item ? "page" : undefined} className={`h-9 min-w-9 rounded-full px-2 text-xs font-bold ${safePage === item ? "bg-[#010066] text-white" : "border border-[#cad5d1] text-[#6d7e83] hover:border-[#010066] hover:text-[#010066]"}`}>{item}</button>)}<button type="button" onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))} disabled={safePage === totalPages} aria-label="Next vendor page" className="flex h-9 w-9 items-center justify-center rounded-full border border-[#cad5d1] text-[#010066] disabled:cursor-not-allowed disabled:opacity-35"><ChevronRight size={15} /></button></div></nav> : null}</section>

      {placeActivities.length > 0 ? <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#010066]">Place-first discovery</p>
          <h2 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold">Places & trails</h2>
          <p className="mt-2 max-w-2xl text-sm text-[#6d7e83]">The trail, park, or heritage route is the experience itself. Paid guided routes show their provider; public places never show a charge.</p>
        </div>
        <DirectoryPagination ariaLabel="Place activity pages" currentPage={safePlacePage} itemLabel="places" nextPageLabel="Next places page" onPageChange={setPlacePage} pageSize={PLACE_ACTIVITIES_PER_PAGE} previousPageLabel="Previous places page" totalItems={placeActivities.length} totalPages={placeTotalPages} />
        <div className="mt-7 grid items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-4">{visiblePlaceActivities.map((activity, index) => <PlaceActivityCard key={activity.id} activity={activity} index={placePageStart + index} />)}</div>
        <DirectoryPagination ariaLabel="Place activity pages" currentPage={safePlacePage} itemLabel="places" nextPageLabel="Next places page" onPageChange={setPlacePage} pageSize={PLACE_ACTIVITIES_PER_PAGE} previousPageLabel="Previous places page" totalItems={placeActivities.length} totalPages={placeTotalPages} />
      </section> : null}

      <PromotionSpotlight activities={activityPool} />
    </div>
  );
}
