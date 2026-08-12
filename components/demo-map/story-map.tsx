"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Bookmark, ImageOff, MapPin, Navigation, SlidersHorizontal, Star, X } from "lucide-react";
import { getState } from "@/lib/demo-map/data";
import { activityToMapPlace } from "@/lib/demo-map/adapt";
import { useWishlist } from "@/components/providers/wishlist";
import { CategoryIcon } from "@/components/customer/category-icon";
import { searchActivities } from "@/backend/domains/catalogue";
import { CATEGORY_DETAILS } from "@/lib/customer/category-details";
import type { ComputedActivity } from "@/backend/core/types";
import { MalaysiaStateMap, type StateCounts } from "./malaysia-state-map";

// Display metadata for the 4 real categories — Hidden Gem is a collection
// filter backed by the listing flag and is rendered separately below.
const CATEGORY_META: Record<string, { label: string }> = {
  food: { label: "Food" },
  activity: { label: "Activity" },
  accommodation: { label: "Accommodation" },
  retail: { label: "Retail" },
};

type BadgeKey = "hidden_gem" | "family_friendly" | "couple_friendly";
const BADGE_OPTIONS: { key: BadgeKey; label: string }[] = [
  { key: "family_friendly", label: "Family Friendly" },
  { key: "couple_friendly", label: "Couple Friendly" },
];

// Per category: undefined = category excluded; "all" = every type included;
// a Set = only those specific types included. Lets "Food + Activity/Nature
// only" style selections work without a separate subcategory data model.
type TypeSelection = Record<string, "all" | Set<string>>;

export function StoryMap({ initialActivities }: { initialActivities: ComputedActivity[] }) {
  const { savedIds, toggleSaved } = useWishlist();
  const [selectedStateId, setSelectedStateId] = useState<string | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [activities, setActivities] = useState<ComputedActivity[]>(initialActivities);
  const [selectedTypes, setSelectedTypes] = useState<TypeSelection>({});
  const [selectedBadges, setSelectedBadges] = useState<Set<BadgeKey>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Skip the very first run: the default view is already server-rendered via
  // initialActivities. Only refetch once state actually changes — category/type/
  // badge filtering happens client-side below (multi-select can't map onto the
  // single-category server filter).
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const stateName = selectedStateId ? getState(selectedStateId)?.name ?? "All Malaysia" : "All Malaysia";
    searchActivities({ state: stateName }).then(setActivities);
  }, [selectedStateId]);

  const activeFilterCount = Object.keys(selectedTypes).length + selectedBadges.size;
  const filteredActivities = useMemo(() => {
    const hasTypeFilter = Object.keys(selectedTypes).length > 0;
    const hasBadgeFilter = selectedBadges.size > 0;
    if (!hasTypeFilter && !hasBadgeFilter) return activities;
    return activities.filter((a) => {
      if (hasTypeFilter) {
        const sel = selectedTypes[a.categorySlug ?? ""];
        if (sel === undefined) return false;
        if (sel !== "all" && !(a.typeSlugs ?? []).some((t) => sel.has(t))) return false;
      }
      if (hasBadgeFilter) {
        const matchesBadge =
          (selectedBadges.has("hidden_gem") && a.isHiddenGem) ||
          (selectedBadges.has("family_friendly") && a.isFamilyFriendly) ||
          (selectedBadges.has("couple_friendly") && a.isCoupleFriendly);
        if (!matchesBadge) return false;
      }
      return true;
    });
  }, [activities, selectedTypes, selectedBadges]);

  const selectedActivity = filteredActivities.find((a) => a.id === selectedPlaceId) ?? null;
  const saved = selectedActivity ? savedIds.has(selectedActivity.id) : false;

  // Per-state category breakdown for the permanent map label cards — always
  // computed from the full, unfiltered Malaysia-wide set so it doesn't flicker
  // as filters/state selection change.
  const stateCounts = useMemo(() => {
    const byState: StateCounts = {};
    for (const activity of initialActivities) {
      const place = activityToMapPlace(activity);
      const category = activity.categorySlug;
      const meta = category ? CATEGORY_META[category] : undefined;
      if (!category || !meta) continue;
      const bucket = (byState[place.stateId] ??= []);
      const existing = bucket.find((b) => b.category === category);
      if (existing) existing.count += 1;
      else bucket.push({ category, count: 1 });
    }
    return byState;
  }, [initialActivities]);

  function selectState(stateId: string | null) {
    setSelectedStateId(stateId);
    setSelectedPlaceId(null);
  }

  function toggleCategory(slug: string) {
    setSelectedTypes((prev) => {
      const next = { ...prev };
      if (next[slug] !== undefined) delete next[slug];
      else next[slug] = "all";
      return next;
    });
  }
  function toggleType(categorySlug: string, typeSlug: string, allTypeSlugs: string[]) {
    setSelectedTypes((prev) => {
      const next = { ...prev };
      const current = next[categorySlug];
      if (current === undefined) {
        next[categorySlug] = new Set([typeSlug]);
        return next;
      }
      const set = current === "all" ? new Set(allTypeSlugs) : new Set(current);
      if (set.has(typeSlug)) set.delete(typeSlug);
      else set.add(typeSlug);
      if (set.size === 0) delete next[categorySlug];
      else if (set.size === allTypeSlugs.length) next[categorySlug] = "all";
      else next[categorySlug] = set;
      return next;
    });
  }
  function isTypeChecked(categorySlug: string, typeSlug: string) {
    const current = selectedTypes[categorySlug];
    if (current === undefined) return false;
    return current === "all" || current.has(typeSlug);
  }
  function toggleBadge(key: BadgeKey) {
    setSelectedBadges((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  function clearFilters() {
    setSelectedTypes({});
    setSelectedBadges(new Set());
  }

  const categoryFilterPanel = (
    <aside
      id="explore-category-filter"
      className="mt-3 rounded-2xl border border-border bg-secondary/60 p-3"
      aria-label="More filters"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">More filters</p>
          <h3 className="mt-1 font-[family-name:var(--font-display)] text-lg font-bold">Refine results.</h3>
        </div>
        <MapPin size={18} className="mt-1 text-cta-orange" />
      </div>

      <div className="mt-3 max-h-[min(45vh,20rem)] overflow-y-auto pr-1">
        {Object.entries(CATEGORY_DETAILS).map(([slug, detail]) => {
          const meta = CATEGORY_META[slug];
          const allTypeSlugs = detail.types.map((t) => t.slug);
          return (
            <div key={slug} className="mb-2.5 last:mb-0">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-foreground"><CategoryIcon category={slug} size={14} strokeWidth={1.8} />{meta?.label ?? slug}</p>
              <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1">
                {detail.types.map((t) => (
                  <label key={t.slug} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <input type="checkbox" checked={isTypeChecked(slug, t.slug)} onChange={() => toggleType(slug, t.slug, allTypeSlugs)} className="h-3 w-3 accent-primary" />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
          );
        })}

        <label className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-sm font-bold text-foreground">
          <input type="checkbox" checked={selectedBadges.has("hidden_gem")} onChange={() => toggleBadge("hidden_gem")} className="h-3.5 w-3.5 accent-primary" />
          <span className="flex-1">💎 Hidden Gem</span>
          <span className="text-[11px] font-normal text-muted-foreground">{activities.filter((activity) => activity.isHiddenGem).length}</span>
        </label>

        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-primary">Good for</p>
          <div className="flex flex-col gap-1">
            {BADGE_OPTIONS.map((b) => (
              <label key={b.key} className="flex items-center gap-2 text-xs text-foreground">
                <input type="checkbox" checked={selectedBadges.has(b.key)} onChange={() => toggleBadge(b.key)} className="h-3.5 w-3.5 accent-primary" />
                {b.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      {activeFilterCount > 0 && (
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
          <span className="text-[11px] text-muted-foreground">{activeFilterCount} active</span>
          <button type="button" onClick={clearFilters} className="text-[11px] font-bold text-muted-foreground hover:text-destructive">Clear all</button>
        </div>
      )}
    </aside>
  );

  return (
    <div className="bg-background text-foreground">
      <section className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:h-[min(920px,calc(100dvh-8rem))] lg:px-8 lg:py-6">
        <div className="grid gap-6 lg:h-full lg:grid-rows-[minmax(0,1fr)_240px] 2xl:grid-rows-[minmax(0,1fr)_320px]">
          <div className="relative min-w-0 lg:h-full lg:min-h-0">
            <MalaysiaStateMap stateCounts={stateCounts} selectedStateId={selectedStateId} onSelectState={selectState} onDismissPlace={() => setSelectedPlaceId(null)} />

            {selectedActivity && (
              <div className="relative z-20 mx-auto mt-3 w-[calc(100%-1.5rem)] max-w-2xl lg:absolute lg:bottom-4 lg:left-1/2 lg:mt-0 lg:-translate-x-1/2">
            <article className="rounded-[1.5rem] border border-border bg-card p-4 shadow-[0_18px_40px_rgba(1,0,102,0.18)] sm:p-5">
              <div className="flex items-start gap-3">
                {selectedActivity.image ? (
                  // eslint-disable-next-line @next/next/no-img-element -- catalogue image, not an optimizable static asset
                  <img src={selectedActivity.image} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-secondary text-muted-foreground">
                    <ImageOff size={22} strokeWidth={1.5} aria-hidden="true" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-secondary px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-primary">{selectedActivity.category}</span>
                  </div>
                  <h2 className="mt-2 truncate font-[family-name:var(--font-display)] text-xl font-bold text-foreground">{selectedActivity.name}</h2>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={12} />{selectedActivity.outlet.city} · {selectedActivity.outlet.state}</p>
                </div>
                <button type="button" aria-label={saved ? "Remove saved place" : "Save place"} aria-pressed={saved} onClick={() => toggleSaved(selectedActivity.id)} className={`rounded-xl p-2 ${saved ? "bg-accent text-accent-foreground" : "bg-secondary text-primary"}`}><Bookmark size={17} fill={saved ? "currentColor" : "none"} /></button>
                <button type="button" aria-label="Close" onClick={() => setSelectedPlaceId(null)} className="rounded-xl bg-secondary p-2 text-primary hover:bg-muted"><X size={17} /></button>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                <div className="flex items-center gap-1 text-xs font-bold text-foreground"><Star size={13} fill="var(--accent)" stroke="none" /> {selectedActivity.rating} <span className="font-normal text-muted-foreground">({selectedActivity.reviews} reviews)</span><span className="ml-2 font-[family-name:var(--font-mono)] text-sm text-primary">RM {selectedActivity.price}</span></div>
                <div className="flex items-center gap-2"><Link href={`/customer/activity/${selectedActivity.id}`} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-white hover:bg-primary/90">View place <ArrowRight size={13} /></Link><a href={`https://www.google.com/maps/search/?api=1&query=${selectedActivity.outlet.lat},${selectedActivity.outlet.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-xs font-bold text-primary hover:bg-secondary"><Navigation size={13} /> Directions</a></div>
              </div>
            </article>
            </div>
            )}
          </div>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-[1.5rem] border border-border bg-card p-2 shadow-[0_12px_28px_rgba(1,0,102,0.08)] sm:p-3 2xl:p-4">
            <div className="flex shrink-0 items-end justify-between gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary 2xl:text-[10px]">Malaysia experiences</p>
                <h2 className="mt-0.5 font-[family-name:var(--font-display)] text-lg font-bold tracking-tight sm:text-xl 2xl:text-2xl">{selectedStateId ? getState(selectedStateId)?.name : "Across Malaysia"}</h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {selectedStateId && <button type="button" onClick={() => selectState(null)} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] font-bold text-muted-foreground transition hover:border-primary hover:text-primary"><X size={12} /> All states</button>}
                <span className="text-xs font-semibold text-muted-foreground">{filteredActivities.length} places</span>
              </div>
            </div>

            <div className="mt-1 flex shrink-0 flex-wrap gap-1.5 2xl:mt-2" aria-label="Experience filters">
              <button type="button" onClick={clearFilters} className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition 2xl:px-3 2xl:py-1 2xl:text-[11px] ${activeFilterCount === 0 ? "border-primary bg-primary text-white" : "border-border text-muted-foreground hover:bg-secondary"}`}>All</button>
              {Object.entries(CATEGORY_META).map(([slug, meta]) => (
                <button
                  key={slug}
                  type="button"
                  onClick={() => toggleCategory(slug)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition 2xl:px-3 2xl:py-1 2xl:text-[11px] ${selectedTypes[slug] !== undefined ? "border-primary bg-primary text-white" : "border-border text-muted-foreground hover:bg-secondary"}`}
                >
                  <CategoryIcon category={slug} size={14} strokeWidth={1.8} /> {meta.label}
                </button>
              ))}
              <button type="button" onClick={() => toggleBadge("hidden_gem")} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition 2xl:px-3 2xl:py-1 2xl:text-[11px] ${selectedBadges.has("hidden_gem") ? "border-primary bg-primary text-white" : "border-border text-muted-foreground hover:bg-secondary"}`}><CategoryIcon category="hidden_gem" size={12} strokeWidth={1.8} /> Hidden Gem</button>
              <button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} aria-controls="explore-category-filter" className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition 2xl:px-3 2xl:py-1 2xl:text-[11px] ${filtersOpen || activeFilterCount > 0 ? "border-primary/30 bg-secondary text-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}>
                <SlidersHorizontal size={13} /> More filters{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
              </button>
            </div>

            {filtersOpen && categoryFilterPanel}

            <div className="mt-2 min-h-0 overflow-hidden 2xl:mt-3">
              {filteredActivities.length === 0 ? (
                <div className="rounded-2xl border border-border bg-secondary/50 p-8 text-center text-sm text-muted-foreground">No experiences match this view. Try another state or fewer filters.</div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {filteredActivities.slice(0, 8).map((activity) => (
                    <button
                      key={activity.id}
                      type="button"
                      aria-label={`Open ${activity.name}`}
                      aria-pressed={activity.id === selectedPlaceId}
                      onClick={() => setSelectedPlaceId(activity.id)}
                      className={`group min-h-[56px] rounded-xl border bg-background p-1.5 text-left shadow-[0_5px_16px_rgba(1,0,102,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(1,0,102,0.1)] sm:p-2 2xl:min-h-[64px] 2xl:p-3 ${activity.id === selectedPlaceId ? "border-cta-orange bg-orange-50/50" : "border-border"}`}
                     >
                      <div className="flex items-center gap-2 2xl:gap-3">
                         {activity.image ? (
                          // eslint-disable-next-line @next/next/no-img-element -- catalogue image, not an optimizable static asset
                          <img src={activity.image} alt="" className="h-8 w-8 shrink-0 rounded-lg object-cover 2xl:h-12 2xl:w-12" />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground 2xl:h-12 2xl:w-12">
                            <ImageOff size={16} strokeWidth={1.5} aria-hidden="true" />
                          </div>
                        )}
                         <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-xs font-bold leading-tight text-foreground 2xl:text-base">{activity.name}</p>
                          <p className="mt-0.5 truncate text-[9px] text-muted-foreground 2xl:text-xs">{activity.outlet.city} · {activity.category}</p>
                         </div>
                        <span className="shrink-0 self-start font-[family-name:var(--font-mono)] text-[11px] font-bold text-primary 2xl:text-sm">RM {activity.price}</span>
                       </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
