"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ArrowUpDown, ChevronDown, Compass, Map, MapPin, SlidersHorizontal, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import * as catalogueDomain from "@/backend/domains/catalogue";
import { ActivityCard } from "@/components/customer/activity-card";
import { toDiscoveryCatalogueCard } from "@/lib/customer/product-catalogue";
import { CustomerDiscoveryFilterPanel, DiscoverySearchField } from "@/components/customer/discovery-filters";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ExplorePostcardBoard } from "@/components/customer/explore-postcard-board";
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
  dataUnavailable = false,
}: {
  initialActivities: ComputedActivity[];
  statesWithPlaces?: string[];
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

  // One removable chip per applied experience facet; the Filters count is the chip count.
  const experienceChips: { key: string; label: string; icon?: boolean; remove: Partial<DiscoveryQuery> }[] = [
    ...(filters.state && filters.state !== "All Malaysia" ? [{ key: "state", label: filters.state, icon: true, remove: { state: null } }] : []),
    ...filters.categories.map((category) => ({
      key: `category-${category}`,
      label: t(`categories.${category}`),
      remove: { categories: filters.categories.filter((item) => item !== category), types: filters.types.filter((item) => !item.startsWith(`${category}:`)) },
    })),
    ...filters.types.map((token) => ({ key: `type-${token}`, label: t(`ui.map.types.${token.split(":")[1]}`), remove: { types: filters.types.filter((item) => item !== token) } })),
    ...(filters.openNow ? [{ key: "openNow", label: t("ui.labels.openNow"), remove: { openNow: false } }] : []),
    ...(["hiddenGemOnly", "familyFriendlyOnly", "coupleFriendlyOnly"] as const)
      .filter((key) => filters[key])
      .map((key) => ({ key, label: t(`ui.discovery.${key}`), remove: { [key]: false } })),
  ];
  const updateFilters = (patch: Partial<DiscoveryQuery>) => {
    const merged = { ...filters, ...patch };
    const next = tab === "experiences" ? normalizeExperienceFilters(merged) : merged;
    setFilters(next);
    router.replace(buildExploreHref(next, tab, activeSort));
  };

  const changeTab = (nextTab: ExploreTab) => {
    // Destinations has no filter controls, so filters set on Experiences must not silently shape the postcard board.
    const nextFilters = nextTab === "experiences" ? normalizeExperienceFilters(filters) : parseDiscoveryQuery(new URLSearchParams());
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
            <div className="inline-flex shrink-0 self-end md:self-auto rounded-2xl border border-border bg-card p-2 shadow-sm">
              <button
                type="button"
                onClick={() => changeTab("destinations")}
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition ${
                  tab === "destinations"
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Map size={15} />
                {t("ui.explore.destinations")}
              </button>
              <button
                type="button"
                onClick={() => changeTab("experiences")}
                className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition ${
                  tab === "experiences"
                    ? "bg-primary text-white shadow-sm"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Compass size={15} />
                {t("ui.explore.experiences")}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Destinations tab */}
      {tab === "destinations" && (
        <ExplorePostcardBoard activities={displayActivities} statesWithPlaces={statesWithPlaces} returnTo={buildExploreHref(filters, tab)} onSponsoredClick={(activity) => recordSponsoredEvent(activity, "click")} />
      )}

      {/* Experiences tab */}
      {tab === "experiences" && (
        <Dialog open={experienceFiltersOpen} onOpenChange={setExperienceFiltersOpen}>
          <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
            <section className="min-w-0">
              <div data-testid="experience-toolbar" className="mb-6 flex flex-col gap-1 sm:flex-row sm:items-end sm:gap-8">
                <DiscoverySearchField value={filters.q} onChange={(q) => updateFilters({ q })} />
                <div className="flex shrink-0 items-end gap-5 sm:gap-8">
                  <DialogTrigger asChild>
                    <button
                      type="button"
                      data-testid="experience-filter-trigger"
                      className={`inline-flex min-h-12 items-center gap-2.5 border-b-2 px-1 text-[15px] font-bold text-primary transition-colors focus-visible:border-primary focus-visible:outline-none ${experienceChips.length > 0 ? "border-primary" : "border-primary/15 hover:border-primary/40"}`}
                    >
                      <SlidersHorizontal size={18} aria-hidden="true" />
                      {t("ui.explore.filters")}
                      {experienceChips.length > 0 && (
                        <span className="inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full border-[1.5px] border-primary/30 px-1.5 text-xs font-extrabold text-primary">
                          {experienceChips.length}
                        </span>
                      )}
                    </button>
                  </DialogTrigger>
                  <label className={`relative inline-flex min-h-12 min-w-0 flex-1 items-center gap-2.5 border-b-2 px-1 text-primary transition-colors focus-within:border-primary sm:w-[220px] sm:flex-none ${sort !== "recommended" ? "border-primary" : "border-primary/15 hover:border-primary/40"}`}>
                    <ArrowUpDown size={18} aria-hidden="true" className="shrink-0" />
                    <select
                      aria-label={t("ui.explore.sortBy")}
                      value={sort}
                      onChange={(event) => changeExperienceSort(readExperienceSort(event.target.value))}
                      className="min-w-0 flex-1 cursor-pointer appearance-none bg-transparent pr-6 text-[15px] font-bold text-primary outline-none"
                    >
                      <option value="recommended">{t("ui.explore.sortRecommended")}</option>
                      <option value="price_asc">{t("ui.explore.sortPriceAsc")}</option>
                      <option value="rating_desc">{t("ui.explore.sortRatingDesc")}</option>
                    </select>
                    <ChevronDown size={14} aria-hidden="true" className="pointer-events-none absolute right-1" />
                  </label>
                </div>
              </div>
              {experienceChips.length > 0 && (
                <div data-testid="experience-active-filters" className="-mt-2 mb-6 flex flex-wrap items-center gap-2.5">
                  {experienceChips.map((chip) => (
                    <button
                      key={chip.key}
                      type="button"
                      aria-label={t("ui.discovery.removeFilter", { label: chip.label })}
                      onClick={() => updateFilters(chip.remove)}
                      className="inline-flex h-[34px] items-center gap-2 rounded-full border-[1.5px] border-primary pl-3 pr-2.5 text-[13px] font-bold text-primary transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    >
                      {chip.icon && <MapPin size={15} aria-hidden="true" />}
                      {chip.label}
                      <X size={15} aria-hidden="true" />
                    </button>
                  ))}
                  <button type="button" onClick={clearFilters} className="px-0.5 py-1.5 text-[13px] font-bold text-primary underline underline-offset-4 hover:text-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                    {t("ui.actions.clearFilters")}
                  </button>
                </div>
              )}
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
                <Pagination
                  ariaLabel={t("ui.pagination.experiencePages")}
                  currentPage={currentExperiencePage}
                  onPageChange={changeExperiencePage}
                  pageSize={EXPERIENCE_PAGE_SIZE}
                  totalItems={displayActivities.length}
                  totalPages={totalExperiencePages}
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
              <DialogTitle id="experience-filter-title" className="text-primary">{t("ui.explore.filterDrawerTitle")}</DialogTitle>
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
                  category={null}
                  onCategoryChange={() => undefined}
                />
            </div>
            <div className="flex shrink-0 items-center gap-4 border-t border-border bg-background px-5 py-4">
              <button type="button" onClick={clearFilters} className="px-0.5 py-1.5 text-[13px] font-bold text-primary underline underline-offset-4 hover:text-primary/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                {t("ui.actions.clearFilters")}
              </button>
              <Button type="button" className="h-11 flex-1 rounded-xl font-bold" onClick={() => setExperienceFiltersOpen(false)}>
                {t("ui.explore.showResultsCount", { count: displayActivities.length })}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
