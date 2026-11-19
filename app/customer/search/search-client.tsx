"use client";

import { useTranslation } from "react-i18next";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowRight, MapPin } from "lucide-react";
import type { ComputedActivity, DiscoveryResult, VendorSummary } from "@/backend/core/types";
import { Pagination } from "@/components/shared/pagination";
import { CustomerPageTitle } from "@/components/customer/customer-page-shell";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { PromotionSpotlight } from "@/components/customer/promotion-spotlight";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { getActivityCommerceMode, getActivityDiscoveryMode } from "@/lib/customer/category-details";
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { canonicalCategorySlug, getDiscoverySearchFilter, getOptionalDiscoveryCategoryLabelKey } from "@/lib/customer/discovery-categories";
import { getPlaceActivityImage } from "@/lib/customer/place-activity";
import { ReferencePrice } from "@/components/shared/reference-price";
import { CustomerDiscoveryFilterPanel, DiscoveryToolbar } from "@/components/customer/discovery-filters";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { VendorCard } from "@/components/customer/vendor-card";
import {
  matchesPartnerFilters,
  rankPartnerDirectory,
  type PartnerFilterFacts,
  type PartnerSort,
  type PartnerView,
} from "@/lib/customer/partner-directory";
import { SponsoredPartnerRail } from "@/components/customer/sponsored-partner-rail";
import { EventPartnersSection, type EventPartner } from "@/components/customer/event-partners-section";
import type { FeaturedEventPromotion } from "@/lib/customer/event-promotions";
import type { DiscoveryQuery } from "@/lib/customer/discovery-query";
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
          <span className="shrink-0 text-right tabular-nums text-sm font-bold text-[#010066]">{vendorBacked ? <ReferencePrice amountMYR={Number(activity.price)} /> : t("ui.labels.freeToExplore")}</span>
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

/** A directory vendor with the server-built facts its filters and card need. */
type PartnerDirectoryVendor = VendorSummary & PartnerFilterFacts & {
  rating?: { value: number; count: number } | null;
  openNow?: boolean;
};

export function SearchClient({ initialQuery, initialVendors, recommendedVendors, advertisements, eventPromotions = [], eventPartners = [] }: { initialQuery: string; initialVendors: PartnerDirectoryVendor[]; recommendedVendors: VendorSummary[]; advertisements: DiscoveryResult[]; eventPromotions?: FeaturedEventPromotion[]; eventPartners?: EventPartner[] }) {
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

  const matchingVendors = useMemo(
    () => initialVendors.filter((vendor) => matchesPartnerFilters(vendor, filters)),
    [filters, initialVendors],
  );

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
        <CustomerPageTitle eyebrow={t("ui.search.verifiedPartners")} title={t("ui.search.title")} />

        <section className="mx-auto max-w-7xl px-4 pb-6 sm:px-6 sm:pb-8">
          <DiscoveryToolbar
            testIds={{ bar: "partner-filter-bar", filters: "partner-filters-trigger", sort: "partner-sort-control" }}
            query={filters.q}
            onQueryChange={(q) => updateFilters({ q })}
            placeholder={t("ui.search.searchVendors")}
            filtersActive={hasActiveFilters || partnerView !== "all"}
            sort={partnerSort}
            defaultSort="featured"
            onSortChange={(value) => { setPartnerSort(value); setCurrentPage(1); }}
            sortOptions={[
              { value: "featured", label: t("ui.search.featuredFirst") },
              { value: "name", label: t("ui.search.nameAscending") },
              { value: "outlets", label: t("ui.search.mostOutlets") },
            ]}
          />
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

        {/* Directly under the sponsored rail's bottom line (no event partners between), leave the same 40px gap as above the footer line. */}
        <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 [.border-b+&]:pt-10">
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
                  categories={vendor.categories}
                  index={index}
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
