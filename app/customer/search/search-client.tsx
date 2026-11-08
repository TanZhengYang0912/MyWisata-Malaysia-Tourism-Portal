"use client";

import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, MapPin, SlidersHorizontal } from "lucide-react";
import type { ComputedActivity, SponsoredPlacement, VendorSummary } from "@/backend/core/types";
import { Pagination } from "@/components/shared/pagination";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { PromotionSpotlight } from "@/components/customer/promotion-spotlight";
import { getActivityCommerceMode, getActivityDiscoveryMode } from "@/lib/customer/category-details";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { canonicalCategorySlug, getDiscoverySearchFilter, getOptionalDiscoveryCategoryLabelKey } from "@/lib/customer/discovery-categories";
import { getPlaceActivityImage } from "@/lib/customer/place-activity";
import { ReferencePrice } from "@/components/shared/reference-price";
import { CustomerDiscoveryFilterPanel, DiscoverySearchField } from "@/components/customer/discovery-filters";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { VendorCard } from "@/components/customer/vendor-card";
import {
  rankPartnerDirectory,
  selectPartnerAdvertisements,
  type PartnerSort,
  type PartnerView,
} from "@/lib/customer/partner-directory";
import { SponsoredPartnerRail } from "@/components/customer/sponsored-partner-rail";
import { EventPartnersSection, type EventPartner } from "@/components/customer/event-partners-section";
import type { FeaturedEventPromotion } from "@/lib/customer/event-promotions";
import type { DiscoveryQuery } from "@/lib/customer/discovery-query";
import { isOperatingHoursAtAvailable, isOperatingHoursWindowAvailable } from "@/lib/customer/operating-hours";
import { LocalizedContent } from "@/components/customer/localized-content";
import { buildActivityPath } from "@/lib/customer/navigation-context";
import { getOutletShopHref } from "@/lib/customer/shop-navigation";

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

const RESULTS_PER_PAGE = 4;
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
    <article className="overflow-hidden rounded-[24px] border border-border bg-card shadow-sm">
      <Link href={buildActivityPath(activity.id, undefined, activity.outlet.id)} className="group/activity-media block focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#010066]/20">
        <div className="relative aspect-[1.55] overflow-hidden bg-[#eef2ff]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={activity.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover/activity-media:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#071923]/80 via-[#071923]/5 to-transparent" />
          <span className="absolute left-3 top-3 rounded-full bg-card/95 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">{t("ui.labels.placeBasedExperience")}</span>
          <span className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white"><MapPin size={12} /> {location}</span>
        </div>
      </Link>
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <LocalizedContent entityType="product" entityId={activity.id} field="name" sourceText={activity.name}>
              {({ text, control }) => <><Link href={buildActivityPath(activity.id, undefined, activity.outlet.id)} className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#010066]/40"><h3 className="break-words whitespace-normal text-sm font-bold leading-5 text-[#122b3a]">{text}</h3></Link>{control}</>}
            </LocalizedContent>
            <p className="mt-1 text-xs capitalize text-[#6d7e83]">{typeLabel} · {vendorBacked && activity.requiresBooking ? t("ui.search.guidedBookable") : vendorBacked ? t("ui.search.vendorExperience") : t("ui.labels.publicPlace")}</p>
          </div>
          <span className="shrink-0 text-right font-[family-name:var(--font-mono)] text-sm font-bold text-[#010066]">{vendorBacked ? <ReferencePrice amountMYR={Number(activity.price)} /> : t("ui.labels.freeToExplore")}</span>
        </div>
        <p className="break-words whitespace-normal text-xs leading-5 text-[#6d7e83]"><LocalizedContent entityType="product" entityId={activity.id} field="description" sourceText={activity.description} /></p>
        <div className="flex flex-wrap items-start justify-between gap-3 text-[11px] text-[#6d7e83]">
          <span className="min-w-0 flex-1 break-words whitespace-normal">{vendorBacked ? t("ui.search.providedBy", { vendor: provider }) : t("ui.search.noVendorRequired")}</span>
          <Link href={buildActivityPath(activity.id, undefined, activity.outlet.id)} className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-[#122b3a] transition hover:text-[#010066]">{t("ui.actions.viewDetails")} <ArrowRight size={13} /></Link>
        </div>
      </div>
      <span className="sr-only">{t("ui.search.placeCard", { index: index + 1 })}</span>
    </article>
  );
}

export function SearchClient({ initialQuery, initialResults, initialVendors, recommendedVendors, sponsoredPlacements, eventPromotions = [], eventPartners = [] }: { initialQuery: string; initialResults: ComputedActivity[]; initialVendors: VendorSummary[]; recommendedVendors: VendorSummary[]; sponsoredPlacements: SponsoredPlacement[]; eventPromotions?: FeaturedEventPromotion[]; eventPartners?: EventPartner[] }) {
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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [advertisementRankingTimestamp] = useState(() => new Date().toISOString());

  const categoriesByVendor = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const activity of initialResults.filter((item) => getActivityDiscoveryMode(item) === "vendor")) {
      const vendorId = activity.outlet.vendorId;
      const labels = map.get(vendorId) ?? new Set<string>();
      const canonicalSlug = canonicalCategorySlug(activity.categorySlug);
      labels.add(canonicalSlug ?? activity.categorySlug ?? activity.category);
      if (activity.outlet.badgeSlugs?.includes("hidden_gem")) labels.add("hidden_gem");
      map.set(vendorId, labels);
    }
    return map;
  }, [initialResults]);

  const matchingVendors = useMemo(() => initialVendors.filter((vendor) => {
    const normalizedQuery = filters.q.trim().toLowerCase();
    const matchesQuery = !normalizedQuery || `${vendor.name} ${vendor.outlets.map((outlet) => `${outlet.city} ${outlet.state}`).join(" ")}`.toLowerCase().includes(normalizedQuery);
    const hasTimeFilter = filters.openNow ||
      (filters.hoursMode === "at" && Boolean(filters.timeAt)) ||
      (filters.hoursMode !== "at" && Boolean(filters.timeFrom && filters.timeTo));
    const hasStateFilter = Boolean(filters.state && filters.state !== "All Malaysia");
    const matchesOutlets = (!hasStateFilter && !hasTimeFilter) || vendor.outlets.some((outlet) => {
      const matchesState = !hasStateFilter || outlet.state === filters.state;
      const hours = outlet.operatingHours ?? null;
      const matchesOpenNow = !filters.openNow || outlet.currentlyOpen === true;
      const matchesTime = filters.hoursMode === "at" && filters.timeAt
        ? Boolean(hours && isOperatingHoursAtAvailable(filters.timeAt, hours, filters.operatingDays))
        : filters.hoursMode !== "at" && filters.timeFrom && filters.timeTo
          ? Boolean(hours && isOperatingHoursWindowAvailable(filters.timeFrom, filters.timeTo, hours, filters.operatingDays, { overnight: filters.overnight }))
          : true;
      return matchesState && matchesOpenNow && matchesTime;
    });
    const labels = categoriesByVendor.get(vendor.id) ?? new Set<string>();
    const category = filters.categories.length === 1 ? filters.categories[0] : filters.hiddenGemOnly ? "hidden_gem" : null;
    const matchesCategory = !category || (category === "hidden_gem"
      ? vendor.outlets.some((outlet) => outlet.badgeSlugs?.includes("hidden_gem"))
      : labels.has(category));
    const vendorActivities = initialResults.filter((activity) => activity.outlet.vendorId === vendor.id);
    const selectedBadgeSlugs = [
      filters.hiddenGemOnly && "hidden_gem",
      filters.familyFriendlyOnly && "family_friendly",
      filters.coupleFriendlyOnly && "couple_friendly",
    ].filter(Boolean) as string[];
    const matchesOutletBadges = selectedBadgeSlugs.length === 0 || vendor.outlets.some((outlet) =>
      selectedBadgeSlugs.some((slug) => outlet.badgeSlugs?.includes(slug)),
    );
    const hasActivityFilters = filters.categories.length > 0 || filters.types.length > 0 || filters.priceMax !== null ||
      filters.freeOnly || filters.bookableOnly;
    const matchesActivities = !hasActivityFilters || vendorActivities.some((activity) => {
      const activityCategory = canonicalCategorySlug(activity.categorySlug) ?? activity.categorySlug ?? activity.category;
      const matchesTypes = filters.types.length === 0 || filters.types.some((token) => {
        const [selectedCategory, selectedType] = token.split(":", 2);
        return selectedCategory === activityCategory && Boolean(selectedType && activity.typeSlugs?.includes(selectedType));
      });
      const matchesCategoryBranch = filters.categories.length === 0 || filters.categories.includes(activityCategory) ||
        (filters.categories.includes("hidden_gem") && activity.outlet.badgeSlugs?.includes("hidden_gem"));
      const matchesPrice = filters.priceMax === null || activity.price <= filters.priceMax;
      const matchesCommerce = (!filters.freeOnly || activity.price === 0) && (!filters.bookableOnly || activity.requiresBooking);
      return matchesCategoryBranch && matchesTypes && matchesPrice && matchesCommerce;
    });
    return matchesQuery && matchesOutlets && matchesCategory && matchesActivities && matchesOutletBadges;
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

  const category = filters.categories.length === 1 ? filters.categories[0] : filters.hiddenGemOnly ? "hidden_gem" : null;

  const totalPages = Math.max(1, Math.ceil(filteredVendors.length / RESULTS_PER_PAGE));
  const safePage = Math.min(currentPage, totalPages);
  const pageStart = (safePage - 1) * RESULTS_PER_PAGE;
  const visibleVendors = filteredVendors.slice(pageStart, pageStart + RESULTS_PER_PAGE);
  const hasActiveFilters = Boolean(
    filters.q.trim() || filters.state || filters.categories.length || filters.types.length || filters.priceMax !== null ||
    filters.operatingDays.length || filters.hoursMode !== "during" || filters.timeAt || filters.timeFrom || filters.timeTo ||
    filters.overnight || filters.openNow || filters.freeOnly || filters.bookableOnly || filters.familyFriendlyOnly || filters.coupleFriendlyOnly,
  );
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
    <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
      <div className="min-h-screen overflow-x-clip bg-background text-foreground">
        <section className="border-b border-border bg-background">
          <div className="mx-auto max-w-7xl px-4 pb-8 pt-8 sm:px-6 sm:pb-8 sm:pt-10">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{t("ui.search.verifiedPartners")}</p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-foreground sm:text-4xl">
              {t("ui.search.title")}
            </h1>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          <div data-testid="partner-filter-bar" className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <DiscoverySearchField value={filters.q} onChange={(q) => updateFilters({ q })} placeholder={t("ui.search.searchVendors")} />
            <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm" data-testid="partner-filters-trigger" className="min-h-10 rounded-xl px-4 text-sm">
                  <SlidersHorizontal aria-hidden="true" />
                  {t("ui.explore.filters")}
                </Button>
              </DialogTrigger>
              <label data-testid="partner-sort-control" className="flex min-w-0 items-center gap-2 text-xs font-semibold text-muted-foreground">
                <span className="shrink-0">{t("ui.explore.sortBy")}</span>
                <select
                  aria-label={t("ui.explore.sortBy")}
                  value={partnerSort}
                  onChange={(event) => { setPartnerSort(event.target.value as PartnerSort); setCurrentPage(1); }}
                  className="min-h-10 min-w-0 rounded-xl border border-border bg-card px-3 text-sm text-foreground"
                >
                  <option value="featured">{t("ui.search.featuredFirst")}</option>
                  <option value="name">{t("ui.search.nameAscending")}</option>
                  <option value="outlets">{t("ui.search.mostOutlets")}</option>
                </select>
              </label>
            </div>
          </div>
          {hasActiveFilters && (
            <div data-testid="active-filter-summary" className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">{t("ui.search.activeFilters")}</span>
              {categoryLabel && <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary">{t("ui.search.category")}: {categoryLabel}</span>}
            </div>
          )}
        </section>

        <DialogContent
          id="partner-filter-dialog"
          aria-labelledby="partner-filter-title"
          aria-describedby="partner-filter-description"
          className="fixed inset-y-0 right-0 left-auto top-0 z-50 flex h-dvh max-h-dvh w-full max-w-[430px] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-y-0 border-r-0 p-0 shadow-xl duration-200 data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right sm:max-w-[430px]"
        >
          <DialogHeader className="shrink-0 border-b border-border px-5 py-5 pr-14">
            <DialogTitle id="partner-filter-title">{t("ui.explore.filterDrawerTitle")}</DialogTitle>
            <DialogDescription id="partner-filter-description" className="text-sm text-muted-foreground">
              {t("ui.explore.filterDrawerDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
            <label data-testid="partner-view-control" className="block text-sm font-semibold text-foreground">
              <span>{t("ui.search.partnerView")}</span>
              <select
                value={partnerView}
                onChange={(event) => { setPartnerView(event.target.value as PartnerView); setCurrentPage(1); }}
                className="mt-2 min-h-10 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm font-normal text-foreground"
              >
                <option value="all">{t("ui.search.allPartnersOption")}</option>
                <option value="featured">{t("ui.search.featuredOnly")}</option>
              </select>
            </label>
            <CustomerDiscoveryFilterPanel
              layout="sidebar"
              showSearchField={false}
              value={filters}
              hasActiveFilters={hasActiveFilters}
              onChange={updateFilters}
              onClear={clearFilters}
              category={category}
              onCategoryChange={(nextCategory) => updateFilters({ categories: nextCategory ? [nextCategory] : [], types: [], hiddenGemOnly: false })}
              categoryVariant="cards"
              includeAllCategories={false}
              filterButtonAlignment="end"
            />
          </div>
        </DialogContent>

        <SponsoredPartnerRail advertisements={advertisements} eventPromotions={eventPromotions} />

        <EventPartnersSection partners={eventPartners.filter((partner) => !filters.q.trim() || partner.name.toLowerCase().includes(filters.q.trim().toLowerCase()))} />

        <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6">
          <h2 className="sr-only">{partnerView === "featured" ? t("ui.search.searchResults") : t("ui.search.allPartners")}</h2>
          {visibleVendors.length ? (
            <div className="grid grid-cols-2 items-stretch gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {visibleVendors.map((vendor, index) => (
                <VendorCard
                  key={vendor.id}
                  vendor={vendor}
                  destinationHref={(() => {
                    const badgeSlugs = [
                      filters.hiddenGemOnly && "hidden_gem",
                      filters.familyFriendlyOnly && "family_friendly",
                      filters.coupleFriendlyOnly && "couple_friendly",
                      filters.categories.includes("hidden_gem") && "hidden_gem",
                    ].filter(Boolean) as string[];
                    const matchingOutlet = badgeSlugs.length > 0
                      ? vendor.outlets.find((outlet) => badgeSlugs.some((slug) => outlet.badgeSlugs?.includes(slug)))
                      : undefined;
                    return matchingOutlet ? getOutletShopHref(matchingOutlet.id) : undefined;
                  })()}
                  categories={[...(categoriesByVendor.get(vendor.id) ?? new Set<string>())]}
                  index={index}
                  isFeatured={featuredVendorIds.has(vendor.id)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-border bg-secondary/30 p-8 text-center sm:p-10">
              <p className="text-lg font-bold">{t("ui.search.noVendors")}</p>
              <p className="mt-2 text-sm text-muted-foreground">{hasActiveFilters ? t("ui.discovery.adjustFilters") : t("ui.search.tryFilters")}</p>
              {hasActiveFilters && <button type="button" onClick={clearFilters} className="mt-4 rounded-full border border-primary px-4 py-2 text-xs font-bold text-primary hover:bg-background">{t("ui.actions.clearFilters")}</button>}
            </div>
          )}

          {filteredVendors.length > 0 && (
            <Pagination
              ariaLabel={t("ui.search.vendorPages")}
              currentPage={safePage}
              onPageChange={setCurrentPage}
              pageSize={RESULTS_PER_PAGE}
              totalItems={filteredVendors.length}
              totalPages={totalPages}
              className="mt-10"
            />
          )}
        </section>
      </div>
    </Dialog>
  );
}
