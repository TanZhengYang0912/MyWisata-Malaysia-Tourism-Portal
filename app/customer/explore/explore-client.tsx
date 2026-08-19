"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { Compass, Map } from "lucide-react";
import { searchActivities, CATEGORIES } from "@/backend/domains/catalogue";
import { ActivityCard } from "@/components/customer/activity-card";
import { DiscoveryCategoryFilter, DiscoverySearchField } from "@/components/customer/discovery-filters";
import { MALAYSIA_DESTINATIONS } from "@/lib/customer/malaysia-destinations";
import { StoryMap } from "@/components/demo-map/story-map";
import type { ComputedActivity } from "@/backend/core/types";
import { getDiscoverySearchFilter } from "@/lib/customer/discovery-categories";

type ExploreTab = "destinations" | "experiences";

const ZONE_ORDER = [
  "Northern Malaysia",
  "Central Malaysia",
  "Southern Malaysia",
  "East Coast Malaysia",
  "Borneo Malaysia",
  "Federal Territory",
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
  const [tab, setTab] = useState<ExploreTab>("destinations");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [activities, setActivities] = useState<ComputedActivity[]>(initialActivities);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timeout = window.setTimeout(() => {
      searchActivities({ q: query.trim() || undefined, ...getDiscoverySearchFilter(category) }).then(setActivities);
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [category, query]);

  const hasActiveFilters = Boolean(query.trim() || category);

  const clearFilters = () => {
    setQuery("");
    setCategory(null);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <section className="border-b border-border bg-background">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">Explore Malaysia</p>
              <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold text-foreground sm:text-4xl">
                Where do you want to go?
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Find your next destination or discover the experience that fits your mood.
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
                Destinations
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
                Experiences
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Destinations tab */}
      {tab === "destinations" && (
        <div>
          {/* Malaysia map + state cards via existing StoryMap */}
          <StoryMap initialActivities={activities} />

          {/* Destination cards grid */}
          <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">States &amp; Cities</p>
                <h2 className="mt-1 text-2xl font-bold text-foreground">Explore by Destination</h2>
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
                                    {placeCount} {placeCount === 1 ? "place" : "places"} to visit
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
            <DiscoverySearchField value={query} onChange={setQuery} placeholder="Search experiences..." />
            <DiscoveryCategoryFilter
              category={category}
              hasActiveFilters={hasActiveFilters}
              onCategoryChange={setCategory}
              onClear={clearFilters}
            />
          </section>

          {/* Experience cards */}
          <section>
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-foreground">
                  {query
                    ? "Search Results"
                    : category
                    ? `${CATEGORIES.find((c) => c.id === category)?.label ?? ""} Experiences`
                    : "All Experiences"}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">{activities.length} results</p>
              </div>
            </div>
            {activities.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
                No experiences found. Try adjusting your search or filters.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4 sm:gap-5 md:grid-cols-4">
                {activities.slice(0, 16).map((a) => (
                  <ActivityCard key={a.id} activity={a} returnTo="/customer/explore" />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
