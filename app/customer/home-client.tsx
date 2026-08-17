"use client";

import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronLeft, ChevronRight, MapPinned, Search, Sparkles, X } from "lucide-react";
import { ActivityCard } from "@/components/customer/activity-card";
import { CategoryIcon } from "@/components/customer/category-icon";
import { MalaysiaDestinationRail } from "@/components/customer/malaysia-destination-rail";
import { PromotionSpotlight } from "@/components/customer/promotion-spotlight";
import { CATEGORIES, searchActivities } from "@/backend/domains/catalogue";
import { EmptyState } from "@/components/shared/empty-state";
import { MALAYSIA_DESTINATIONS } from "@/lib/customer/malaysia-destinations";
import type { ComputedActivity } from "@/backend/core/types";
import { getDiscoverySearchFilter } from "@/lib/customer/discovery-categories";

const STATE_REGIONS = [
  { label: "Northern Malaysia", states: ["Kedah", "Perlis", "Penang", "Perak"] },
  { label: "Central Malaysia", states: ["Selangor", "Kuala Lumpur", "Putrajaya"] },
  { label: "Southern Malaysia", states: ["Johor", "Melaka", "Negeri Sembilan"] },
  { label: "East Coast", states: ["Kelantan", "Pahang", "Terengganu"] },
  { label: "Borneo Malaysia", states: ["Sabah", "Sarawak", "Labuan"] },
] as const;

const EXPERIENCES_PER_PAGE = 8;
type PageItem = number | "ellipsis";

function getPageItems(currentPage: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);

  const pages = new Set([1, totalPages, currentPage, currentPage - 1, currentPage + 1]);
  const orderedPages = [...pages].filter((page) => page > 0 && page <= totalPages).sort((a, b) => a - b);
  const items: PageItem[] = [];

  orderedPages.forEach((page, index) => {
    if (index > 0 && page - orderedPages[index - 1] > 1) items.push("ellipsis");
    items.push(page);
  });

  return items;
}

export function HomeClient({ initialActivities, initialRecommended }: { initialActivities: ComputedActivity[]; initialRecommended: ComputedActivity[] }) {
  const { t: tCustomer } = useTranslation("customer");
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [state, setState] = useState("All Malaysia");
  const [category, setCategory] = useState<string | null>(null);
  const [stateMenuOpen, setStateMenuOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [activities, setActivities] = useState<ComputedActivity[] | null>(initialActivities);

  // Skip the very first run: the default view (state/category unset) is
  // already server-rendered via initialActivities. Only refetch once the
  // user actually changes a filter.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    searchActivities({ state, ...getDiscoverySearchFilter(category) }).then((nextActivities) => {
      setActivities(nextActivities);
      setCurrentPage(1);
    });
  }, [state, category]);

  // "Recommended For You" is the personalised feed — stable, independent of the
  // filters applied to the grid below. aiTag carries each card's match reason.
  const picked = initialRecommended;
  const personalised = picked.some((a) => Boolean(a.aiTag));
  const totalPages = Math.max(1, Math.ceil((activities?.length ?? 0) / EXPERIENCES_PER_PAGE));
  const pageStart = (currentPage - 1) * EXPERIENCES_PER_PAGE;
  const visibleExperiences = useMemo(
    () => (activities ?? []).slice(pageStart, pageStart + EXPERIENCES_PER_PAGE),
    [activities, pageStart],
  );
  const pageItems = useMemo(() => getPageItems(currentPage, totalPages), [currentPage, totalPages]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/customer/search?q=${encodeURIComponent(query)}`);
  }

  function exploreState(destinationState: string) {
    setState(destinationState);
    setCurrentPage(1);
    window.setTimeout(() => document.getElementById("all-experiences")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function selectCategory(nextCategory: string) {
    setCategory(category === nextCategory ? null : nextCategory);
    setCurrentPage(1);
  }

  return (
    <div>
      <MalaysiaDestinationRail
        query={query}
        onQueryChange={setQuery}
        onSearch={submitSearch}
        onExploreState={exploreState}
      />

      {/* State selector */}
      <section className="sticky top-16 z-30 border-b border-border bg-background/97 backdrop-blur-md">
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6">
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <MapPinned size={15} className="shrink-0 text-primary" />
              <span className="hidden text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground sm:inline">Explore by state</span>
            </div>
            <button type="button" onClick={() => setStateMenuOpen((open) => !open)} aria-expanded={stateMenuOpen} className="inline-flex min-w-0 items-center gap-2 rounded-full border border-primary/15 bg-primary/[0.05] px-4 py-2 text-xs font-bold text-primary transition hover:bg-primary/[0.1]">
              <span className="truncate">{state}</span>
              <ChevronDown size={14} className={`shrink-0 transition-transform ${stateMenuOpen ? "rotate-180" : ""}`} />
            </button>
            <span className="hidden text-xs text-muted-foreground md:inline">{MALAYSIA_DESTINATIONS.length} destinations across Malaysia</span>
          </div>

          {stateMenuOpen && (
            <div className="absolute inset-x-4 top-full z-50 rounded-3xl border border-border bg-card p-4 shadow-2xl sm:inset-x-6 sm:p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold text-foreground">Choose your route</p>
                  <p className="mt-1 text-xs text-muted-foreground">Jump into a region without scanning every state.</p>
                </div>
                <button type="button" onClick={() => setStateMenuOpen(false)} className="rounded-full p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground" aria-label="Close state menu"><X size={16} /></button>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <button type="button" onClick={() => { exploreState("All Malaysia"); setStateMenuOpen(false); }} className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-bold transition ${state === "All Malaysia" ? "border-primary bg-primary text-white" : "border-border bg-background text-foreground hover:border-primary/40"}`}>
                  <span>All Malaysia</span>
                  {state === "All Malaysia" && <Check size={16} />}
                </button>
                {STATE_REGIONS.map((region) => (
                  <div key={region.label}>
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{region.label}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {region.states.map((st) => (
                        <button key={st} type="button" onClick={() => { exploreState(st); setStateMenuOpen(false); }} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${state === st ? "border-primary bg-primary text-white" : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-primary"}`}>
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Categories */}
      <section id="all-experiences" className="max-w-7xl mx-auto scroll-mt-32 px-4 sm:px-6 py-10">
        <div className="mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground font-[family-name:var(--font-display)]">Browse by Category</h2>
          <p className="text-sm mt-1 text-muted-foreground">What kind of experience are you looking for?</p>
        </div>
        <div className="grid items-stretch grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => selectCategory(cat.id)}
              className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-2xl border-2 p-3 text-center transition-all hover:-translate-y-0.5"
              style={{
                backgroundColor: category === cat.id ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "var(--card)",
                borderColor: category === cat.id ? "var(--primary)" : "transparent",
                boxShadow: "0 1px 8px rgba(36,49,58,0.06)",
              }}
            >
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${category === cat.id ? "bg-primary text-white" : "bg-secondary text-primary"}`}>
                <CategoryIcon category={cat.id} size={25} strokeWidth={1.8} />
              </span>
              <p className="text-[10px] font-bold text-center leading-tight" style={{ color: category === cat.id ? "var(--primary)" : "var(--foreground)" }}>
                {cat.label}
              </p>
            </button>
          ))}
        </div>
      </section>

      <PromotionSpotlight activities={activities ?? []} />

      {/* Recommended For You (§11.3) — personalised feed with match-reason tags,
          or trending fallback for users who haven't set preferences yet. */}
      <section className="py-10 bg-primary/[0.03]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-end justify-between mb-6 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={16} className="text-accent" />
                <span className="text-travel-blue text-xs font-bold uppercase tracking-wider">{personalised ? "For You" : "Top Picks"}</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground font-[family-name:var(--font-display)]">{personalised ? "Recommended For You" : "Popular Right Now"}</h2>
            </div>
            <Link href={personalised ? "/customer/preferences" : "/customer/search"} className="flex items-center gap-1 text-sm font-semibold text-primary shrink-0">
              {personalised ? "Tune preferences" : "View all"} <ChevronRight size={14} />
            </Link>
          </div>
          {picked.length === 0 ? (
            <EmptyState title="No experiences match yet" description="Try a different state or category." />
          ) : (
            <div className="grid items-stretch grid-cols-2 gap-4 sm:gap-5 md:grid-cols-4">
              {picked.map((a) => (
                <ActivityCard key={a.id} activity={a} returnTo="/customer" />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* All listings */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex items-end justify-between mb-6 gap-4">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold text-foreground font-[family-name:var(--font-display)]">
              {state === "All Malaysia" ? "All Experiences" : `Experiences in ${state}`}
            </h2>
            <p className="text-sm mt-0.5 text-muted-foreground">{activities?.length ?? 0} results</p>
          </div>
          <Link href="/customer/search" className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-border text-muted-foreground shrink-0">
            <Search size={12} /> Search &amp; Filter
          </Link>
        </div>
        {activities === null ? (
          <div className="text-sm text-muted-foreground">{tCustomer("ui.states.loading")}</div>
        ) : activities.length === 0 ? (
          <EmptyState title="No experiences found" description="Try clearing your state or category filter." />
        ) : (
          <div className="grid items-stretch grid-cols-2 gap-4 sm:gap-5 md:grid-cols-4">
            {visibleExperiences.map((a) => (
              <ActivityCard key={a.id} activity={a} returnTo="/customer" />
            ))}
          </div>
        )}

        {activities !== null && activities.length > 0 && totalPages > 1 && (
          <nav aria-label="Experience pages" className="mt-8 flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Showing <span className="font-bold text-foreground">{pageStart + 1}-{Math.min(pageStart + EXPERIENCES_PER_PAGE, activities.length)}</span> of <span className="font-bold text-foreground">{activities.length}</span> experiences
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={currentPage === 1}
                aria-label="Previous page"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronLeft size={16} />
              </button>
              {pageItems.map((item, index) => item === "ellipsis" ? (
                <span key={`ellipsis-${index}`} className="flex h-9 w-6 items-center justify-center text-xs text-muted-foreground">…</span>
              ) : (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCurrentPage(item)}
                  aria-current={currentPage === item ? "page" : undefined}
                  className={`h-9 min-w-9 rounded-xl px-2 text-xs font-bold transition ${currentPage === item ? "bg-primary text-white" : "border border-border text-muted-foreground hover:border-primary/30 hover:text-primary"}`}
                >
                  {item}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                disabled={currentPage === totalPages}
                aria-label="Next page"
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border text-muted-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </nav>
        )}
      </section>
    </div>
  );
}
