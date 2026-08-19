"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/components/providers/auth";

type SavedDestinationRecord = {
  state: string;
  savedAt: string;
};

type SavedDestinationsContextValue = {
  savedStates: ReadonlySet<string>;
  savedAt: ReadonlyMap<string, string>;
  loading: boolean;
  toggleSaved: (destinationState: string) => Promise<boolean>;
};

const SavedDestinationsContext = createContext<SavedDestinationsContextValue | null>(null);

export function SavedDestinationsProvider({ children }: { children: ReactNode }) {
  const [savedStates, setSavedStates] = useState<ReadonlySet<string>>(new Set());
  const [savedAt, setSavedAt] = useState<ReadonlyMap<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const { currentUser } = useAuth();
  const activeUserIdRef = useRef<string | null>(currentUser?.id ?? null);
  activeUserIdRef.current = currentUser?.id ?? null;

  useEffect(() => {
    if (!currentUser) {
      setSavedStates(new Set());
      setSavedAt(new Map());
      setLoading(false);
      return;
    }
    let cancelled = false;
    setSavedStates(new Set());
    setSavedAt(new Map());
    setLoading(true);
    fetch("/api/saved-destinations")
      .then(async (response) => {
        if (!response.ok) return;
        const body = (await response.json()) as { data?: { destinations?: SavedDestinationRecord[] } };
        if (cancelled) return;
        const records = body.data?.destinations ?? [];
        setSavedStates(new Set(records.map((record) => record.state)));
        setSavedAt(new Map(records.map((record) => [record.state, record.savedAt])));
      })
      .catch(() => {
        // Saved destinations are an enhancement; discovery must remain available.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  const toggleSaved = useCallback(async (destinationState: string) => {
    if (!currentUser) return false;
    const userId = currentUser.id;
    const wasSaved = savedStates.has(destinationState);
    const nextSaved = !wasSaved;
    const savedAtNow = new Date().toISOString();

    setSavedStates((current) => {
      const next = new Set(current);
      if (nextSaved) next.add(destinationState);
      else next.delete(destinationState);
      return next;
    });
    setSavedAt((current) => {
      const next = new Map(current);
      if (nextSaved) next.set(destinationState, savedAtNow);
      else next.delete(destinationState);
      return next;
    });

    try {
      const response = await fetch("/api/saved-destinations", {
        method: nextSaved ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destinationState }),
      });
      if (!response.ok) throw new Error("Saved destination update failed");
      return nextSaved;
    } catch {
      if (activeUserIdRef.current !== userId) return false;
      setSavedStates((current) => {
        const next = new Set(current);
        if (wasSaved) next.add(destinationState);
        else next.delete(destinationState);
        return next;
      });
      setSavedAt((current) => {
        const next = new Map(current);
        if (wasSaved) next.set(destinationState, savedAt.get(destinationState) ?? savedAtNow);
        else next.delete(destinationState);
        return next;
      });
      return wasSaved;
    }
  }, [currentUser, savedAt, savedStates]);

  const value = useMemo(() => ({ savedStates, savedAt, loading, toggleSaved }), [savedStates, savedAt, loading, toggleSaved]);
  return <SavedDestinationsContext.Provider value={value}>{children}</SavedDestinationsContext.Provider>;
}

export function useSavedDestinations() {
  const context = useContext(SavedDestinationsContext);
  if (!context) throw new Error("useSavedDestinations must be used within SavedDestinationsProvider");
  return context;
}
