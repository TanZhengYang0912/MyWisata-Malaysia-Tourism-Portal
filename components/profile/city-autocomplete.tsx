"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { CitySuggestion } from "@/lib/location/city-types";

type CityAutocompleteProps = {
  value: string;
  cityId: string | null;
  countryCode: string | null;
  onChange: (value: string, cityId: string | null) => void;
  error?: boolean;
  disabled?: boolean;
};

export function CityAutocomplete({ value, cityId, countryCode, onChange, error = false, disabled = false }: CityAutocompleteProps) {
  const { t: tCustomer } = useTranslation("customer");
  const listboxId = useId();
  const requestGeneration = useRef(0);
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchState, setSearchState] = useState<"idle" | "done" | "error">("idle");
  const searchEligible = !cityId && Boolean(countryCode) && value.trim().length >= 2;
  const visibleSuggestions = searchEligible ? suggestions : [];
  const visibleLoading = searchEligible && loading;

  useEffect(() => {
    const query = value.trim();
    const generation = ++requestGeneration.current;
    if (cityId || !countryCode || query.length < 2) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setSearchState("idle");
      try {
        const response = await fetch(`/api/locations/cities?q=${encodeURIComponent(query)}&country=${encodeURIComponent(countryCode)}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("city_search_unavailable");
        const body = await response.json() as { data?: CitySuggestion[] };
        if (generation !== requestGeneration.current) return;
        setSuggestions((body.data ?? []).slice(0, 5));
        setActiveIndex(0);
        setOpen(true);
        setSearchState("done");
      } catch {
        if (controller.signal.aborted || generation !== requestGeneration.current) return;
        setSuggestions([]);
        setSearchState("error");
      } finally {
        if (generation === requestGeneration.current) setLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [cityId, countryCode, value]);

  function choose(suggestion: CitySuggestion) {
    onChange(suggestion.name, suggestion.id);
    setSuggestions([]);
    setOpen(false);
    setSearchState("idle");
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && visibleSuggestions.length) {
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => Math.min(index + 1, visibleSuggestions.length - 1));
    } else if (event.key === "ArrowUp" && visibleSuggestions.length) {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter" && open && visibleSuggestions[activeIndex]) {
      event.preventDefault();
      choose(visibleSuggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <div className="relative">
        <input
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open && visibleSuggestions.length > 0}
          aria-controls={listboxId}
          aria-activedescendant={open && visibleSuggestions[activeIndex] ? `${listboxId}-${visibleSuggestions[activeIndex].id}` : undefined}
          value={value}
          disabled={disabled}
          onChange={(event) => { const value = event.target.value; onChange(value, null); setSuggestions([]); setSearchState("idle"); setOpen(true); }}
          onFocus={() => { if (visibleSuggestions.length) setOpen(true); }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={handleKeyDown}
          placeholder={tCustomer("ui.profileWizard.cityPlaceholder")}
          className="w-full rounded-xl border bg-background px-3 py-2.5 pr-9 text-sm text-foreground outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
          style={{ borderColor: error ? "var(--destructive)" : "var(--border)" }}
        />
        {visibleLoading ? <Loader2 aria-hidden size={16} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" /> : <MapPin aria-hidden size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />}
      </div>

      {open && visibleSuggestions.length > 0 && (
        <div id={listboxId} role="listbox" className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
          <div className="p-1">
            {visibleSuggestions.map((suggestion, index) => (
              <button
                id={`${listboxId}-${suggestion.id}`}
                key={suggestion.id}
                type="button"
                role="option"
                aria-selected={suggestion.id === cityId}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(suggestion)}
                className={`block w-full rounded-lg px-3 py-2 text-left ${index === activeIndex ? "bg-secondary" : "hover:bg-secondary/70"}`}
              >
                <span className="block text-sm font-medium text-foreground">{suggestion.name}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{suggestion.countryCode}</span>
              </button>
            ))}
          </div>
          <a
            href="https://www.geonames.org/"
            target="_blank"
            rel="noreferrer"
            className="block border-t border-border px-3 py-2 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {tCustomer("ui.profileLocation.attribution")}
          </a>
        </div>
      )}

      {searchEligible && searchState === "done" && visibleSuggestions.length === 0 && (
        <p className="mt-1 text-xs text-muted-foreground">{tCustomer("ui.profileLocation.cityNoResults")}</p>
      )}
      {searchState === "error" && (
        <p className="mt-1 text-xs text-muted-foreground">{tCustomer("ui.profileLocation.cityUnavailable")}</p>
      )}
    </div>
  );
}
