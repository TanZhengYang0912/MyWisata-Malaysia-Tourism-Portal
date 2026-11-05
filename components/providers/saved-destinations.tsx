"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/components/providers/auth";
import { useVisibleReviewRefresh } from "@/hooks/use-visible-review-refresh";

type SavedDestinationRecord = { state: string; savedAt: string };
type SavedDestinationsContextValue = {
  savedStates: ReadonlySet<string>;
  savedAt: ReadonlyMap<string, string>;
  loading: boolean;
  hydrated: boolean;
  denied: boolean;
  toggleSaved: (destinationState: string) => Promise<boolean>;
};
const SavedDestinationsContext = createContext<SavedDestinationsContextValue | null>(null);
type Owner = ReturnType<typeof useAuth>["currentUser"];

export function SavedDestinationsProvider({ children }: { children: ReactNode }) {
  const { currentUser, loading } = useAuth();
  return <SavedDestinationsOwnerProvider key={currentUser?.id ?? "guest"} user={currentUser} authLoading={loading}>{children}</SavedDestinationsOwnerProvider>;
}

function SavedDestinationsOwnerProvider({ children, user, authLoading }: { children: ReactNode; user: Owner; authLoading: boolean }) {
  const [savedStates, setSavedStates] = useState<ReadonlySet<string>>(new Set());
  const [savedAt, setSavedAt] = useState<ReadonlyMap<string, string>>(new Map());
  const [hydrated, setHydrated] = useState(false);
  const [denied, setDenied] = useState(false);
  const snapshot = useRef({ states: new Set<string>(), dates: new Map<string, string>() });
  const operations = useRef({ epoch: 0, pending: new Map<string, Promise<boolean>>(), dirty: false });
  const alive = useRef(true);
  const access = useRef({ denied: false, generation: 0 });
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async (signal: AbortSignal) => {
    const state = operations.current;
    if (state.pending.size) { state.dirty = true; return; }
    const epoch = state.epoch;
    const response = await fetch("/api/saved-destinations", { cache: "no-store", signal });
    if (!alive.current || signal.aborted) return;
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        access.current.denied = true; access.current.generation += 1; state.epoch += 1;
        snapshot.current = { states: new Set(), dates: new Map() };
        setSavedStates(snapshot.current.states); setSavedAt(snapshot.current.dates); setDenied(true);
      }
      throw Object.assign(new Error("Saved destinations unavailable"), { status: response.status });
    }
    const body = await response.json() as { data?: { destinations?: SavedDestinationRecord[] } };
    if (!alive.current || signal.aborted) return;
    if (state.epoch !== epoch || state.pending.size) { state.dirty = true; return; }
    const records = body.data?.destinations ?? [];
    snapshot.current = { states: new Set(records.map(record => record.state)), dates: new Map(records.map(record => [record.state, record.savedAt])) };
    setSavedStates(snapshot.current.states); setSavedAt(snapshot.current.dates); setHydrated(true); setDenied(false); access.current.denied = false;
  }, []);
  const { refresh, hasRefreshError } = useVisibleReviewRefresh({
    enabled: !authLoading && Boolean(user), onRefresh: load, intervalMs: null,
    identityKey: user?.id, refreshKey: user, initialRefresh: true, coalesceMs: 250,
  });

  const toggleSaved = useCallback((destinationState: string): Promise<boolean> => {
    if (!alive.current || !user || authLoading || denied || access.current.denied) return Promise.resolve(false);
    const state = operations.current;
    const pending = state.pending.get(destinationState);
    if (pending) return pending;
    const accessGeneration = access.current.generation;
    const wasSaved = snapshot.current.states.has(destinationState);
    const previousDate = snapshot.current.dates.get(destinationState);
    const nextSaved = !wasSaved;
    const savedAtNow = new Date().toISOString();
    const apply = (saved: boolean, date?: string) => {
      const next = new Set(snapshot.current.states);
      const dates = new Map(snapshot.current.dates);
      if (saved) { next.add(destinationState); dates.set(destinationState, date ?? savedAtNow); }
      else { next.delete(destinationState); dates.delete(destinationState); }
      snapshot.current = { states: next, dates }; setSavedStates(next); setSavedAt(dates);
    };
    state.epoch += 1; apply(nextSaved);
    const mutation = (async () => {
      try {
        const response = await fetch("/api/saved-destinations", {
          method: nextSaved ? "POST" : "DELETE", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destinationState }),
        });
        if (!alive.current || access.current.generation !== accessGeneration) return false;
        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            access.current.denied = true; access.current.generation += 1; state.epoch += 1;
            snapshot.current = { states: new Set(), dates: new Map() };
            setSavedStates(snapshot.current.states); setSavedAt(snapshot.current.dates); setDenied(true);
            return false;
          }
          throw new Error("Saved destination update failed");
        }
        return nextSaved;
      } catch {
        if (alive.current && access.current.generation === accessGeneration) apply(wasSaved, previousDate);
        return wasSaved;
      } finally {
        if (alive.current) {
          state.pending.delete(destinationState); state.dirty = true;
          if (!state.pending.size && state.dirty && !access.current.denied) { state.dirty = false; refresh(); }
        }
      }
    })();
    state.pending.set(destinationState, mutation);
    return mutation;
  }, [authLoading, denied, refresh, user]);

  const loading = authLoading || Boolean(user && !hydrated && !denied && !hasRefreshError);
  const value = useMemo(() => ({ savedStates, savedAt, loading, hydrated: !user || hydrated, denied, toggleSaved }), [savedStates, savedAt, loading, user, hydrated, denied, toggleSaved]);
  return <SavedDestinationsContext.Provider value={value}>{children}</SavedDestinationsContext.Provider>;
}

export function useSavedDestinations() {
  const context = useContext(SavedDestinationsContext);
  if (!context) throw new Error("useSavedDestinations must be used within SavedDestinationsProvider");
  return context;
}
