"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Bookmark, MapPin, Navigation, Star, X } from "lucide-react";
import { DEMO_STATES, getState } from "@/lib/demo-map/data";
import { activityToMapPlace } from "@/lib/demo-map/adapt";
import { useWishlist } from "@/components/providers/wishlist";
import { searchActivities } from "@/backend/domains/catalogue";
import { CATEGORY_DETAILS } from "@/lib/customer/category-details";
import type { ComputedActivity } from "@/backend/core/types";
import { MalaysiaStateMap, type StateCounts } from "./malaysia-state-map";

// Display metadata for the 4 real categories — Hidden Gem is a collection
// filter backed by the listing flag and is rendered separately below.
const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  food: { label: "Food", icon: "🍜" },
  activity: { label: "Activity", icon: "🧭" },
  accommodation: { label: "Accommodation", icon: "🏨" },
  retail: { label: "Retail", icon: "🛍" },
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

  // Per-state category breakdown for the map hover popover — always computed
  // from the full, unfiltered Malaysia-wide set so it doesn't flicker as
  // filters/state selection change.
  const stateCounts = useMemo(() => {
    const byState: StateCounts = {};
    for (const activity of initialActivities) {
      const place = activityToMapPlace(activity);
      const meta = activity.categorySlug ? CATEGORY_META[activity.categorySlug] : undefined;
      if (!meta) continue;
      const bucket = (byState[place.stateId] ??= []);
      const existing = bucket.find((b) => b.icon === meta.icon);
      if (existing) existing.count += 1;
      else bucket.push({ icon: meta.icon, count: 1 });
    }
    return byState;
  }, [initialActivities]);

  // Category counts for the sidebar — reflects the currently selected state
  // (via `activities`) but ignores the category/type/badge filter itself, so
  // toggling a category off doesn't zero out its own count.
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const activity of activities) {
      if (!activity.categorySlug) continue;
      counts[activity.categorySlug] = (counts[activity.categorySlug] ?? 0) + 1;
    }
    return counts;
  }, [activities]);

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

  return (
    <div className="bg-background text-foreground">
      <section className="relative overflow-hidden bg-primary text-white">
        <div className="pointer-events-none absolute -right-20 -top-32 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 left-1/3 h-40 w-80 rounded-full bg-white/10 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-5 pb-9 pt-8 sm:px-8 sm:pb-12 sm:pt-12">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="max-w-2xl">
              <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.24em] text-accent">MyWisata · Discover Malaysia</p>
              <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold leading-[1.02] tracking-tight sm:text-6xl">Find your next story.</h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/80 sm:text-base">Explore Malaysia state by state, then let the map guide you to food, culture, nature and coast.</p>
            </div>
            <div className="rounded-2xl border border-white/20 bg-white/10 px-4 py-3 text-right backdrop-blur-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">Coverage</p>
              <p className="mt-1 font-[family-name:var(--font-mono)] text-2xl font-bold text-accent">{DEMO_STATES.length}</p>
              <p className="text-[11px] text-white/80">states &amp; territories</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Malaysia-wide discovery</p>
            <p className="mt-1 text-sm text-muted-foreground">Tap any state to filter, or hover for a quick breakdown.</p>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <MalaysiaStateMap stateCounts={stateCounts} selectedStateId={selectedStateId} onSelectState={selectState} onDismissPlace={() => setSelectedPlaceId(null)} />

          <aside className="rounded-[1.5rem] border border-border bg-card p-4 shadow-[0_12px_28px_rgba(1,0,102,0.06)]" aria-label="Category filter">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Browse by category</p>
                <h2 className="mt-1 font-[family-name:var(--font-display)] text-xl font-bold">Find your thing.</h2>
              </div>
              <MapPin size={18} className="mt-1 text-cta-orange" />
            </div>

            <div className="mt-4 max-h-[420px] overflow-y-auto pr-1">
              {Object.entries(CATEGORY_DETAILS).map(([slug, detail]) => {
                const meta = CATEGORY_META[slug];
                const allTypeSlugs = detail.types.map((t) => t.slug);
                return (
                  <div key={slug} className="mb-3 last:mb-0">
                    <label className="flex items-center gap-2 text-sm font-bold text-foreground">
                      <input type="checkbox" checked={selectedTypes[slug] !== undefined} onChange={() => toggleCategory(slug)} className="h-3.5 w-3.5 accent-primary" />
                      <span className="flex-1">{meta?.icon} {meta?.label ?? slug}</span>
                      <span className="text-[11px] font-normal text-muted-foreground">{categoryCounts[slug] ?? 0}</span>
                    </label>
                    <div className="ml-5 mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1">
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
        </div>

        {selectedActivity && (
          <div className="relative z-20 mx-auto -mt-20 max-w-2xl px-3 sm:-mt-24">
            <article className="rounded-[1.5rem] border border-border bg-card p-4 shadow-[0_18px_40px_rgba(1,0,102,0.18)] sm:p-5">
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- catalogue image, not an optimizable static asset */}
                <img src={selectedActivity.image} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
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

        <section className="mt-8">
          <div className="mb-3 flex items-end justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Malaysia experiences</p><h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold">{selectedStateId ? getState(selectedStateId)?.name : "Across Malaysia"}</h2></div><span className="text-xs font-semibold text-muted-foreground">{filteredActivities.length} places</span></div>
          {filteredActivities.length === 0 ? <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">No experiences match this view. Try another state or fewer filters.</div> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{filteredActivities.slice(0, 8).map((activity) => <button key={activity.id} type="button" onClick={() => setSelectedPlaceId(activity.id)} className={`group rounded-2xl border bg-card p-3 text-left shadow-[0_6px_18px_rgba(1,0,102,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgba(1,0,102,0.1)] ${activity.id === selectedPlaceId ? "border-cta-orange" : "border-border"}`}><div className="flex items-start justify-between gap-2">{/* eslint-disable-next-line @next/next/no-img-element -- catalogue image, not an optimizable static asset */}<img src={activity.image} alt="" className="h-9 w-9 rounded-xl object-cover" /><span className="font-[family-name:var(--font-mono)] text-[11px] font-bold text-primary">RM {activity.price}</span></div><p className="mt-3 truncate text-sm font-bold text-foreground">{activity.name}</p><p className="mt-1 truncate text-[11px] text-muted-foreground">{activity.outlet.city} · {activity.category}</p></button>)}</div>}
        </section>
      </section>
    </div>
  );
}
