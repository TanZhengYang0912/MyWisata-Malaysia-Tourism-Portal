"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Search as SearchIcon, MapPin, Building2, Ticket, Loader2 } from "lucide-react";
import type { GlobalSearchResult } from "@/backend/domains/search";

export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GlobalSearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(null);
      return;
    }

    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
        }
      } catch (e) {
        console.error("Search failed", e);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const hasResults = results && (results.destinations.length > 0 || results.experiences.length > 0 || results.vendors.length > 0);

  return (
    <div className="relative w-full max-w-lg" ref={containerRef}>
      <div className="flex items-center gap-2 rounded-full bg-slate-100/80 px-4 py-2 ring-1 ring-slate-200 focus-within:bg-white focus-within:ring-2 focus-within:ring-primary/20 transition-all">
        <SearchIcon size={16} className="text-slate-400 shrink-0" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder="Search destinations, experiences, or partners..."
          className="w-full bg-transparent text-sm font-medium outline-none placeholder:text-slate-500"
        />
        {isLoading && <Loader2 size={14} className="animate-spin text-primary shrink-0" />}
      </div>

      {isOpen && query.trim().length >= 2 && (
        <div className="absolute top-full left-0 right-0 mt-2 rounded-2xl bg-white shadow-xl ring-1 ring-black/5 overflow-hidden z-50">
          {!isLoading && !hasResults && (
            <div className="p-6 text-center text-sm text-slate-500">
              {/* eslint-disable-next-line react/no-unescaped-entities */}
              No results found for "{query}".
            </div>
          )}

          {hasResults && (
            <div className="max-h-[70vh] overflow-y-auto overscroll-contain py-2">
              {/* Destinations */}
              {results.destinations.length > 0 && (
                <div className="mb-4">
                  <div className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Destinations
                  </div>
                  {results.destinations.map((dest) => (
                    <Link
                      key={dest}
                      href={`/customer/destination/${dest.toLowerCase().replace(/\s+/g, '-')}`}
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 transition-colors"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                        <MapPin size={16} />
                      </span>
                      <span className="font-semibold text-sm text-slate-700">{dest}</span>
                    </Link>
                  ))}
                </div>
              )}

              {/* Experiences */}
              {results.experiences.length > 0 && (
                <div className="mb-4">
                  <div className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Experiences
                  </div>
                  {results.experiences.map((exp) => (
                    <Link
                      key={exp.id}
                      href={`/customer/activity/${exp.id}`}
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 transition-colors"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                        <Ticket size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-sm text-slate-700">{exp.name}</p>
                        <p className="truncate text-xs text-slate-500">{exp.outlet?.city || "Malaysia"}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* Vendors */}
              {results.vendors.length > 0 && (
                <div>
                  <div className="px-4 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Local Partners
                  </div>
                  {results.vendors.map((vendor) => (
                    <Link
                      key={vendor.id}
                      href={`/customer/vendor/${vendor.id}`}
                      onClick={() => setIsOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 hover:bg-slate-50 transition-colors"
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 shrink-0">
                        <Building2 size={16} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-sm text-slate-700">{vendor.name}</p>
                        <p className="truncate text-xs text-slate-500">Verified Partner</p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
