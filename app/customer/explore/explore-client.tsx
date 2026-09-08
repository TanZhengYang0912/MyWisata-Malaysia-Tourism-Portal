"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import Link from "next/link";
import Image from "next/image";
import { Compass, Map } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { searchActivities } from "@/backend/domains/catalogue";
import { ActivityCard } from "@/components/customer/activity-card";
import { DiscoveryAdvancedFilters, DiscoveryCategoryFilter, DiscoverySearchField } from "@/components/customer/discovery-filters";
import { MALAYSIA_DESTINATIONS } from "@/lib/customer/malaysia-destinations";
import { StoryMap } from "@/components/demo-map/story-map";
import type { ComputedActivity } from "@/backend/core/types";
import { parseDiscoveryQuery, serializeDiscoveryQuery, type DiscoveryQuery } from "@/lib/customer/discovery-query";
import { createClient } from "@/lib/supabase/client";
import { rankDiscoveryResults } from "@/lib/customer/discovery-ranking";
import type { DiscoveryResult, SponsoredPlacement } from "@/backend/core/types";

type ExploreTab = "destinations" | "experiences";

const ZONE_ORDER = [
  "Federal Territory",
  "Northern Malaysia",
  "Central Malaysia",
  "Southern Malaysia",
  "Borneo Malaysia",
  "East Coast Malaysia",
];

export function ExploreClient({
  initialActivities,
  statesWithPlaces = [],
  placeCountByState = {},
}: {
  initialActivities: ComputedActivity[];
  statesWithPlaces?: string[];
  placeCountByState?: Record<string, number>;
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
  const [tab, setTab] = useState<ExploreTab>("destinations");
  const [filters, setFilters] = useState<DiscoveryQuery>(() => parseDiscoveryQuery(new URLSearchParams(searchParams.toString())));
  const [debouncedQuery, setDebouncedQuery] = useState(filters.q);
  const [activities, setActivities] = useState<DiscoveryResult[]>(() => initialActivities.map((activity) => ({ ...activity, sponsorship: null })));
  const [visibleLimit, setVisibleLimit] = useState(8);

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
    freeOnly: filters.freeOnly,
    bookableOnly: filters.bookableOnly,
    hiddenGemOnly: filters.hiddenGemOnly,
    familyFriendlyOnly: filters.familyFriendlyOnly,
    coupleFriendlyOnly: filters.coupleFriendlyOnly,
  }), [
    debouncedQuery,
    filters.state,
    filters.categories,
    filters.types,
    filters.priceMax,
    filters.freeOnly,
    filters.bookableOnly,
    filters.hiddenGemOnly,
    filters.familyFriendlyOnly,
    filters.coupleFriendlyOnly,
  ]);

  useEffect(() => {
    let cancelled = false;
    const requestedAt = new Date().toISOString();
    const placementsRequest = db
      ? db
        .rpc("list_active_sponsored_discovery_placements")
      : Promise.resolve({ data: [], error: null });
    Promise.all([
      searchActivities(searchQuery),
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
  }, [db, searchQuery]);

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
    filters.q.trim() || filters.state || filters.categories.length || filters.types.length || filters.priceMax !== null ||
    filters.freeOnly || filters.bookableOnly || filters.hiddenGemOnly || filters.familyFriendlyOnly || filters.coupleFriendlyOnly,
  );

  const updateFilters = (patch: Partial<DiscoveryQuery>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    router.replace(`/customer/explore?${serializeDiscoveryQuery(next).toString()}`.replace(/\?$/, ""));
    setVisibleLimit(8);
  };

  const clearFilters = () => {
    updateFilters({ q: "", state: null, categories: [], types: [], priceMax: null, freeOnly: false, bookableOnly: false, hiddenGemOnly: false, familyFriendlyOnly: false, coupleFriendlyOnly: false });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">{t("ui.explore.eyebrow")}</p>
              <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-foreground sm:text-4xl">
                {t("ui.explore.title")}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("ui.explore.description")}
              </p>
            </div>

            {/* Tab switch */}
            <div className="inline-flex shrink-0 self-end md:self-auto rounded-2xl border border-border bg-card p-2 shadow-sm">
              <button
                type="button"
                onClick={() => setTab("destinations")}
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
                onClick={() => setTab("experiences")}
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
        <div>
          {/* Malaysia map + state cards via existing StoryMap */}
          <StoryMap activities={activities} filters={filters} onFilterChange={updateFilters} onSponsoredClick={(activity) => recordSponsoredEvent(activity, "click")} />

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
                                className="object-cover transition duration-500 group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                              <div className="absolute inset-x-3 bottom-3">
                                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary-foreground/70">
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
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
          <section className="mb-8 space-y-6">
            <DiscoverySearchField value={filters.q} onChange={(q) => updateFilters({ q })} placeholder={t("ui.map.searchExperience")} />
            <DiscoveryCategoryFilter
              category={filters.categories.length === 1 ? filters.categories[0] : filters.hiddenGemOnly ? "hidden_gem" : null}
              hasActiveFilters={hasActiveFilters}
              onCategoryChange={(category) => updateFilters(
                category === "hidden_gem"
                  ? { categories: [], types: [], hiddenGemOnly: true }
                  : { categories: category ? [category] : [], types: [], hiddenGemOnly: false },
              )}
              onClear={clearFilters}
            />
            <DiscoveryAdvancedFilters value={filters} onChange={updateFilters} />
          </section>

          {/* Experience cards */}
          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  {filters.q
                    ? t("ui.explore.allExperiences")
                    : filters.categories.length === 1
                    ? t("ui.explore.categoryExperiences", { category: filters.categories[0] })
                    : t("ui.explore.allExperiences")}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{t("ui.explore.results", { count: activities.length })}</p>
              </div>
            </div>
            {activities.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                {t("ui.explore.noExperiences")}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-4">
                {activities.slice(0, visibleLimit).map((a) => (
                  <ActivityCard key={a.id} activity={a} returnTo="/customer/explore" onSponsoredClick={a.sponsorship ? () => recordSponsoredEvent(a, "click") : undefined} />
                ))}
              </div>
            )}
            {activities.length > 8 && visibleLimit < activities.length && (
              <button type="button" onClick={() => setVisibleLimit(activities.length)} className="mt-6 rounded-full border border-border px-5 py-2 text-sm font-bold text-primary hover:bg-secondary">
                {t("ui.discovery.showAll", { count: activities.length })}
              </button>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
