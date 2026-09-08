"use client";

import { useTranslation } from "react-i18next";
import Link from "next/link";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Building2, ChevronLeft, ChevronRight, MapPin, ShieldCheck } from "lucide-react";
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
import { getVendorVisual } from "@/lib/customer/vendor-visual";
import { DiscoveryCategoryFilter, DiscoverySearchField } from "@/components/customer/discovery-filters";
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
          <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-card/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-foreground"><ShieldCheck size={12} className="text-primary" /> {t("ui.search.verifiedLocalPartner")}</span>
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
        <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Building2 size={13} /> {t("ui.search.outletCount", { count: vendor.outlets.length })}</span><span className="truncate">{categories.length ? categories.map((category) => { const key = getOptionalDiscoveryCategoryLabelKey(category); return key ? t(key) : category; }).join(" · ") : t("ui.search.localPartner")}</span></div>
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function SearchClient({ initialQuery, initialResults, initialVendors, recommendedVendors, sponsoredPlacements }: { initialQuery: string; initialResults: ComputedActivity[]; initialVendors: VendorSummary[]; recommendedVendors: VendorSummary[]; sponsoredPlacements: SponsoredPlacement[] }) {
  const { t } = useTranslation("customer");
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [partnerView, setPartnerView] = useState<PartnerView>("all");
  const [partnerSort, setPartnerSort] = useState<PartnerSort>("featured");
  const advertisementRankingTimestamp = useRef(new Date().toISOString()).current;

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
    query,
    state,
    category,
    now: advertisementRankingTimestamp,
  }), [advertisementRankingTimestamp, category, initialResults, query, sponsoredPlacements, state]);

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
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{t("ui.search.verifiedPartners")}</p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-foreground sm:text-4xl">
            {t("ui.search.title")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("ui.search.description")}
          </p>

          {/* Search Tools & Filters */}
          <div className="mt-8 space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row">
              <DiscoverySearchField 
                value={query} 
                onChange={(v) => { setQuery(v); setCurrentPage(1); }} 
                placeholder={t("ui.search.searchVendors")}
              />
              <select 
                value={state ?? ""} 
                onChange={(e) => { setState(e.target.value || null); setCurrentPage(1); }} 
                className="flex min-h-14 w-full shrink-0 items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 text-sm font-semibold text-foreground outline-none focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 sm:w-[200px]"
              >
                <option value="">{t("ui.search.allMalaysia")}</option>
                {STATES_MY.filter(s => s !== "All Malaysia").map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            
            <DiscoveryCategoryFilter
              category={category}
              hasActiveFilters={Boolean(query.trim() || category || state)}
              onCategoryChange={(c) => { setCategory(c); setCurrentPage(1); }}
              onClear={() => { setQuery(""); setCategory(null); setState(null); setCurrentPage(1); }}
            />
          </div>
        </div>
      </section>


      <SponsoredPartnerRail advertisements={advertisements} />

      {/* All Vendors */}
      <section className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold">
              {query || category || state || partnerView === "featured" ? t("ui.search.searchResults") : t("ui.search.allPartners")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("ui.search.directoryDescription")}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:w-[460px]">
            <label className="text-xs font-bold text-foreground">
              <span>{t("ui.search.partnerView")}</span>
              <select
                value={partnerView}
                onChange={(event) => { setPartnerView(event.target.value as PartnerView); setCurrentPage(1); }}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
              >
                <option value="all">{t("ui.search.allPartnersOption")}</option>
                <option value="featured">{t("ui.search.featuredOnly")}</option>
              </select>
            </label>
            <label className="text-xs font-bold text-foreground">
              <span>{t("ui.search.sortPartners")}</span>
              <select
                value={partnerSort}
                onChange={(event) => { setPartnerSort(event.target.value as PartnerSort); setCurrentPage(1); }}
                className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm font-semibold text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
              >
                <option value="featured">{t("ui.search.featuredFirst")}</option>
                <option value="name">{t("ui.search.nameAscending")}</option>
                <option value="outlets">{t("ui.search.mostOutlets")}</option>
              </select>
            </label>
          </div>
        </div>
        
        {visibleVendors.length ? (
          <div className="grid items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {visibleVendors.map((vendor, index) => (
              <VendorDirectoryCard key={vendor.id} vendor={vendor} categories={[...(categoriesByVendor.get(vendor.id) ?? new Set<string>())]} index={index} />
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
