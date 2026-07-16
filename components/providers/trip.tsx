"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

const STORAGE_KEY = "mywisata:trip";

export interface TripStop {
  id: string;
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
}

export interface TripStart {
  label: string;
  lat: number;
  lng: number;
  source: "gps" | "custom";
}

interface StoredTrip {
  start: TripStart | null;
  stops: TripStop[];
}

interface TripContextValue {
  start: TripStart | null;
  stops: TripStop[];
  has: (id: string) => boolean;
  add: (stop: TripStop) => void;
  remove: (id: string) => void;
  move: (from: number, to: number) => void;
  clear: () => void;
  setStart: (start: TripStart) => void;
  clearStart: () => void;
}

const TripContext = createContext<TripContextValue | null>(null);

export function TripProvider({ children }: { children: ReactNode }) {
  const [start, setStartState] = useState<TripStart | null>(null);
  const [stops, setStops] = useState<TripStop[]>([]);
  const [mounted, setMounted] = useState(false);

  // A trip is throwaway planning state — localStorage only, no DB table.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredTrip;
        setStartState(parsed.start ?? null);
        setStops(parsed.stops ?? []);
      }
    } catch {
      // corrupt/unavailable storage — start fresh
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const payload: StoredTrip = { start, stops };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // storage full/unavailable — trip just won't persist this change
    }
  }, [mounted, start, stops]);

  const has = useCallback((id: string) => stops.some((s) => s.id === id), [stops]);

  const add = useCallback((stop: TripStop) => {
    setStops((current) => (current.some((s) => s.id === stop.id) ? current : [...current, stop]));
  }, []);

  const remove = useCallback((id: string) => {
    setStops((current) => current.filter((s) => s.id !== id));
  }, []);

  const move = useCallback((from: number, to: number) => {
    setStops((current) => {
      if (to < 0 || to >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }, []);

  const clear = useCallback(() => setStops([]), []);
  const setStart = useCallback((next: TripStart) => setStartState(next), []);
  const clearStart = useCallback(() => setStartState(null), []);

  const value = useMemo(
    () => ({ start, stops, has, add, remove, move, clear, setStart, clearStart }),
    [start, stops, has, add, remove, move, clear, setStart, clearStart],
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip() {
  const context = useContext(TripContext);
  if (!context) throw new Error("useTrip must be used within TripProvider");
  return context;
}
