"use client";

import { useEffect, useRef, useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { ActivityCard } from "@/components/customer/activity-card";
import { EmptyState } from "@/components/shared/empty-state";
import { CATEGORIES, STATES_MY, searchActivities, type SearchFilters } from "@/backend/domains/catalogue";
import type { ComputedActivity } from "@/backend/core/types";

const PRICE_OPTIONS = [
  { label: "Any price", value: undefined },
  { label: "Under RM 50", value: 50 },
  { label: "Under RM 100", value: 100 },
  { label: "Under RM 200", value: 200 },
];

export function SearchClient({
  initialQuery,
  initialResults,
}: {
  initialQuery: string;
  initialResults: ComputedActivity[];
}) {
  const [q, setQ] = useState(initialQuery);
  const [category, setCategory] = useState<string | null>(null);
  const [state, setState] = useState<string | null>(null);
  const [priceMax, setPriceMax] = useState<number | undefined>(undefined);
  const [openOnly, setOpenOnly] = useState(false);
  const [sort, setSort] = useState<SearchFilters["sort"]>("recommended");
  const [results, setResults] = useState<ComputedActivity[] | null>(initialResults);

  // Skip the very first run: the initial ?q= results are already
  // server-rendered via initialResults. Only refetch once a filter changes.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    searchActivities({ q, category, state, priceMax, openOnly, sort }).then(setResults);
  }, [q, category, state, priceMax, openOnly, sort]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <h1 className="text-2xl font-bold text-foreground mb-4 font-[family-name:var(--font-display)]">Search Experiences</h1>

      <div className="flex items-center gap-2 p-2 rounded-xl border border-border bg-card mb-4 max-w-xl">
        <SearchIcon size={16} className="text-muted-foreground ml-2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search experiences, places or vendors…"
          className="flex-1 text-sm bg-transparent outline-none text-foreground"
        />
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
          <p className="text-sm text-muted-foreground mb-4">{results.length} results</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5">
            {results.map((a) => (
              <ActivityCard key={a.id} activity={a} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
