"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import Image from "next/image";
import { Compass, Map, SlidersHorizontal } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as catalogueDomain from "@/backend/domains/catalogue";
import { ActivityCard } from "@/components/customer/activity-card";
import { toDiscoveryCatalogueCard } from "@/lib/customer/product-catalogue";
import { CustomerDiscoveryFilterPanel, DiscoverySearchField } from "@/components/customer/discovery-filters";
import { DirectoryPagination } from "@/components/customer/directory-pagination";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { MALAYSIA_DESTINATIONS } from "@/lib/customer/malaysia-destinations";
import { StoryMap } from "@/components/demo-map/story-map";
import type { ComputedActivity } from "@/backend/core/types";
import { parseDiscoveryQuery, serializeDiscoveryQuery, type DiscoveryQuery } from "@/lib/customer/discovery-query";
import { createClient } from "@/lib/supabase/client";
import { groupAccommodationByProperty, rankDiscoveryResults } from "@/lib/customer/discovery-ranking";
import type { DiscoveryResult, SponsoredPlacement } from "@/backend/core/types";
import { CATEGORY_DETAILS } from "@/lib/customer/category-details";
import { canonicalCategorySlug, type RealCategorySlug } from "@/lib/customer/discovery-categories";

type ExploreTab = "destinations" | "experiences";
type ExperienceSort = "recommended" | "price_asc" | "rating_desc";
const EXPERIENCE_PAGE_SIZE = 8;

const ZONE_ORDER = [
  "Federal Territory",
  "Northern Malaysia",
  "Central Malaysia",
  "Southern Malaysia",
  "Borneo Malaysia",
  "East Coast Malaysia",
];

function buildExploreHref(filters: DiscoveryQuery, tab: ExploreTab, sort: ExperienceSort = "recommended", page = 1) {
  const params = serializeDiscoveryQuery(filters);
  if (tab === "experiences") {
    params.set("tab", "experiences");
    if (sort !== "recommended") params.set("sort", sort);
    else params.delete("sort");
    if (page > 1) params.set("page", String(page));
    else params.delete("page");
  } else {
    params.delete("tab");
    params.delete("sort");
    params.delete("page");
  }
  const query = params.toString();
  return query ? `/customer/explore?${query}` : "/customer/explore";
}

function readExperienceSort(value: string | null): ExperienceSort {
  return value === "price_asc" || value === "rating_desc" ? value : "recommended";
}

function normalizeExperienceFilters(filters: DiscoveryQuery): DiscoveryQuery {
  const types = [...new Set(filters.types.flatMap((token) => {
    const separator = token.indexOf(":");
    if (separator < 1) return [];
    const category = canonicalCategorySlug(token.slice(0, separator));
    const type = token.slice(separator + 1);
    return category && CATEGORY_DETAILS[category].types.some((option) => option.slug === type)
      ? [`${category}:${type}`]
      : [];
  }))];
  const typeCategories = types.map((token) => token.slice(0, token.indexOf(":")));
  const categories = [...new Set([
    ...filters.categories.map(canonicalCategorySlug).filter((category): category is RealCategorySlug => category !== null),
    ...typeCategories,
  ])];
  return {
    ...filters,
    categories,
    types,
    priceMax: null,
    operatingDays: [],
    hoursMode: "during",
    timeAt: null,
    timeFrom: null,
    timeTo: null,
    overnight: false,
    freeOnly: false,
    bookableOnly: false,
  };
}

export function ExploreClient({
  initialActivities,
  statesWithPlaces = [],
  placeCountByState = {},
  dataUnavailable = false,
}: {
  initialActivities: ComputedActivity[];
  statesWithPlaces?: string[];
  placeCountByState?: Record<string, number>;
  dataUnavailable?: boolean;
}) {
  const { t } = useTranslation("customer");
  const router = useRouter();
  const searchParams = useSearchParams();
  const db = useMemo(() => (
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      ? createClient()
      : null
  ), []);
  const impressedPlacementIds = useRef(new Set<string>());
  const [tab, setTab] = useState<ExploreTab>(() => searchParams.get("tab") === "experiences" ? "experiences" : "destinations");
  const [filters, setFilters] = useState<DiscoveryQuery>(() => {
    const parsed = parseDiscoveryQuery(new URLSearchParams(searchParams.toString()));
    return searchParams.get("tab") === "experiences" ? normalizeExperienceFilters(parsed) : parsed;
  });
  const [sort, setSort] = useState<ExperienceSort>(() => readExperienceSort(searchParams.get("sort")));
  const activeSort = tab === "experiences" ? sort : "recommended";
  const [debouncedQuery, setDebouncedQuery] = useState(filters.q);
  // The cached candidates arrive in popularity order; the default view is ⭐ first, then name.
  const orderedInitialActivities = useMemo(() => catalogueDomain.sortExploreActivities({}, initialActivities), [initialActivities]);
  const [activities, setActivities] = useState<DiscoveryResult[]>(() => orderedInitialActivities.map((activity) => ({ ...activity, sponsorship: null })));
  const [experienceFiltersOpen, setExperienceFiltersOpen] = useState(false);
  const initialCandidatesExpireAt = useRef<number | null>(null);
  const displayActivities = useMemo(() => groupAccommodationByProperty(activities), [activities]);
  const rawPageParam = searchParams.get("page");
  const parsedPage = rawPageParam === null ? 1 : Number(rawPageParam);
  const requestedPage = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const totalExperiencePages = Math.max(1, Math.ceil(displayActivities.length / EXPERIENCE_PAGE_SIZE));
  const currentExperiencePage = Math.min(requestedPage, totalExperiencePages);
  const visibleActivities = displayActivities.slice(
    (currentExperiencePage - 1) * EXPERIENCE_PAGE_SIZE,
    currentExperiencePage * EXPERIENCE_PAGE_SIZE,
  );

  useEffect(() => {
    if (tab !== "experiences") return;
    const canonicalHref = buildExploreHref(filters, "experiences", activeSort, currentExperiencePage);
    const canonicalQuery = canonicalHref.split("?")[1] ?? "";
    if (searchParams.toString() === canonicalQuery) return;
    router.replace(canonicalHref);
  }, [activeSort, currentExperiencePage, filters, router, searchParams, tab]);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const previousOverflowX = html.style.overflowX;
    const previousBodyOverflowX = body.style.overflowX;
    html.style.overflowX = "clip";
    body.style.overflowX = "clip";
    return () => {
      html.style.overflowX = previousOverflowX;
      body.style.overflowX = previousBodyOverflowX;
    };
  }, []);

  useEffect(() => {
    const timeout = globalThis.setTimeout(() => setDebouncedQuery(filters.q), 250);
    return () => globalThis.clearTimeout(timeout);
  }, [filters.q]);

  const searchQuery = useMemo(() => ({
    q: debouncedQuery.trim(),
    state: filters.state,
    categories: filters.categories,
    types: filters.types,
    priceMax: filters.priceMax,
    operatingDays: filters.operatingDays,
    hoursMode: filters.hoursMode,
    timeAt: filters.timeAt,
    timeFrom: filters.timeFrom,
    timeTo: filters.timeTo,
    overnight: filters.overnight,
    openNow: filters.openNow,
    freeOnly: filters.freeOnly,
    bookableOnly: filters.bookableOnly,
    hiddenGemOnly: filters.hiddenGemOnly,
    familyFriendlyOnly: filters.familyFriendlyOnly,
    coupleFriendlyOnly: filters.coupleFriendlyOnly,
    ...(activeSort === "recommended" ? {} : { sort: activeSort }),
  }), [
    debouncedQuery,
    filters.state,
    filters.categories,
    filters.types,
    filters.priceMax,
    filters.operatingDays,
    filters.hoursMode,
    filters.timeAt,
    filters.timeFrom,
    filters.timeTo,
    filters.overnight,
    filters.openNow,
    filters.freeOnly,
    filters.bookableOnly,
    filters.hiddenGemOnly,
    filters.familyFriendlyOnly,
    filters.coupleFriendlyOnly,
    activeSort,
  ]);
  const hasSearchCriteria = Boolean(
    searchQuery.q ||
    (searchQuery.state && searchQuery.state !== "All Malaysia") ||
    searchQuery.categories.length ||
    searchQuery.types.length ||
    searchQuery.priceMax !== null ||
    searchQuery.operatingDays.length ||
    searchQuery.hoursMode !== "during" ||
    searchQuery.timeAt ||
    searchQuery.timeFrom ||
    searchQuery.timeTo ||
    searchQuery.overnight ||
    searchQuery.openNow ||
    searchQuery.freeOnly ||
    searchQuery.bookableOnly ||
    searchQuery.hiddenGemOnly ||
    searchQuery.familyFriendlyOnly ||
    searchQuery.coupleFriendlyOnly ||
    activeSort !== "recommended",
  );
  const hasOutletCandidateFilter = Boolean(
    searchQuery.q || searchQuery.state || searchQuery.openNow ||
    searchQuery.hiddenGemOnly || searchQuery.familyFriendlyOnly || searchQuery.coupleFriendlyOnly ||
    searchQuery.types.some((type) => type.startsWith("accommodation:")),
  );

  useEffect(() => {
    if (initialCandidatesExpireAt.current === null) {
      initialCandidatesExpireAt.current = Date.now() + 60_000;
    }
    let cancelled = false;
    const requestedAt = new Date().toISOString();
    const placementsRequest = db
      ? db
        .rpc("list_active_sponsored_discovery_placements")
      : Promise.resolve({ data: [], error: null });
    const activitiesRequest = hasSearchCriteria
      ? !hasOutletCandidateFilter && Date.now() < initialCandidatesExpireAt.current && typeof catalogueDomain.filterExploreActivities === "function"
        ? Promise.resolve().then(() => catalogueDomain.filterExploreActivities(searchQuery, initialActivities))
        : catalogueDomain.searchExploreActivities(searchQuery)
      : Promise.resolve(orderedInitialActivities);
    Promise.all([
      activitiesRequest,
      placementsRequest,
    ]).then(([nextActivities, placementsResult]) => {
      if (cancelled) return;
      const placements = placementsResult.error ? [] : ((placementsResult.data ?? []) as Array<{
        id: string;
        product_id: string;
        state: string | null;
        category_slug: string | null;
        starts_at: string;
        ends_at: string;
        priority: number;
        status: SponsoredPlacement["status"];
      }>).map((placement): SponsoredPlacement => ({
        id: placement.id,
        productId: placement.product_id,
        state: placement.state,
        categorySlug: placement.category_slug,
        startsAt: placement.starts_at,
        endsAt: placement.ends_at,
        priority: placement.priority,
        status: placement.status,
      }));
      setActivities(rankDiscoveryResults({
        activities: nextActivities,
        placements,
        filters: searchQuery,
        now: requestedAt,
      }));
    }).catch(() => {
      if (!cancelled) setActivities([]);
    });
    return () => { cancelled = true; };
  }, [db, hasOutletCandidateFilter, hasSearchCriteria, initialActivities, orderedInitialActivities, searchQuery]);

  const recordSponsoredEvent = useCallback((activity: DiscoveryResult, eventType: "impression" | "click") => {
    if (!activity.sponsorship) return;
    void fetch(`/api/sponsored-placements/${activity.sponsorship.placementId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, productId: activity.id }),
      keepalive: true,
    });
  }, []);

  useEffect(() => {
    for (const activity of activities) {
      const placementId = activity.sponsorship?.placementId;
      if (!placementId || impressedPlacementIds.current.has(placementId)) continue;
      impressedPlacementIds.current.add(placementId);
      recordSponsoredEvent(activity, "impression");
    }
  }, [activities, recordSponsoredEvent]);

  const hasActiveFilters = Boolean(
    filters.q.trim() || filters.state || filters.categories.length || filters.types.length || filters.priceMax !== null || filters.operatingDays.length || filters.hoursMode !== "during" || filters.timeAt || filters.timeFrom || filters.timeTo || filters.overnight || filters.openNow ||
    filters.freeOnly || filters.bookableOnly || filters.hiddenGemOnly || filters.familyFriendlyOnly || filters.coupleFriendlyOnly,
  );

  const updateFilters = (patch: Partial<DiscoveryQuery>) => {
    const merged = { ...filters, ...patch };
    const next = tab === "experiences" ? normalizeExperienceFilters(merged) : merged;
    setFilters(next);
    router.replace(buildExploreHref(next, tab, activeSort));
  };

  const changeTab = (nextTab: ExploreTab) => {
    const nextFilters = nextTab === "experiences" ? normalizeExperienceFilters(filters) : filters;
    setTab(nextTab);
    setFilters(nextFilters);
    router.replace(buildExploreHref(nextFilters, nextTab, nextTab === "experiences" ? sort : "recommended"));
  };

  const changeExperienceSort = (nextSort: ExperienceSort) => {
    setSort(nextSort);
    router.replace(buildExploreHref(filters, "experiences", nextSort));
  };

  const changeExperiencePage = (page: number) => {
    const nextPage = Math.min(Math.max(page, 1), totalExperiencePages);
    router.replace(buildExploreHref(filters, "experiences", activeSort, nextPage));
  };

  const clearFilters = () => {
    const next: DiscoveryQuery = { q: "", state: null, categories: [], types: [], priceMax: null, operatingDays: [], hoursMode: "during", timeAt: null, timeFrom: null, timeTo: null, overnight: false, openNow: false, freeOnly: false, bookableOnly: false, hiddenGemOnly: false, familyFriendlyOnly: false, coupleFriendlyOnly: false };
    setFilters(next);
    setSort("recommended");
    router.replace(buildExploreHref(next, tab, "recommended"));
  };

  return (
    <div className="min-h-screen overflow-x-clip bg-background">
      {dataUnavailable && (
        <p role="status" className="mx-auto max-w-7xl px-4 py-3 text-sm text-muted-foreground sm:px-6">
          {t("ui.states.loadingError")}
        </p>
      )}
      {/* Header */}
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{t("ui.explore.eyebrow")}</p>
              <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-foreground sm:text-4xl">
                {tab === "experiences" ? t("ui.explore.experiencePageTitle") : t("ui.explore.title")}
              </h1>
            </div>

            {/* Tab switch */}
            <div className="inline-flex shrink-0 self-end rounded-full border border-border bg-card p-1 md:self-auto">
              <button
                type="button"
                aria-pressed={tab === "destinations"}
                onClick={() => changeTab("destinations")}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                  tab === "destinations"
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Map size={15} aria-hidden="true" />
                {t("ui.explore.destinations")}
              </button>
              <button
                type="button"
                aria-pressed={tab === "experiences"}
                onClick={() => changeTab("experiences")}
                className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${
                  tab === "experiences"
                    ? "bg-primary text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Compass size={15} aria-hidden="true" />
                {t("ui.explore.experiences")}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Destinations tab */}
      {tab === "destinations" && (
        <div>
          {/* Malaysia map + state cards via existing StoryMap */}
          <StoryMap activities={displayActivities} filters={filters} onFilterChange={updateFilters} onSponsoredClick={(activity) => recordSponsoredEvent(activity, "click")} />

          {/* Destination cards grid */}
          <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{t("ui.explore.statesAndCities")}</p>
                <h2 className="mt-1 text-2xl font-bold text-foreground">{t("ui.explore.exploreByDestination")}</h2>
              </div>
            </div>
            <div className="space-y-12">
              {ZONE_ORDER.map((zone) => {
                const zoneDestinations = MALAYSIA_DESTINATIONS.filter((d) => d.zone === zone);
                if (zoneDestinations.length === 0) return null;

                return (
                  <div key={zone}>
                    <h3 className="mb-4 text-xl font-bold text-foreground">{zone}</h3>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:gap-6">
                      {zoneDestinations.map((dest) => {
                        const stateSlug = dest.state.toLowerCase().replace(/\s+/g, "-");
                        const hasPlaces = statesWithPlaces.includes(dest.state);
                        const placeCount = placeCountByState[dest.state] ?? 0;
                        return (
                          <Link
                            key={dest.state}
                            href={hasPlaces ? `/customer/place/${stateSlug}` : `/customer/destination/${encodeURIComponent(stateSlug)}`}
                            className="group relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                          >
                            <div className="relative aspect-[0.9] overflow-hidden">
                              <Image
                                src={dest.image}
                                alt={dest.state}
                                fill
                                sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
                                className="object-cover object-top transition duration-500 group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                              <div className="absolute inset-x-3 bottom-3">
                                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary-foreground/70 dark:text-white/70">
                                  {dest.zone}
                                </p>
                                <p className="mt-0.5 text-sm font-bold text-white">{dest.state}</p>
                                {hasPlaces && placeCount > 0 && (
                                  <p className="mt-0.5 text-[10px] font-semibold text-white/80">
                                    {t("ui.place.placesToVisit", { count: placeCount })}
                                  </p>
                                )}
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* Experiences tab */}
      {tab === "experiences" && (
        <Dialog open={experienceFiltersOpen} onOpenChange={setExperienceFiltersOpen}>
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
            <section className="min-w-0">
              <div data-testid="experience-toolbar" className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <DiscoverySearchField value={filters.q} onChange={(q) => updateFilters({ q })} placeholder={t("ui.map.searchExperience")} />
                <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                  <DialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      data-testid="experience-filter-trigger"
                    >
                      <SlidersHorizontal aria-hidden="true" />
                      {t("ui.explore.filters")}
                    </Button>
                  </DialogTrigger>
                  <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                    <span>{t("ui.explore.sortBy")}</span>
                    <select
                      aria-label={t("ui.explore.sortBy")}
                      value={sort}
                      onChange={(event) => changeExperienceSort(readExperienceSort(event.target.value))}
                      className="min-h-10 rounded-xl border border-border bg-card px-3 text-sm text-foreground"
                    >
                      <option value="recommended">{t("ui.explore.sortRecommended")}</option>
                      <option value="price_asc">{t("ui.explore.sortPriceAsc")}</option>
                      <option value="rating_desc">{t("ui.explore.sortRatingDesc")}</option>
                    </select>
                  </label>
                </div>
              </div>
              {displayActivities.length === 0 ? (
                dataUnavailable ? null : (
                  <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                    <p className="font-semibold text-foreground">{t("ui.explore.noExperiences")}</p>
                    {hasActiveFilters && <p className="mt-2">{t("ui.explore.emptyExperienceFilters")}</p>}
                    {hasActiveFilters && <button type="button" onClick={clearFilters} className="mt-4 rounded-full border border-primary px-4 py-2 text-xs font-bold text-primary hover:bg-secondary">{t("ui.actions.clearFilters")}</button>}
                  </div>
                )
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
                  {visibleActivities.map((a) => (
                    a.property
                      ? <ActivityCard key={a.id} activity={a} returnTo={buildExploreHref(filters, tab, activeSort, currentExperiencePage)} hideDiscoveryBadges onSponsoredClick={a.sponsorship ? () => recordSponsoredEvent(a, "click") : undefined} />
                      : <ActivityCard key={a.id} listing={toDiscoveryCatalogueCard(a)} returnTo={buildExploreHref(filters, tab, activeSort, currentExperiencePage)} onSponsoredClick={a.sponsorship ? () => recordSponsoredEvent(a, "click") : undefined} />
                  ))}
                </div>
              )}
              {displayActivities.length > 0 && (
                <DirectoryPagination
                  ariaLabel={t("ui.pagination.experiencePages")}
                  currentPage={currentExperiencePage}
                  itemLabel={t("ui.pagination.experienceItems")}
                  onPageChange={changeExperiencePage}
                  pageSize={EXPERIENCE_PAGE_SIZE}
                  totalItems={displayActivities.length}
                  totalPages={totalExperiencePages}
                  variant="marketplace"
                  showSummary={false}
                />
              )}
            </section>
          </div>
          <DialogContent
            id="experience-filter-dialog"
            data-testid="experience-filter-dialog"
            aria-labelledby="experience-filter-title"
            aria-describedby="experience-filter-description"
            className="fixed inset-y-0 right-0 left-auto top-0 z-50 flex h-dvh max-h-dvh w-full max-w-[430px] translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-y-0 border-r-0 p-0 shadow-xl duration-200 data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right sm:max-w-[430px]"
          >
            <DialogHeader className="shrink-0 border-b border-border px-5 py-5 pr-14">
              <DialogTitle id="experience-filter-title">{t("ui.explore.filterDrawerTitle")}</DialogTitle>
              <DialogDescription id="experience-filter-description" className="text-sm text-muted-foreground">
                {t("ui.explore.filterDrawerDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
                <CustomerDiscoveryFilterPanel
                  layout="sidebar"
                  mode="experiences"
                  value={filters}
                  hasActiveFilters={hasActiveFilters}
                  onChange={updateFilters}
                  onClear={clearFilters}
                  placeholder={t("ui.map.searchExperience")}
                  category={null}
                  onCategoryChange={() => undefined}
                />
            </div>
            <div className="flex shrink-0 gap-3 border-t border-border bg-background px-5 py-4">
              <Button type="button" variant="outline" className="flex-1" onClick={clearFilters}>
                {t("ui.actions.clearFilters")}
              </Button>
              <Button type="button" className="flex-1" onClick={() => setExperienceFiltersOpen(false)}>
                {t("ui.explore.showExperienceResults")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
