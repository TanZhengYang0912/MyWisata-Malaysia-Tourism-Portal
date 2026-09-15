"use client";

import Link from "next/link";
import Image from "next/image";
import { useTranslation } from "react-i18next";
import { useMemo, useState } from "react";
import { ArrowRight, ImageOff, MapPin, Navigation, SlidersHorizontal, Star, X } from "lucide-react";
import { DEMO_STATES, getState } from "@/lib/demo-map/data";
import { activityToMapPlace } from "@/lib/demo-map/adapt";
import { useWishlist } from "@/components/providers/wishlist";
import { SaveToggleButton } from "@/components/customer/save-toggle-button";
import { useCustomerCapabilityGate } from "@/components/customer/use-customer-capability-gate";
import { CUSTOMER_CAPABILITY } from "@/lib/auth/customer-capabilities";
import { CategoryIcon } from "@/components/customer/category-icon";
import { CATEGORY_DETAILS } from "@/lib/customer/category-details";
import type { ComputedActivity } from "@/backend/core/types";
import type { DiscoveryQuery } from "@/lib/customer/discovery-query";
import type { StateCounts } from "./malaysia-state-map";
import { MyWisataExploreMap } from "./mywisata-explore-map";
import { MALAYSIA_DESTINATIONS } from "@/lib/customer/malaysia-destinations";
import { HIDDEN_GEM_SYMBOL } from "@/lib/i18n/invariant-tokens";
import { ReferencePrice } from "@/components/shared/reference-price";

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

type StoryMapActivity = ComputedActivity & {
  sponsorship: { placementId: string; label: "Sponsored" } | null;
};

function StateDetailPanel({
  selectedStateId,
  stateCounts,
  activities,
  onSelectState,
  onSelectPlace,
}: {
  selectedStateId: string | null;
  stateCounts: StateCounts;
  activities: StoryMapActivity[];
  onSelectState: (stateId: string | null) => void;
  onSelectPlace: (placeId: string) => void;
}) {
  const { t } = useTranslation("customer");
  const selectedState = selectedStateId ? getState(selectedStateId) : undefined;
  const selectedDestination = selectedState ? MALAYSIA_DESTINATIONS.find((destination) => destination.state === selectedState.name) : undefined;
  const placeCount = selectedStateId ? (stateCounts[selectedStateId] ?? []).reduce((total, bucket) => total + bucket.count, 0) : 0;
  const highlights = selectedStateId
    ? activities.filter((activity) => activityToMapPlace(activity).stateId === selectedStateId).slice(0, 3)
    : [];
  const totalPlaces = Object.values(stateCounts).reduce(
    (total, buckets) => total + buckets.reduce((subtotal, bucket) => subtotal + bucket.count, 0),
    0,
  );

  return (
    <aside aria-label={t("ui.map.selectedStateDetails")} className="flex min-h-[280px] flex-col justify-between rounded-[1.8rem] border border-border bg-card p-5 shadow-sm sm:p-6 lg:h-[620px] lg:min-h-0 lg:overflow-y-auto">
      <div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">{t("ui.map.destinationDetail")}</p>
          <MapPin size={18} className="text-cta-orange" aria-hidden="true" />
        </div>
        <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold leading-tight text-foreground sm:text-3xl">
          {selectedStateId ? selectedState?.name ?? t("ui.map.selectedState") : t("ui.map.selectStateToExplore")}
        </h2>

        {selectedState ? (
          <>
            {selectedDestination && (
              <div data-destination-photo-card className="group relative mt-4 [perspective:1000px]">
                <div aria-hidden="true" className="absolute inset-2 translate-x-2 translate-y-2 rounded-2xl bg-accent/25 shadow-lg transition-transform duration-500 motion-safe:group-hover:translate-x-3 motion-safe:group-hover:translate-y-3 motion-reduce:transition-none" />
                <div className="relative h-36 overflow-hidden rounded-2xl border border-border bg-secondary shadow-[0_12px_24px_rgba(1,0,102,0.16)] transition-[transform,box-shadow] duration-500 transform-gpu motion-safe:group-hover:-translate-y-1 motion-safe:group-hover:rotate-[0.35deg] motion-safe:group-hover:shadow-[0_20px_34px_rgba(1,0,102,0.24)] motion-reduce:transform-none motion-reduce:transition-none sm:h-44">
                  <Image
                    src={selectedDestination.image}
                    alt={selectedDestination.attraction}
                    fill
                    sizes="(max-width: 1024px) 100vw, 280px"
                    className="object-cover transition-transform duration-700 motion-safe:group-hover:scale-[1.04] motion-reduce:transition-none"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary/75 via-primary/10 to-transparent" />
                  <div className="absolute inset-x-3 bottom-3">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/75">{selectedDestination.zone}</p>
                    <p className="mt-1 text-sm font-bold text-white">{selectedDestination.attraction}</p>
                  </div>
                </div>
              </div>
            )}
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {selectedDestination?.tagline ?? (placeCount > 0 ? t("ui.map.placesReady", { count: placeCount }) : t("ui.map.noPublishedPlaces"))}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-secondary px-3 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("ui.labels.places")}</p>
                <p className="mt-1 text-xl font-bold text-primary">{placeCount}</p>
              </div>
              <div className="rounded-2xl bg-secondary px-3 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("ui.map.categories")}</p>
                <p className="mt-1 text-xl font-bold text-primary">{(stateCounts[selectedState?.id ?? ""] ?? []).length}</p>
              </div>
            </div>
            {highlights.length > 0 && (
              <div className="mt-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{t("ui.map.placesToStart")}</p>
                <div className="mt-2 space-y-2">
                  {highlights.map((activity) => (
                    <button key={activity.id} type="button" onClick={() => onSelectPlace(activity.id)} className="flex w-full items-center justify-between gap-3 rounded-xl border border-border px-3 py-2 text-left transition hover:border-primary hover:bg-secondary">
                      <span className="min-w-0"><span className="flex items-center gap-1.5 truncate text-sm font-bold text-foreground">{activity.name}{activity.sponsorship && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-900">{t("ui.labels.sponsored")}</span>}</span>{activity.outlet.hours && <span className="mt-1 block truncate text-[10px] text-muted-foreground">{t("ui.labels.operatingHours")}: {activity.outlet.hours}</span>}</span>
                      <ArrowRight size={14} className="shrink-0 text-primary" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("ui.map.compareRegions")}</p>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-secondary px-3 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("ui.map.regions")}</p>
                <p className="mt-1 text-xl font-bold text-primary">16</p>
              </div>
              <div className="rounded-2xl bg-secondary px-3 py-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{t("ui.labels.places")}</p>
                <p className="mt-1 text-xl font-bold text-primary">{totalPlaces}</p>
              </div>
            </div>
          </>
        )}

        <label htmlFor="explore-state-picker" className="mt-5 block">
          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">{t("ui.map.chooseStateLabel")}</span>
          <select
            id="explore-state-picker"
            aria-label={t("ui.map.chooseStateLabel")}
            value={selectedStateId ?? ""}
            onChange={(event) => onSelectState(event.target.value || null)}
            className="mt-2 w-full appearance-none rounded-xl border border-border bg-background px-3 py-3 text-sm font-bold text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
          >
            <option value="">{t("ui.map.allStatesTerritories")}</option>
            {DEMO_STATES.map((state) => <option key={state.id} value={state.id}>{state.name}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {selectedState ? (
          <>
            <button type="button" onClick={() => document.getElementById("explore-experiences")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-xs font-bold text-white transition hover:bg-primary/90">
              {t("ui.map.viewStatePlaces", { state: selectedState.name })} <ArrowRight size={14} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => onSelectState(null)} className="rounded-full border border-border px-4 py-3 text-xs font-bold text-muted-foreground transition hover:border-primary hover:text-primary">{t("ui.map.allStatesTerritories")}</button>
          </>
        ) : (
          <p className="text-xs font-semibold text-muted-foreground">{t("ui.map.previewHint")}</p>
        )}
      </div>
    </aside>
  );
}

export function StoryMap({
  activities,
  filters,
  onFilterChange,
  onSponsoredClick,
}: {
  activities: StoryMapActivity[];
  filters: DiscoveryQuery;
  onFilterChange: (patch: Partial<DiscoveryQuery>) => void;
  onSponsoredClick?: (activity: StoryMapActivity) => void;
}) {
  const { t } = useTranslation("customer");
  const gate = useCustomerCapabilityGate();
  const { savedIds, toggleSaved } = useWishlist();
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const selectedStateId = DEMO_STATES.find((state) => state.name === filters.state)?.id ?? null;
  const activeFilterCount = filters.categories.length + filters.types.length + Number(filters.hiddenGemOnly) + Number(filters.familyFriendlyOnly) + Number(filters.coupleFriendlyOnly);
  const selectedActivity = activities.find((a) => a.id === selectedPlaceId) ?? null;
  const saved = selectedActivity ? savedIds.has(selectedActivity.id) : false;

  // The map and cards receive the same ordered Explore result set.
  const stateCounts = useMemo(() => {
    const byState: StateCounts = {};
    for (const activity of activities) {
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
  }, [activities]);

  function selectState(stateId: string | null) {
    onFilterChange({ state: stateId ? getState(stateId)?.name ?? null : null });
    setSelectedPlaceId(null);
  }

  function toggleCategory(slug: string) {
    const selected = filters.categories.includes(slug);
    onFilterChange({
      categories: selected ? filters.categories.filter((category) => category !== slug) : [...filters.categories, slug],
      types: selected ? filters.types.filter((token) => !token.startsWith(`${slug}:`)) : filters.types,
    });
  }
  function toggleType(categorySlug: string, typeSlug: string, allTypeSlugs: string[]) {
    const token = `${categorySlug}:${typeSlug}`;
    const currentTypes = filters.types.filter((type) => type.startsWith(`${categorySlug}:`));
    const allTypesSelected = filters.categories.includes(categorySlug) && currentTypes.length === 0;
    const types = allTypesSelected
      ? [...filters.types, ...allTypeSlugs.filter((type) => type !== typeSlug).map((type) => `${categorySlug}:${type}`)]
      : filters.types.includes(token) ? filters.types.filter((type) => type !== token) : [...filters.types, token];
    const categoryTypes = types.filter((type) => type.startsWith(`${categorySlug}:`));
    onFilterChange({
      categories: categoryTypes.length === 0 ? filters.categories.filter((category) => category !== categorySlug) : filters.categories.includes(categorySlug) ? filters.categories : [...filters.categories, categorySlug],
      types: categoryTypes.length === allTypeSlugs.length ? types.filter((type) => !type.startsWith(`${categorySlug}:`)) : types,
    });
  }
  function isTypeChecked(categorySlug: string, typeSlug: string) {
    return filters.types.includes(`${categorySlug}:${typeSlug}`) || (filters.categories.includes(categorySlug) && !filters.types.some((type) => type.startsWith(`${categorySlug}:`)));
  }
  function toggleBadge(key: BadgeKey) {
    const filterKey = key === "hidden_gem" ? "hiddenGemOnly" : key === "family_friendly" ? "familyFriendlyOnly" : "coupleFriendlyOnly";
    onFilterChange({ [filterKey]: !filters[filterKey] });
  }
  function clearFilters() {
    onFilterChange({ categories: [], types: [], hiddenGemOnly: false, familyFriendlyOnly: false, coupleFriendlyOnly: false });
  }

  const categoryFilterPanel = (
    <aside
      id="explore-category-filter"
      className="mt-3 rounded-2xl border border-border bg-secondary/60 p-3"
      aria-label={t("ui.map.moreFilters")}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">{t("ui.map.moreFilters")}</p>
          <h3 className="mt-1 font-[family-name:var(--font-display)] text-lg font-bold">{t("ui.map.refineResults")}</h3>
        </div>
        <MapPin size={18} className="mt-1 text-cta-orange" />
      </div>

      <div className="mt-3 max-h-[min(45vh,20rem)] overflow-y-auto pr-1">
        {Object.entries(CATEGORY_DETAILS).map(([slug, detail]) => {
          const allTypeSlugs = detail.types.map((t) => t.slug);
          return (
            <div key={slug} className="mb-2.5 last:mb-0">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-foreground"><CategoryIcon category={slug} size={14} strokeWidth={1.8} />{t(`categories.${slug}`)}</p>
              <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1">
                {detail.types.map((typeOption) => (
                  <label key={typeOption.slug} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <input type="checkbox" checked={isTypeChecked(slug, typeOption.slug)} onChange={() => toggleType(slug, typeOption.slug, allTypeSlugs)} className="h-3 w-3 accent-primary" />
                    {t(`ui.map.types.${typeOption.slug}`)}
                  </label>
                ))}
              </div>
            </div>
          );
        })}

        <label className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-sm font-bold text-foreground">
          <input type="checkbox" checked={filters.hiddenGemOnly} onChange={() => toggleBadge("hidden_gem")} className="h-3.5 w-3.5 accent-primary" />
          <span className="flex-1">{HIDDEN_GEM_SYMBOL} {t("ui.labels.hiddenGem")}</span>
          <span className="text-[11px] font-normal text-muted-foreground">{activities.filter((activity) => activity.isHiddenGem).length}</span>
        </label>

        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-primary">{t("ui.outlet.goodToKnow")}</p>
          <div className="flex flex-col gap-1">
            {BADGE_OPTIONS.map((b) => (
              <label key={b.key} className="flex items-center gap-2 text-xs text-foreground">
                <input type="checkbox" checked={b.key === "family_friendly" ? filters.familyFriendlyOnly : filters.coupleFriendlyOnly} onChange={() => toggleBadge(b.key)} className="h-3.5 w-3.5 accent-primary" />
                {t(`ui.map.badges.${b.key}`)}
              </label>
            ))}
          </div>
        </div>
      </div>

      {activeFilterCount > 0 && (
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="text-[11px] text-muted-foreground">{t("ui.map.activeFilters", { count: activeFilterCount })}</span>
          <button type="button" onClick={clearFilters} className="text-[11px] font-bold text-muted-foreground hover:text-destructive">{t("ui.actions.clearFilters")}</button>
        </div>
      )}
    </aside>
  );

  return (
    <div className="overflow-x-hidden bg-background text-foreground">
      <section className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 lg:py-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.75fr)] lg:items-stretch">
          <div className="relative min-w-0 lg:h-full lg:min-h-0">
            <MyWisataExploreMap selectedStateId={selectedStateId} onSelectState={selectState} />

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
                    {selectedActivity.sponsorship && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-900">{t("ui.labels.sponsored")}</span>}
                  </div>
                  <h2 className="mt-2 truncate font-[family-name:var(--font-display)] text-xl font-bold text-foreground">{selectedActivity.name}</h2>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><MapPin size={12} />{selectedActivity.outlet.city} · {selectedActivity.outlet.state}</p>
                </div>
                <SaveToggleButton saved={saved} iconSize={17} aria-label={t(saved ? "ui.map.removeSavedPlace" : "ui.map.savePlace")} onClick={() => { if (!gate(CUSTOMER_CAPABILITY.ACCOUNT_MUTATION)) return; void toggleSaved(selectedActivity.id); }} className={`rounded-xl p-2 ${saved ? "bg-accent text-accent-foreground" : "bg-secondary text-primary"}`} />
                <button type="button" aria-label={t("ui.actions.cancel")} onClick={() => setSelectedPlaceId(null)} className="rounded-xl bg-secondary p-2 text-primary hover:bg-muted"><X size={17} /></button>
              </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
                  {selectedActivity.outlet.hours && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><span className="font-semibold text-foreground">{t("ui.labels.operatingHours")}:</span> {selectedActivity.outlet.hours}</span>}
                  <div className="flex items-center gap-1 text-xs font-bold text-foreground"><Star size={13} fill="var(--accent)" stroke="none" /> {selectedActivity.rating} <span className="font-normal text-muted-foreground">({t("ui.reviews.count", { count: selectedActivity.reviews })})</span><ReferencePrice amountMYR={Number(selectedActivity.price)} className="ml-2 font-[family-name:var(--font-mono)] text-sm text-primary" /></div>
                <div className="flex items-center gap-2"><Link href={`/customer/activity/${selectedActivity.id}`} onClick={() => onSponsoredClick?.(selectedActivity)} className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-white hover:bg-primary/90">{t("ui.map.viewDestination")} <ArrowRight size={13} /></Link><a href={`https://www.google.com/maps/search/?api=1&query=${selectedActivity.outlet.lat},${selectedActivity.outlet.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2.5 text-xs font-bold text-primary hover:bg-secondary"><Navigation size={13} /> {t("ui.actions.getDirections")}</a></div>
              </div>
            </article>
            </div>
            )}
          </div>

          <StateDetailPanel
            selectedStateId={selectedStateId}
            stateCounts={stateCounts}
            activities={activities}
            onSelectState={selectState}
            onSelectPlace={setSelectedPlaceId}
          />

        </div>

        <section id="explore-experiences" className="mt-5 flex min-h-0 flex-col overflow-hidden rounded-[1.5rem] border border-border bg-card p-3 shadow-[0_12px_28px_rgba(1,0,102,0.08)] sm:p-4 2xl:p-5">
            <div className="flex shrink-0 items-end justify-between gap-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-primary 2xl:text-[10px]">{t("ui.map.exploreMalaysia")}</p>
                <h2 className="mt-0.5 font-[family-name:var(--font-display)] text-lg font-bold tracking-tight sm:text-xl 2xl:text-2xl">{selectedStateId ? getState(selectedStateId)?.name : t("ui.search.allMalaysia")}</h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {selectedStateId && <button type="button" onClick={() => selectState(null)} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] font-bold text-muted-foreground transition hover:border-primary hover:text-primary"><X size={12} /> {t("ui.map.allStatesTerritories")}</button>}
                <span className="text-xs font-semibold text-muted-foreground">{t("ui.map.placesHere", { count: activities.length })}</span>
              </div>
            </div>

            <div className="mt-1 flex shrink-0 flex-wrap gap-1.5 2xl:mt-2" aria-label={t("ui.map.experienceFilters")}>
              <button type="button" onClick={clearFilters} className={`rounded-full border px-2 py-0.5 text-[10px] font-bold transition 2xl:px-3 2xl:py-1 2xl:text-[11px] ${activeFilterCount === 0 ? "border-primary bg-primary text-white" : "border-border text-muted-foreground hover:bg-secondary"}`}>{t("ui.search.allMalaysia")}</button>
              {Object.entries(CATEGORY_META).map(([slug]) => (
                <button
                  key={slug}
                  type="button"
                  onClick={() => toggleCategory(slug)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition 2xl:px-3 2xl:py-1 2xl:text-[11px] ${filters.categories.includes(slug) ? "border-primary bg-primary text-white" : "border-border text-muted-foreground hover:bg-secondary"}`}
                >
                  <CategoryIcon category={slug} size={14} strokeWidth={1.8} /> {t(`categories.${slug}`)}
                </button>
              ))}
              <button type="button" onClick={() => toggleBadge("hidden_gem")} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition 2xl:px-3 2xl:py-1 2xl:text-[11px] ${filters.hiddenGemOnly ? "border-primary bg-primary text-white" : "border-border text-muted-foreground hover:bg-secondary"}`}><CategoryIcon category="hidden_gem" size={12} strokeWidth={1.8} /> {t("ui.labels.hiddenGem")}</button>
              <button type="button" onClick={() => setFiltersOpen((open) => !open)} aria-expanded={filtersOpen} aria-controls="explore-category-filter" className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition 2xl:px-3 2xl:py-1 2xl:text-[11px] ${filtersOpen || activeFilterCount > 0 ? "border-primary/30 bg-secondary text-primary" : "border-border text-muted-foreground hover:bg-secondary"}`}>
                <SlidersHorizontal size={13} /> {t("ui.map.moreFilters")}{activeFilterCount > 0 ? ` · ${activeFilterCount}` : ""}
              </button>
            </div>

            {filtersOpen && categoryFilterPanel}

            <div className="mt-2 min-h-0 overflow-hidden 2xl:mt-3">
              {activities.length === 0 ? (
                <div className="rounded-2xl border border-border bg-secondary/50 p-8 text-center text-sm text-muted-foreground">{t("ui.states.loadingError")}</div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {activities.slice(0, 8).map((activity) => (
                    <button
                      key={activity.id}
                      type="button"
                      aria-label={t("ui.map.openPlace", { name: activity.name })}
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
                           {activity.sponsorship && <span className="mt-1 inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-900">{t("ui.labels.sponsored")}</span>}
                           <p className="mt-0.5 truncate text-[9px] text-muted-foreground 2xl:text-xs">{activity.outlet.city} · {t(`categories.${activity.categorySlug ?? "activity"}`)}{activity.outlet.hours ? ` · ${activity.outlet.hours}` : ""}</p>
                         </div>
                        <ReferencePrice amountMYR={Number(activity.price)} className="shrink-0 self-start font-[family-name:var(--font-mono)] text-[11px] font-bold text-primary 2xl:text-sm" />
                       </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
        </section>
      </section>
    </div>
  );
}
