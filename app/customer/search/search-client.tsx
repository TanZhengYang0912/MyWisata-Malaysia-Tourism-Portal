"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Building2, ChevronLeft, ChevronRight, MapPin, Search as SearchIcon, ShieldCheck } from "lucide-react";
import { CATEGORIES, STATES_MY, searchActivities } from "@/backend/domains/catalogue";
import type { ComputedActivity, VendorSummary } from "@/backend/core/types";
import { CategoryIcon } from "@/components/customer/category-icon";
import { getPageItems } from "@/components/customer/directory-pagination";
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
  const [currentPage, setCurrentPage] = useState(1);

  const categoriesByVendor = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const activity of initialResults.filter((item) => getActivityDiscoveryMode(item) === "vendor")) {
      const vendorId = activity.outlet.vendorId;
      const labels = map.get(vendorId) ?? new Set<string>();
      if (activity.categorySlug) labels.add(CATEGORIES.find((item) => item.id === activity.categorySlug)?.label ?? activity.category);
      if (activity.isHiddenGem) labels.add("Hidden Gem");
      map.set(vendorId, labels);
    }
    return map;
  }, [initialResults]);

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

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Our Partners</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-foreground sm:text-4xl">
            Meet the people behind your next good stop.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Browse verified local partners, vendors and businesses across Malaysia.
          </p>

          {/* Search Tools & Filters */}
          <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex w-full max-w-2xl gap-3">
              <div className="flex flex-1 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
                <SearchIcon size={17} className="shrink-0 text-primary" />
                <input 
                  value={query} 
                  onChange={(e) => { setQuery(e.target.value); setCurrentPage(1); }} 
                  placeholder="Search vendors..." 
                  className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" 
                />
              </div>
              <select 
                value={state ?? ""} 
                onChange={(e) => { setState(e.target.value || null); setCurrentPage(1); }} 
                className="w-[200px] shrink-0 rounded-2xl border border-border bg-card px-4 py-3.5 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
              >
                <option value="">All Malaysia</option>
                {STATES_MY.filter(s => s !== "All Malaysia").map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
              {CATEGORIES.map((categoryOption) => (
                <button 
                  key={categoryOption.id} 
                  type="button" 
                  onClick={() => { setCategory((value) => value === categoryOption.id ? null : categoryOption.id); setCurrentPage(1); }} 
                  className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm font-bold transition ${category === categoryOption.id ? "border-primary bg-primary text-white" : "border-border bg-card text-foreground hover:border-primary"}`}
                >
                  <CategoryIcon category={categoryOption.id} size={14} />
                  {categoryOption.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>


      {/* Featured Vendors */}
      {!query && !category && !state && recommendedVendors.length > 0 && (
        <section className="border-b border-[#d7ddd9] bg-white">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold mb-8">Featured Local Partners</h2>
            <div className="grid items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {recommendedVendors.slice(0, 4).map((vendor, index) => (
                <VendorDirectoryCard key={vendor.id} vendor={vendor} categories={[...(categoriesByVendor.get(vendor.id) ?? new Set<string>())]} index={index} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* All Vendors */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold mb-8">
          {query || category || state ? "Search Results" : "All Partners"}
        </h2>
        
        {visibleVendors.length ? (
          <div className="grid items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {visibleVendors.map((vendor, index) => (
              <VendorDirectoryCard key={vendor.id} vendor={vendor} categories={[...(categoriesByVendor.get(vendor.id) ?? new Set<string>())]} index={index} />
            ))}
          </div>
        ) : (
          <div className="rounded-[24px] border border-dashed border-[#cad5d1] bg-[#f8fafc] p-12 text-center">
            <p className="font-bold text-lg">No vendors found.</p>
            <p className="mt-2 text-sm text-[#6d7e83]">Try adjusting your search or filters.</p>
          </div>
        )}

        {filteredVendors.length > 0 && totalPages > 1 && (
          <nav className="mt-10 flex flex-col gap-4 border-t border-[#d7ddd9] pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#6d7e83]">
              Showing <span className="font-bold text-[#122b3a]">{pageStart + 1}–{Math.min(pageStart + RESULTS_PER_PAGE, filteredVendors.length)}</span> of <span className="font-bold text-[#122b3a]">{filteredVendors.length}</span> partners
            </p>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#cad5d1] text-[#010066] disabled:opacity-35"><ChevronLeft size={15} /></button>
              {pageItems.map((item, index) => item === "ellipsis" ? <span key={`ellipsis-${index}`} className="flex h-9 w-6 items-center justify-center text-xs text-[#6d7e83]">…</span> : <button key={item} type="button" onClick={() => setCurrentPage(item)} className={`h-9 min-w-9 rounded-full px-2 text-xs font-bold ${safePage === item ? "bg-[#010066] text-white" : "border border-[#cad5d1] hover:border-[#010066]"}`}>{item}</button>)}
              <button type="button" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="flex h-9 w-9 items-center justify-center rounded-full border border-[#cad5d1] text-[#010066] disabled:opacity-35"><ChevronRight size={15} /></button>
            </div>
          </nav>
        )}
      </section>
    </div>
  );
}
