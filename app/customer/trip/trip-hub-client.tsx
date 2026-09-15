"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Trip } from "@/backend/domains/trips";
import { ArrowUpRight, Calendar, Filter, Navigation, Plus, Search, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { createTripAction, deleteTripAction } from "./actions";
import { CustomerPageShell, CustomerPageTitle } from "@/components/customer/customer-page-shell";
import { filterTrips, type TripFilters, type TripFilterStatus, type TripSort } from "@/lib/customer/trip-filters";
import { getMalaysiaDateRangeDefaults } from "@/lib/datetime/date-input";
import { useAppDialog } from "@/components/providers/app-dialog";
import { DEFAULT_LOCALE, matchAcceptedLocale } from "@/lib/i18n/locale";
import { isMeaningfulTripIdea, nextDefaultTripName, tripDuration } from "@/lib/customer/trip-name";

const DEFAULT_TRIP_FILTERS: TripFilters = { query: "", status: "all", from: "", to: "", sort: "newest" };
const TRIP_STATUS_OPTIONS: TripFilterStatus[] = ["all", "upcoming", "past", "unscheduled"];

export function TripHubClient({ initialTrips, initialTripNameSequence }: { initialTrips: Trip[]; initialTripNameSequence: number }) {
  const { t, i18n } = useTranslation("customer");
  const { confirm } = useAppDialog();
  const [trips, setTrips] = useState<Trip[]>(initialTrips);
  const [isCreating, setIsCreating] = useState(false);
  const initialDateRange = useMemo(() => getMalaysiaDateRangeDefaults(), []);
  const initialDefaultTripName = useMemo(
    () => nextDefaultTripName(initialTrips, initialTripNameSequence),
    [initialTripNameSequence, initialTrips],
  );
  const [defaultTripName, setDefaultTripName] = useState(initialDefaultTripName);
  const [tripName, setTripName] = useState(initialDefaultTripName);
  const [createStartDate, setCreateStartDate] = useState(initialDateRange.from);
  const [createEndDate, setCreateEndDate] = useState(initialDateRange.to);
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
  const [nameSuggestionsLoading, setNameSuggestionsLoading] = useState(false);
  const [nameSuggestionsFallback, setNameSuggestionsFallback] = useState(false);
  const [nameSuggestionError, setNameSuggestionError] = useState<"phone" | "generic" | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [tripFilters, setTripFilters] = useState<TripFilters>(DEFAULT_TRIP_FILTERS);
  const today = useMemo(() => getMalaysiaDateRangeDefaults().from, []);
  const visibleTrips = useMemo(() => filterTrips(trips, tripFilters, today), [today, tripFilters, trips]);
  const hasActiveFilters = Boolean(tripFilters.query.trim() || tripFilters.status !== "all" || tripFilters.from || tripFilters.to);
  const activeFilterCount = [Boolean(tripFilters.query.trim()), tripFilters.status !== "all", Boolean(tripFilters.from), Boolean(tripFilters.to)].filter(Boolean).length;

  const updateTripFilter = <K extends keyof TripFilters>(key: K, value: TripFilters[K]) => {
    setTripFilters((current) => ({ ...current, [key]: value }));
  };

  const primeDateRange = () => {
    const defaults = getMalaysiaDateRangeDefaults();
    setTripFilters((current) => ({ ...current, from: current.from || defaults.from, to: current.to || defaults.to }));
  };

  const clearFilters = () => setTripFilters(DEFAULT_TRIP_FILTERS);

  const openCreateForm = () => {
    const nextName = nextDefaultTripName(trips, initialTripNameSequence);
    const dates = getMalaysiaDateRangeDefaults();
    setDefaultTripName(nextName);
    setTripName(nextName);
    setCreateStartDate(dates.from);
    setCreateEndDate(dates.to);
    setNameSuggestions([]);
    setNameSuggestionsFallback(false);
    setNameSuggestionError(null);
    setIsCreating(true);
  };

  const closeCreateForm = () => {
    setIsCreating(false);
    setNameSuggestions([]);
    setNameSuggestionsFallback(false);
    setNameSuggestionError(null);
  };

  useEffect(() => {
    if (!isCreating) return;
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [defaultTripName, isCreating]);

  const canRequestNameSuggestions = useMemo(() => {
    if (!isMeaningfulTripIdea(tripName, defaultTripName)) return false;
    try {
      tripDuration(createStartDate, createEndDate);
      return true;
    } catch {
      return false;
    }
  }, [createEndDate, createStartDate, defaultTripName, tripName]);

  const requestNameSuggestions = async () => {
    if (!canRequestNameSuggestions || nameSuggestionsLoading) return;
    setNameSuggestionsLoading(true);
    setNameSuggestionError(null);
    setNameSuggestionsFallback(false);
    try {
      const language = i18n.resolvedLanguage || i18n.language;
      const locale = matchAcceptedLocale(language) ?? DEFAULT_LOCALE;
      const response = await fetch("/api/trips/name-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idea: tripName.trim(),
          startDate: createStartDate,
          endDate: createEndDate,
          locale,
        }),
      });
      const body = await response.json() as {
        data: { suggestions: string[]; aiAvailable: boolean } | null;
        error: { code?: string } | null;
      };
      if (!response.ok || !body.data?.suggestions.length) {
        setNameSuggestionError(body.error?.code === "PHONE_VERIFICATION_REQUIRED" ? "phone" : "generic");
        return;
      }
      setNameSuggestions(body.data.suggestions);
      setTripName(body.data.suggestions[0]);
      setNameSuggestionsFallback(!body.data.aiAvailable);
    } catch {
      setNameSuggestionError("generic");
    } finally {
      setNameSuggestionsLoading(false);
    }
  };

  const handleDelete = async (tripId: string) => {
    if (!(await confirm(t("ui.trip.confirmDelete")))) return;
    setTrips(trips.filter((t) => t.id !== tripId));
    await deleteTripAction(tripId);
  };

  return (
    <>
      <CustomerPageTitle
        eyebrow={t("accountGroups.myTravel")}
        title={t("ui.trip.title")}
        description={t("ui.trip.description")}
        icon={<Navigation size={14} />}
        actions={
          <button
            onClick={openCreateForm}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <Plus size={16} /> {t("ui.trip.create")}
          </button>
        }
      />

      <CustomerPageShell wide className="pt-0 sm:pt-0">
        {isCreating && (
          <form action={createTripAction} className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-[0_8px_24px_rgba(1,0,102,0.06)] sm:p-6">
            <h2 className="mb-4 text-lg font-bold text-foreground">{t("ui.trip.newTitle")}</h2>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("ui.trip.name")}</label>
                <input ref={nameInputRef} name="name" required maxLength={60} value={tripName} onChange={(event) => { setTripName(event.target.value); setNameSuggestions([]); setNameSuggestionsFallback(false); setNameSuggestionError(null); }} placeholder={t("ui.trip.namePlaceholder")} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
                <button type="button" onClick={requestNameSuggestions} disabled={!canRequestNameSuggestions || nameSuggestionsLoading} className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-secondary/50 px-3 py-1.5 text-xs font-bold text-primary transition hover:border-primary/40 hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-45">
                  <Sparkles size={13} aria-hidden="true" />
                  {nameSuggestionsLoading ? t("ui.trip.aiNameLoading") : t("ui.trip.aiNameAction")}
                </button>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("ui.trip.startDate")}</label>
                <input name="start_date" type="date" value={createStartDate} onChange={(event) => setCreateStartDate(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-muted-foreground">{t("ui.trip.endDate")}</label>
                <input name="end_date" type="date" value={createEndDate} min={createStartDate} onChange={(event) => setCreateEndDate(event.target.value)} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              </div>
            </div>
            <div className="mt-3" aria-live="polite">
              {nameSuggestions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">{t("ui.trip.aiNameAlternatives")}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {nameSuggestions.map((suggestion) => (
                      <button key={suggestion} type="button" onClick={() => { setTripName(suggestion); nameInputRef.current?.focus(); }} className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${tripName === suggestion ? "border-primary bg-primary text-white" : "border-border bg-background text-foreground hover:border-primary/40"}`}>
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {nameSuggestionsFallback && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">{t("ui.trip.aiNameFallback")}</p>}
              {nameSuggestionError && <p className="mt-2 text-xs text-destructive">{t(nameSuggestionError === "phone" ? "ui.trip.aiNamePhoneRequired" : "ui.trip.aiNameError")}</p>}
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={closeCreateForm} className="rounded-full px-4 py-2 text-sm font-bold text-muted-foreground hover:bg-muted">{t("ui.actions.cancel")}</button>
              <button type="submit" className="rounded-full bg-primary px-5 py-2 text-sm font-bold text-white hover:bg-primary/90">{t("ui.trip.createAndStart")}</button>
            </div>
          </form>
        )}

        {trips.length > 0 && (
          <section aria-label={t("ui.trip.filterTitle")} className="mb-6 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_8px_24px_rgba(1,0,102,0.06)]">
            <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-primary"><Filter size={15} aria-hidden="true" /></span>
                  <h2 className="text-sm font-bold text-foreground">{t("ui.trip.filterTitle")}</h2>
                  {activeFilterCount > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-white">{activeFilterCount}</span>}
                </div>
                <p className="mt-1 pl-10 text-xs text-muted-foreground">{t("ui.trip.results", { count: visibleTrips.length })}</p>
              </div>
              {(hasActiveFilters || tripFilters.sort !== "newest") && (
                <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 self-start text-xs font-bold text-primary hover:underline sm:self-auto">
                  <X size={13} aria-hidden="true" /> {t("ui.actions.clearFilters")}
                </button>
              )}
            </div>

            <div className="border-t border-border px-4 py-4 sm:px-5">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(140px,0.8fr)_minmax(140px,0.8fr)_minmax(160px,0.9fr)]">
                <label className="flex min-h-11 items-center gap-2.5 rounded-xl border border-border bg-background px-3.5 py-2.5 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
                  <Search size={16} className="shrink-0 text-primary" aria-hidden="true" />
                  <span className="sr-only">{t("ui.trip.searchPlaceholder")}</span>
                  <input value={tripFilters.query} onChange={(event) => updateTripFilter("query", event.target.value)} placeholder={t("ui.trip.searchPlaceholder")} aria-label={t("ui.trip.searchPlaceholder")} className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground" />
                </label>
                <label className="flex flex-col justify-center rounded-xl border border-border bg-background px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  <span>{t("ui.trip.fromDate")}</span>
                  <input type="date" value={tripFilters.from} onFocus={primeDateRange} onChange={(event) => updateTripFilter("from", event.target.value)} aria-label={t("ui.trip.fromDate")} className="mt-0.5 bg-transparent text-sm font-semibold normal-case tracking-normal text-foreground outline-none" />
                </label>
                <label className="flex flex-col justify-center rounded-xl border border-border bg-background px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  <span>{t("ui.trip.toDate")}</span>
                  <input type="date" value={tripFilters.to} min={tripFilters.from || undefined} onFocus={primeDateRange} onChange={(event) => updateTripFilter("to", event.target.value)} aria-label={t("ui.trip.toDate")} className="mt-0.5 bg-transparent text-sm font-semibold normal-case tracking-normal text-foreground outline-none" />
                </label>
                <label className="flex flex-col justify-center rounded-xl border border-border bg-background px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
                  <span>{t("ui.trip.sortBy")}</span>
                  <select value={tripFilters.sort} onChange={(event) => updateTripFilter("sort", event.target.value as TripSort)} aria-label={t("ui.trip.sortBy")} className="mt-0.5 bg-transparent text-sm font-semibold normal-case tracking-normal text-foreground outline-none">
                    <option value="newest">{t("ui.trip.sortNewest")}</option>
                    <option value="oldest">{t("ui.trip.sortOldest")}</option>
                    <option value="tripDate">{t("ui.trip.sortTripDate")}</option>
                  </select>
                </label>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div role="group" aria-label={t("ui.trip.status")} className="flex flex-wrap gap-2">
                  {TRIP_STATUS_OPTIONS.map((status) => {
                    const selected = tripFilters.status === status;
                    const labelKey = status === "all" ? "ui.trip.allStatuses" : `ui.trip.${status}`;
                    return <button key={status} type="button" aria-pressed={selected} onClick={() => updateTripFilter("status", status)} className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20 ${selected ? "border-primary bg-primary text-white" : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-primary"}`}>{t(labelKey)}</button>;
                  })}
                </div>
                {activeFilterCount > 0 && <p className="text-xs text-muted-foreground">{t("ui.trip.activeFilters", { count: activeFilterCount })}</p>}
              </div>
            </div>
          </section>
        )}

        {trips.length === 0 && !isCreating ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card px-6 py-24 text-center shadow-sm">
            <Navigation className="mb-4 h-12 w-12 text-primary opacity-50" />
            <h3 className="text-lg font-bold text-foreground">{t("ui.trip.emptyTitle")}</h3>
            <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{t("ui.trip.emptyDescription")}</p>
            <button onClick={openCreateForm} className="mt-6 rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-white transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30">
              {t("ui.trip.createFirst")}
            </button>
          </div>
        ) : visibleTrips.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-card px-6 py-20 text-center shadow-sm">
            <Filter className="mb-4 h-10 w-10 text-primary opacity-50" aria-hidden="true" />
            <h3 className="text-lg font-bold text-foreground">{t("ui.trip.noMatches")}</h3>
            <p className="mt-1 max-w-md text-sm leading-6 text-muted-foreground">{t("ui.trip.noMatchesDescription")}</p>
            <button type="button" onClick={clearFilters} className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-white transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/30">
              <X size={15} aria-hidden="true" /> {t("ui.actions.clearFilters")}
            </button>
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {visibleTrips.map((trip) => (
              <div key={trip.id} className="group relative flex flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-[0_8px_24px_rgba(1,0,102,0.06)] transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md sm:p-6">
                <div>
                  <div className="mb-5 flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
                      <Navigation size={11} /> {t("accountGroups.myTravel")}
                    </span>
                    <Calendar size={16} className="text-muted-foreground" aria-hidden="true" />
                  </div>
                  <h3 className="text-xl font-bold text-foreground">{trip.name}</h3>
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Calendar size={13} />
                    {trip.start_date ? (trip.end_date ? t("ui.trip.dateRange", { start: trip.start_date, end: trip.end_date }) : trip.start_date) : t("ui.trip.datesPending")}
                  </p>
                </div>
                <div className="mt-7 flex items-center justify-between gap-3 border-t border-border pt-4">
                  <Link href={`/customer/trip/${trip.id}`} className="group/open inline-flex min-h-10 flex-1 items-center justify-between rounded-xl border border-primary/15 bg-secondary/40 px-3.5 py-2 text-sm font-bold text-primary transition hover:border-primary/30 hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30">
                    <span>{t("ui.trip.openPlanner")}</span>
                    <span aria-hidden="true" className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-white transition-transform group-hover/open:translate-x-0.5">
                      <ArrowUpRight size={14} strokeWidth={2.5} />
                    </span>
                  </Link>
                  <button
                    onClick={() => handleDelete(trip.id)}
                    className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-destructive/30"
                    aria-label={t("ui.trip.delete")}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CustomerPageShell>
    </>
  );
}
