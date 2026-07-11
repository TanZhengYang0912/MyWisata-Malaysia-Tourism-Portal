"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Sparkles, ChevronRight, SlidersHorizontal } from "lucide-react";
import { ActivityCard } from "@/components/customer/activity-card";
import { CATEGORIES, STATES_MY, searchActivities } from "@/backend/domains/catalogue";
import { EmptyState } from "@/components/shared/empty-state";
import type { ComputedActivity } from "@/backend/core/types";

export default function ExplorePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [state, setState] = useState("All Malaysia");
  const [category, setCategory] = useState<string | null>(null);
  const [activities, setActivities] = useState<ComputedActivity[] | null>(null);

  useEffect(() => {
    setActivities(searchActivities({ state, category }));
  }, [state, category]);

  const picked = useMemo(() => (activities ?? []).slice(0, 4), [activities]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    router.push(`/customer/search?q=${encodeURIComponent(query)}`);
  }

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden" style={{ minHeight: 420 }}>
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(135deg, #24313AE0 0%, #0F5D4A99 40%, #087E8B55 100%)" }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://images.unsplash.com/photo-1742391355474-e765ee5f510e?w=1600&h=700&fit=crop&auto=format"
          alt="Malaysia tourism"
          className="absolute inset-0 w-full h-full object-cover -z-10"
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 py-16 sm:py-20">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold mb-5 bg-accent/20 text-accent border border-accent/50">
              <Sparkles size={11} /> 16 Malaysian States, 100+ Local Experiences
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold text-white leading-tight mb-4 font-[family-name:var(--font-display)]">
              Discover Malaysia
              <br />
              Like a Local
            </h1>
            <p className="text-base sm:text-lg text-white/80 mb-8 leading-relaxed">
              From rainforest hikes in Sabah to street food trails in Penang — find, book and share
              authentic Malaysian experiences.
            </p>

            <form onSubmit={submitSearch} className="flex gap-2 p-2 rounded-2xl max-w-xl bg-white/95 shadow-xl">
              <div className="flex-1 flex items-center gap-2 px-3">
                <Search size={16} className="text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="flex-1 text-sm bg-transparent outline-none placeholder:text-gray-400 text-foreground"
                  placeholder="Search experiences, places or vendors…"
                />
              </div>
              <button type="submit" className="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-primary">
                Search
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* State selector */}
      <section className="border-b border-border sticky top-16 z-30 bg-background/97 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 overflow-x-auto py-3 hide-scrollbar">
            {STATES_MY.map((st) => (
              <button
                key={st}
                onClick={() => setState(st)}
                className="shrink-0 px-4 py-2 rounded-full text-xs font-semibold border transition-all whitespace-nowrap"
                style={{
                  borderColor: state === st ? "var(--primary)" : "transparent",
                  backgroundColor: state === st ? "var(--primary)" : "transparent",
                  color: state === st ? "white" : "var(--muted-foreground)",
                }}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-6">
          <h2 className="text-xl sm:text-2xl font-bold text-foreground font-[family-name:var(--font-display)]">Browse by Category</h2>
          <p className="text-sm mt-1 text-muted-foreground">What kind of experience are you looking for?</p>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-3">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategory(category === cat.id ? null : cat.id)}
              className="flex flex-col items-center gap-2 p-3 rounded-2xl transition-all hover:-translate-y-0.5 border-2"
              style={{
                backgroundColor: category === cat.id ? "color-mix(in srgb, var(--primary) 12%, transparent)" : "var(--card)",
                borderColor: category === cat.id ? "var(--primary)" : "transparent",
                boxShadow: "0 1px 8px rgba(36,49,58,0.06)",
              }}
            >
              <span className="text-2xl">{cat.icon}</span>
              <p className="text-[10px] font-bold text-center leading-tight" style={{ color: category === cat.id ? "var(--primary)" : "var(--foreground)" }}>
                {cat.label}
              </p>
            </button>
          ))}
        </div>
      </section>

      {/* Picked for you (honest label: top-rated, no AI scoring yet) */}
      <section className="py-10 bg-primary/[0.03]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-end justify-between mb-6 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles size={16} className="text-accent" />
                <span className="text-xs font-bold uppercase tracking-wider text-accent">Top Picks</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-bold text-foreground font-[family-name:var(--font-display)]">Popular Right Now</h2>
            </div>
            <Link href="/customer/search" className="flex items-center gap-1 text-sm font-semibold text-primary shrink-0">
              View all <ChevronRight size={14} />
            </Link>
          </div>
          {activities === null ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : picked.length === 0 ? (
            <EmptyState title="No experiences match yet" description="Try a different state or category." />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5">
              {picked.map((a) => (
                <ActivityCard key={a.id} activity={a} />
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
            <SlidersHorizontal size={12} /> More Filters
          </Link>
        </div>
        {activities === null ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : activities.length === 0 ? (
          <EmptyState title="No experiences found" description="Try clearing your state or category filter." />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5">
            {activities.map((a) => (
              <ActivityCard key={a.id} activity={a} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
