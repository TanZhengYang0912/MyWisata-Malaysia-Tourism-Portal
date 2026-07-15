"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, MapPin, Search as SearchIcon } from "lucide-react";
import { ActivityCard } from "@/components/customer/activity-card";
import { EmptyState } from "@/components/shared/empty-state";
import { CATEGORIES, STATES_MY, searchActivities, type SearchFilters } from "@/backend/domains/catalogue";
import type { ComputedActivity, VendorSummary } from "@/backend/core/types";

type PlaceSuggestion = { display_name: string; short: string };

async function fetchPlaceSuggestions(query: string): Promise<PlaceSuggestion[]> {
  if (query.trim().length < 2) return [];
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&countrycodes=my&format=json&limit=6&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
    if (!res.ok) return [];
    const data = await res.json() as Array<{ display_name: string; address?: { city?: string; town?: string; village?: string; state?: string } }>;
    return data.map((item) => {
      const addr = item.address ?? {};
      const locality = addr.city ?? addr.town ?? addr.village ?? '';
      const state = addr.state ?? '';
      const short = [locality, state].filter(Boolean).join(', ') || item.display_name.split(',').slice(0, 2).join(',').trim();
      return { display_name: item.display_name, short };
    });
  } catch {
    return [];
  }
}

const PRICE_OPTIONS = [
  { label: "Any price", value: undefined },
  { label: "Under RM 50", value: 50 },
  { label: "Under RM 100", value: 100 },
  { label: "Under RM 200", value: 200 },
];

const RESULTS_PER_PAGE = 8;
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

export function SearchClient({
  initialQuery,
  initialResults,
  initialVendors,
}: {
  initialQuery: string;
  initialResults: ComputedActivity[];
  initialVendors: VendorSummary[];
}) {
  const [q, setQ] = useState(initialQuery);
  const [category, setCategory] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [priceMax, setPriceMax] = useState<number | undefined>(undefined);
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState<SearchFilters["sort"]>("recommended");
  const [currentPage, setCurrentPage] = useState(1);
  const [results, setResults] = useState<ComputedActivity[] | null>(initialResults);
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Skip the very first run: the initial ?q= results are already
  // server-rendered via initialResults. Only refetch once a filter changes.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    searchActivities({ q, category, state, vendorId, priceMax, openOnly, sort }).then((nextResults) => {
      setResults(nextResults);
      setCurrentPage(1);
    });
  }, [q, category, state, vendorId, priceMax, openOnly, sort]);

  // Debounced place autocomplete
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(() => {
      fetchPlaceSuggestions(q).then(setSuggestions);
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q]);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const totalPages = Math.max(1, Math.ceil((results?.length ?? 0) / RESULTS_PER_PAGE));
  const pageStart = (currentPage - 1) * RESULTS_PER_PAGE;
  const visibleResults = (results ?? []).slice(pageStart, pageStart + RESULTS_PER_PAGE);
  const pageItems = getPageItems(currentPage, totalPages);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-4 font-[family-name:var(--font-display)]">Search Experiences</h1>

      <div className="relative mb-4 max-w-xl" ref={suggestionsRef}>
        <div className="flex items-center gap-2 p-2 rounded-xl border border-border bg-card">
          <SearchIcon size={16} className="text-muted-foreground ml-2 shrink-0" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setShowSuggestions(true); }}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
            placeholder="Search experiences, places or vendors…"
            className="flex-1 text-sm bg-transparent outline-none text-foreground"
          />
        </div>
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 mt-1 w-full rounded-xl border border-border bg-card shadow-lg overflow-hidden">
            {suggestions.map((s, i) => (
              <button
                key={i}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); setQ(s.short); setShowSuggestions(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-accent transition-colors"
              >
                <MapPin size={13} className="text-muted-foreground shrink-0" />
                <span className="font-medium text-foreground truncate">{s.short}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <select
          value={category ?? ""}
          onChange={(e) => setCategory(e.target.value || null)}
          className="text-xs font-semibold px-3 py-2 rounded-lg border border-border text-foreground bg-input-background outline-none"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>

        <select
          value={state ?? ""}
          onChange={(e) => setState(e.target.value || null)}
          className="text-xs font-semibold px-3 py-2 rounded-lg border border-border text-foreground bg-input-background outline-none"
        >
          <option value="">All states</option>
          {STATES_MY.filter((s) => s !== "All Malaysia").map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <select
          value={vendorId ?? ""}
          onChange={(e) => setVendorId(e.target.value || null)}
          className="text-xs font-semibold px-3 py-2 rounded-lg border border-border text-foreground bg-input-background outline-none"
        >
          <option value="">All vendors</option>
          {initialVendors.map((vendor) => (
            <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
          ))}
        </select>

        <select
          value={priceMax ?? ""}
          onChange={(e) => setPriceMax(e.target.value ? Number(e.target.value) : undefined)}
          className="text-xs font-semibold px-3 py-2 rounded-lg border border-border text-foreground bg-input-background outline-none"
        >
          {PRICE_OPTIONS.map((p) => (
            <option key={p.label} value={p.value ?? ""}>{p.label}</option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-border text-foreground cursor-pointer">
          <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
          Open now
        </label>

        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SearchFilters["sort"])}
          className="text-xs font-semibold px-3 py-2 rounded-lg border border-border text-foreground bg-input-background outline-none ml-auto"
        >
          <option value="recommended">Sort: Recommended</option>
          <option value="price_asc">Price: Low to High</option>
          <option value="rating_desc">Highest Rated</option>
        </select>
      </div>

      {results === null ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : results.length === 0 ? (
        <EmptyState title="No experiences match your filters" description="Try widening your search — clear a filter or use a different keyword." />
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            Showing <span className="font-bold text-foreground">{pageStart + 1}-{Math.min(pageStart + RESULTS_PER_PAGE, results.length)}</span> of <span className="font-bold text-foreground">{results.length}</span> results
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5">
            {visibleResults.map((a) => (
              <ActivityCard key={a.id} activity={a} />
            ))}
          </div>
          {totalPages > 1 && (
            <nav aria-label="Search result pages" className="mt-8 flex flex-col gap-4 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground">Page <span className="font-bold text-foreground">{currentPage}</span> of <span className="font-bold text-foreground">{totalPages}</span></p>
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
        </>
      )}
    </div>
  );
}
