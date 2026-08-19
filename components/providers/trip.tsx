"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "@/components/providers/auth";

// One special stop id — there is at most one "location" (your origin point) in
// the list, and it keeps this stable id so drag/reorder treats it like any other
// stop while still being findable.
export const LOCATION_STOP_ID = "__location__";

export interface TripStop {
  id: string;
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
  // "location" = the user's origin point (GPS or typed) — pinnable + editable;
  // "custom"   = a place the user typed/geocoded — editable;
  // "vendor"   = added from a listing pin/card — not editable (tied to a listing);
  // missing    = legacy data, treated as non-editable.
  source?: "location" | "custom" | "vendor";
  // Only meaningful on the location stop: whether GPS or a typed address set it.
  locationKind?: "gps" | "custom";
}

interface StoredTrip {
  stops: TripStop[];
}

interface TripContextValue {
  stops: TripStop[];
  /** Route origin = the top item (or null if the list is empty). */
  origin: TripStop | null;
  has: (id: string) => boolean;
  add: (stop: TripStop) => void;
  remove: (id: string) => void;
  move: (from: number, to: number) => void;
  update: (id: string, patch: Partial<Pick<TripStop, "label" | "lat" | "lng">>) => void;
  setStops: (stops: TripStop[]) => void;
  /** Upsert the single location stop (keeps its position if it already exists). */
  setLocation: (loc: { lat: number; lng: number; label: string; kind: "gps" | "custom" }) => void;
  clearLocation: () => void;
  clear: () => void;
}

const TripContext = createContext<TripContextValue | null>(null);

export function TripProvider({ children }: { children: ReactNode }) {
  const [stops, setStops] = useState<TripStop[]>([]);
  const [mounted, setMounted] = useState(false);
  const { currentUser } = useAuth();

  // A trip is throwaway planning state — localStorage only, no DB table. Only
  // the current { stops } shape is honoured; an old { start, stops } payload
  // (pre-unify) is discarded rather than migrated — this is pre-launch demo
  // data with no real users to preserve trips for.
  useEffect(() => {
    setMounted(false);
    if (!currentUser) {
      setStops([]);
      setMounted(true);
      return;
    }
    try {
      const raw = window.localStorage.getItem(`mywisata:trip:${currentUser.id}`);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StoredTrip> & { start?: unknown };
        setStops(parsed.start === undefined && Array.isArray(parsed.stops) ? parsed.stops : []);
      } else {
        setStops([]);
      }
    } catch {
      setStops([]);
    }
    setMounted(true);
  }, [currentUser?.id]);

  useEffect(() => {
    if (!currentUser || !mounted) return;
    const payload: StoredTrip = { stops };
    try {
      window.localStorage.setItem(`mywisata:trip:${currentUser.id}`, JSON.stringify(payload));
    } catch {
      // storage full/unavailable — trip just won't persist this change
    }
  }, [currentUser?.id, mounted, stops]);

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

  const update = useCallback((id: string, patch: Partial<Pick<TripStop, "label" | "lat" | "lng">>) => {
    setStops((current) => current.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const setLocation = useCallback((loc: { lat: number; lng: number; label: string; kind: "gps" | "custom" }) => {
    setStops((current) => {
      const locStop: TripStop = { id: LOCATION_STOP_ID, lat: loc.lat, lng: loc.lng, label: loc.label, source: "location", locationKind: loc.kind };
      const idx = current.findIndex((s) => s.source === "location");
      if (idx === -1) return [locStop, ...current]; // first time — origin at the top
      const next = [...current];
      next[idx] = locStop; // keep its current position
      return next;
    });
  }, []);

  const clearLocation = useCallback(() => {
    setStops((current) => current.filter((s) => s.source !== "location"));
  }, []);

  const clear = useCallback(() => setStops([]), []);

  const value = useMemo<TripContextValue>(
    () => ({ stops, origin: stops[0] ?? null, has, add, remove, move, update, setStops, setLocation, clearLocation, clear }),
    [stops, has, add, remove, move, update, setLocation, clearLocation, clear],
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}

export function useTrip() {
  const context = useContext(TripContext);
  if (!context) throw new Error("useTrip must be used within TripProvider");
  return context;
}
