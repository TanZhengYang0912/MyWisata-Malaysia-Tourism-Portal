"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Eye, EyeOff, GripVertical, ImageOff, Loader2, LocateFixed, Maximize2, Minus, Navigation, Pencil, Plus, Search, Star, X } from "lucide-react";
import { MapView, type MapPin } from "@/components/map/map-view";
import { CATEGORIES, searchActivities } from "@/backend/domains/catalogue";
import { useCart } from "@/components/providers/cart";
import { TRAVEL_MODES, buildGoogleMapsDirectionsUrl, type TravelModeId } from "@/lib/travel-modes";
import { ORS_PROFILE, type GeoHit, type RouteResult } from "@/lib/routing";
import type { ComputedActivity } from "@/backend/core/types";
import type { Trip, TripItem } from "@/backend/domains/trips";
import { getDiscoverySearchFilter } from "@/lib/customer/discovery-categories";
import { addTripItemAction, deleteTripItemAction, reorderTripItemsAction, updateTripItemLocationAction } from "../actions";

export interface TripStop {
  id: string; // e.g., experience_id or custom id
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
  source: "vendor" | "location";
  locationKind?: "custom" | "gps";
}

// local sync hook matching useTrip API
function useSyncTrip(tripId: string, initialItems: TripItem[]) {
  const [items, setItems] = useState<TripItem[]>(initialItems);

  const stops: TripStop[] = items.map(i => ({
    id: i.id, // using the item id (which matches experience_id or loc-xxx)
    lat: i.lat,
    lng: i.lng,
    label: i.label,
    sublabel: i.sublabel,
    source: i.source,
    locationKind: i.kind
  }));

  const origin = stops.find(s => s.source === "location") || null;

  return {
    origin,
    stops,
    has: (id: string) => stops.some(s => s.id === id),
    add: async (stop: Omit<TripStop, "id"> & { id?: string }) => {
      const tempId = stop.id || ("temp-" + Date.now());
      const newItem: TripItem = {
        id: tempId,
        trip_id: tripId,
        experience_id: stop.source === "vendor" ? tempId : null,
        sequence: items.length,
        scheduled_date: null,
        scheduled_time: null,
        created_at: new Date().toISOString(),
        source: stop.source,
        kind: stop.locationKind,
        lat: stop.lat,
        lng: stop.lng,
        label: stop.label,
        sublabel: stop.sublabel
      };
      setItems(prev => [...prev, newItem]);
      await addTripItemAction({
        trip_id: tripId,
        experience_id: stop.source === "vendor" ? stop.id : undefined,
        source: stop.source,
        kind: stop.locationKind,
        lat: stop.lat,
        lng: stop.lng,
        label: stop.label,
        sublabel: stop.sublabel
      });
    },
    remove: async (id: string) => {
      setItems(prev => prev.filter(i => i.id !== id && i.experience_id !== id));
      const target = items.find(i => i.id === id || i.experience_id === id);
      if (target) await deleteTripItemAction(tripId, target.id);
    },
    move: async (from: number, to: number) => {
      const newItems = [...items];
      const [moved] = newItems.splice(from, 1);
      newItems.splice(to, 0, moved);
      setItems(newItems);
      await reorderTripItemsAction(tripId, newItems.map(i => i.id));
    },
    setLocation: async (stop: Omit<TripStop, "id" | "source">) => {
      const locIndex = items.findIndex(i => i.source === "location");
      const tempId = "loc-" + Date.now();
      const newLoc: TripItem = {
        id: tempId,
        trip_id: tripId,
        experience_id: null,
        sequence: locIndex >= 0 ? items[locIndex].sequence : 0,
        scheduled_date: null,
        scheduled_time: null,
        created_at: new Date().toISOString(),
        source: "location",
        kind: stop.locationKind,
        lat: stop.lat,
        lng: stop.lng,
        label: stop.label,
        sublabel: stop.sublabel
      };
      
      const newItems = [...items];
      if (locIndex >= 0) {
        const oldLocId = items[locIndex].id;
        newItems[locIndex] = newLoc;
        setItems(newItems);
        await deleteTripItemAction(tripId, oldLocId);
      } else {
        newItems.unshift(newLoc); // origin is always top conceptually, or just add it
        setItems(newItems);
      }
      
      await addTripItemAction({
        trip_id: tripId,
        source: "location",
        kind: stop.locationKind,
        lat: stop.lat,
        lng: stop.lng,
        label: stop.label,
        sublabel: stop.sublabel
      });
      // if we replaced, we should reorder to ensure sequences match
      if (locIndex >= 0) {
        await reorderTripItemsAction(tripId, newItems.map(i => i.id));
      }
    },
    update: async (id: string, updates: { label: string; lat: number; lng: number }) => {
      setItems(prev => prev.map(i => {
        if (i.id === id || i.experience_id === id) {
          return { ...i, label: updates.label, lat: updates.lat, lng: updates.lng };
        }
        return i;
      }));
      await updateTripItemLocationAction(tripId, id, updates);
    },
    clear: async () => {
      // not implemented for db for safety, just stub
      alert("Please delete the trip from the Trip Hub.");
    }
  };
}

const KL_CENTER: [number, number] = [3.139, 101.6869];
const RADIUS_OPTIONS_KM = [2, 5, 10];

const MODE_STYLE: Record<TravelModeId, { color: string; dashed?: boolean }> = {
  DRIVING: { color: "#2563EB" },
  WALKING: { color: "#64748b", dashed: true },
  BICYCLING: { color: "#16A34A" },
  TRANSIT: { color: "#010066" },
};

export function MapClient({ tripData, initialItems, initialActivities }: { tripData: Trip; initialItems: TripItem[]; initialActivities: ComputedActivity[] }) {
  const trip = useSyncTrip(tripData.id, initialItems);
  const { t: tCustomer } = useTranslation("customer");
  const [category, setCategory] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [activities, setActivities] = useState<ComputedActivity[] | null>(initialActivities);
  const [mode, setMode] = useState<TravelModeId>("DRIVING");
  const [collapsed, setCollapsed] = useState(false);
  const [urlPreview, setUrlPreview] = useState<string | null>(null);

  // Start editor + real-time geocoding autocomplete
  const [editingStart, setEditingStart] = useState(false);
  const [startInput, setStartInput] = useState("");
  const [suggestions, setSuggestions] = useState<GeoHit[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState("");

  // Add-a-stop search + real-time geocoding autocomplete
  const [addingStop, setAddingStop] = useState(false);
  const [stopSearchInput, setStopSearchInput] = useState("");
  const [stopSuggestions, setStopSuggestions] = useState<GeoHit[]>([]);
  const [stopSearchLoading, setStopSearchLoading] = useState(false);

  // Edit-a-typed-stop search + real-time geocoding autocomplete (vendor stops
  // aren't editable — they're tied to a real listing).
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [editStopInput, setEditStopInput] = useState("");
  const [editStopSuggestions, setEditStopSuggestions] = useState<GeoHit[]>([]);
  const [editStopLoading, setEditStopLoading] = useState(false);

  // Off by default — vendor pins otherwise clutter the map once a trip has stops.
  const [showAllVendors, setShowAllVendors] = useState(false);

  // Per-mode route options (may be several alternatives for a 2-point drive).
  const [routes, setRoutes] = useState<Partial<Record<TravelModeId, RouteResult[]>>>({});
  const [routesLoading, setRoutesLoading] = useState(false);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [focusRequest, setFocusRequest] = useState<{ pin: MapPin; token: number } | null>(null);
  const focusTokenRef = useRef(0);

  // Route origin = the top item of the unified stop list.
  const origin = trip.origin;
  const near = origin ? { lat: origin.lat, lng: origin.lng } : undefined;

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    searchActivities({ ...getDiscoverySearchFilter(category), near, sort: near ? "distance_asc" : "recommended" }).then(setActivities);
  }, [category, origin?.lat, origin?.lng]);

  // Route fetch (debounced): all ORS-supported modes → routes[mode] = options.
  // A route needs at least two points (origin + one more).
  const pointsKey = trip.stops.map((s) => `${s.lat},${s.lng}`).join("|");
  useEffect(() => {
    if (trip.stops.length < 2) {
      setRoutes({});
      setRoutesLoading(false);
      return;
    }
    const points: [number, number][] = trip.stops.map((s): [number, number] => [s.lat, s.lng]);
    let cancelled = false;
    setRoutesLoading(true);
    setSelectedRouteIdx(0);
    const timer = setTimeout(async () => {
      const supported = TRAVEL_MODES.filter((m) => ORS_PROFILE[m.id]);
      const entries = await Promise.all(
        supported.map(async (m) => {
          try {
            const res = await fetch("/api/route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: m.id, points }) });
            const body = (await res.json()) as { data: { routes: RouteResult[] } | null };
            return [m.id, res.ok && body.data ? body.data.routes : []] as const;
          } catch {
            return [m.id, [] as RouteResult[]] as const;
          }
        }),
      );
      if (cancelled) return;
      setRoutes(Object.fromEntries(entries));
      setRoutesLoading(false);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [pointsKey]);

  // Real-time geocoding as the user types the start location.
  useEffect(() => {
    if (!editingStart) return;
    const q = startInput.trim();
    if (q.length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setGeoLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        const body = (await res.json()) as { data: { results: GeoHit[] } | null };
        if (!cancelled) setSuggestions(body.data?.results ?? []);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setGeoLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [startInput, editingStart]);

  // Real-time geocoding as the user types a place to add as a stop.
  useEffect(() => {
    if (!addingStop) return;
    const q = stopSearchInput.trim();
    if (q.length < 3) {
      setStopSuggestions([]);
      return;
    }
    let cancelled = false;
    setStopSearchLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        const body = (await res.json()) as { data: { results: GeoHit[] } | null };
        if (!cancelled) setStopSuggestions(body.data?.results ?? []);
      } catch {
        if (!cancelled) setStopSuggestions([]);
      } finally {
        if (!cancelled) setStopSearchLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [stopSearchInput, addingStop]);

  // Real-time geocoding as the user re-types a typed stop's location.
  useEffect(() => {
    if (!editingStopId) return;
    const q = editStopInput.trim();
    if (q.length < 3) {
      setEditStopSuggestions([]);
      return;
    }
    let cancelled = false;
    setEditStopLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
        const body = (await res.json()) as { data: { results: GeoHit[] } | null };
        if (!cancelled) setEditStopSuggestions(body.data?.results ?? []);
      } catch {
        if (!cancelled) setEditStopSuggestions([]);
      } finally {
        if (!cancelled) setEditStopLoading(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [editStopInput, editingStopId]);

  const activeRoutes = ORS_PROFILE[mode] ? routes[mode] ?? [] : [];
  const activeRoute = activeRoutes[selectedRouteIdx] ?? activeRoutes[0];

  const locationStop = trip.stops.find((s) => s.source === "location") ?? null;
  function openStartEditor() {
    setStartInput(locationStop?.locationKind === "custom" ? locationStop.label : "");
    setSuggestions([]);
    setLocError("");
    setEditingStart(true);
  }
  function chooseSuggestion(hit: GeoHit) {
    trip.setLocation({ label: hit.label, lat: hit.lat, lng: hit.lng, locationKind: "custom" });
    setEditingStart(false);
    setStartInput("");
    setSuggestions([]);
  }
  function useGps() {
    if (!navigator.geolocation) {
      setLocError(tCustomer("ui.map.locationUnavailable"));
      return;
    }
    setLocating(true);
    setLocError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        trip.setLocation({ label: tCustomer("ui.map.yourLocation"), lat: pos.coords.latitude, lng: pos.coords.longitude, locationKind: "gps" });
        setLocating(false);
        setEditingStart(false);
      },
      () => {
        setLocating(false);
        setLocError(tCustomer("ui.map.locationDenied"));
      },
      { timeout: 5000 },
    );
  }

  function toggleStop(pin: MapPin) {
    if (trip.has(pin.id)) trip.remove(pin.id);
    else trip.add({ id: pin.id, lat: pin.lat, lng: pin.lng, label: pin.label, sublabel: pin.sublabel, source: "vendor" });
  }
  function chooseStopSuggestion(hit: GeoHit) {
    trip.add({ lat: hit.lat, lng: hit.lng, label: hit.label, source: "location", locationKind: "custom" });
    setAddingStop(false);
    setStopSearchInput("");
    setStopSuggestions([]);
  }
  function openStopEditor(stop: TripStop) {
    setEditingStopId(stop.id);
    setEditStopInput(stop.label);
    setEditStopSuggestions([]);
  }
  function chooseStopEditSuggestion(hit: GeoHit) {
    if (editingStopId) trip.update(editingStopId, { label: hit.label, lat: hit.lat, lng: hit.lng });
    setEditingStopId(null);
    setEditStopInput("");
    setEditStopSuggestions([]);
  }
  function focusPin(pin: MapPin) {
    focusTokenRef.current += 1;
    setFocusRequest({ pin, token: focusTokenRef.current });
  }

  // Geocode dropdown for the location editor — shared by the "no location yet"
  // placeholder and the location row's inline edit form.
  function locationSuggestions() {
    return (
      <div className="mt-1.5">
        {geoLoading && <p className="px-1 py-1 text-[11px] text-muted-foreground">Searching…</p>}
        {!geoLoading && startInput.trim().length >= 3 && suggestions.length === 0 && <p className="px-1 py-1 text-[11px] text-muted-foreground">No matches — keep typing.</p>}
        {suggestions.length > 0 && (
          <ul className="overflow-hidden rounded-lg border border-border bg-card">
            {suggestions.map((s, i) => (
              <li key={`${s.lat},${s.lng},${i}`}>
                <button onClick={() => chooseSuggestion(s)} className="flex w-full items-start gap-2 border-b border-border px-2.5 py-2 text-left last:border-0 hover:bg-muted">
                  <LocateFixed size={12} className="mt-0.5 shrink-0 text-primary" />
                  <span className="line-clamp-2 text-[12px] text-foreground">{s.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // One flat, reorderable list — the top item is the route origin. Dragging is
  // a plain move; each row's affordances follow its source identity, not its
  // position (see the list JSX below).
  function handleDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      return;
    }
    trip.move(dragIndex, targetIndex);
    setDragIndex(null);
  }

  const visibleActivities = near ? (activities ?? []).filter((a) => (a.distanceKm ?? Infinity) <= radiusKm) : activities ?? [];
  const center: [number, number] = near ? [near.lat, near.lng] : KL_CENTER;
  // Trip-stop pins always render (numbered markers matching the list order);
  // vendor "browse to add" pins are opt-in via showAllVendors, off by default so
  // the map doesn't get cluttered once a trip actually has stops.
  const stopIdSet = new Set(trip.stops.map((s) => s.id));
  const stopPins: MapPin[] = trip.stops.map((s) => ({ id: s.id, lat: s.lat, lng: s.lng, label: s.label, sublabel: s.sublabel }));
  const vendorPins: MapPin[] = showAllVendors
    ? visibleActivities.filter((a) => !stopIdSet.has(a.id)).map((a) => ({ id: a.id, lat: a.outlet.lat, lng: a.outlet.lng, label: a.name, sublabel: `RM ${a.price} · ${a.outlet.city}`, href: `/customer/activity/${a.id}` }))
    : [];
  const pins: MapPin[] = [...stopPins, ...vendorPins];

  // Waypoints count = everything except the origin "location" stop.
  const waypointCount = trip.stops.filter((s) => s.source !== "location").length;
  const directionsUrl = buildGoogleMapsDirectionsUrl(origin, trip.stops.slice(1), mode);
  function handleGetDirections() {
    if (directionsUrl) window.open(directionsUrl, "_blank");
  }
  const hasRouteInputs = trip.stops.length >= 2;
  function formatDuration(minutes: number) {
    if (minutes < 60) return tCustomer("ui.map.durationMinutes", { minutes });
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? tCustomer("ui.map.durationHoursMinutes", { hours, minutes: remainder }) : tCustomer("ui.map.durationHours", { hours });
  }
  function formatDurationShort(minutes: number) {
    if (minutes < 60) return tCustomer("ui.map.durationMinutesShort", { minutes });
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return remainder ? tCustomer("ui.map.durationHoursMinutesShort", { hours, minutes: remainder }) : tCustomer("ui.map.durationHoursShort", { hours });
  }
  function travelModeLabel(id: TravelModeId) { return tCustomer(`ui.map.travelModes.${id.toLowerCase()}`); }

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col overflow-hidden md:flex-row">
      {/* Left Side: Itinerary Panel */}
      <div
        className={`relative z-10 flex flex-col bg-card shadow-xl transition-all duration-300 border-r border-border ${
          collapsed ? "h-auto w-full border-b md:h-full md:w-16 md:border-b-0" : "h-1/2 w-full md:h-full md:w-[450px]"
        }`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3">
          {!collapsed ? (
            <div>
              <h1 className="text-xl font-bold text-foreground">{tripData.name}</h1>
              <p className="text-[11px] font-semibold text-muted-foreground mt-0.5">
                {tripData.start_date ? (tripData.end_date ? `${tripData.start_date} to ${tripData.end_date}` : tripData.start_date) : "Dates pending"}
              </p>
            </div>
          ) : <span />}
          <div className="flex items-center gap-1">
            <button onClick={() => setCollapsed(!collapsed)} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground">
              {collapsed ? <Maximize2 size={14} /> : <Minus size={14} />}
            </button>
          </div>
        </div>
        {!collapsed && (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-4">
              <div className="mb-2 flex gap-2 mt-4">
                <label className="flex-1">
                    <span className="sr-only">{tCustomer("ui.map.filterCategory")}</span>
                    <select value={category ?? ""} onChange={(e) => setCategory(e.target.value || null)} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-semibold text-foreground outline-none focus:border-primary">
                      <option value="">{tCustomer("ui.map.allCategories")}</option>
                      {CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>{tCustomer(`categories.${c.id === "hidden_gem" ? "hiddenGem" : c.id}`)}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">{tCustomer("ui.map.radius")}</span>
                    <select value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} className="rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-semibold text-foreground outline-none focus:border-primary">
                      {RADIUS_OPTIONS_KM.map((km) => (
                        <option key={km} value={km}>{km} km</option>
                      ))}
                    </select>
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAllVendors((v) => !v)}
                  className="mb-3 inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground hover:bg-muted"
                  aria-pressed={showAllVendors}
                >
                  {showAllVendors ? <Eye size={13} className="text-primary" /> : <EyeOff size={13} />}
                  {showAllVendors ? tCustomer("ui.map.showingAllVendors") : tCustomer("ui.map.showAllVendors")}
                </button>

                {/* One flat, drag-reorderable list. The top item is the route origin.
                    Affordances follow each row's source identity, not its position:
                    location = GPS + edit + move (wherever it sits), custom = edit + move,
                    vendor = move only. */}
                <ul className="mb-2 flex flex-col gap-1.5">
                  {/* No location set yet — a prompt to add your starting point (GPS or typed). */}
                  {!locationStop && (
                    <li className="rounded-xl border border-dashed p-2" style={{ borderColor: "var(--border)", backgroundColor: "var(--muted)" }}>
                      <div className="flex items-center gap-2">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-muted-foreground"><LocateFixed size={14} /></span>
                        {editingStart ? (
                          <input
                            autoFocus
                            type="text"
                            value={startInput}
                            onChange={(e) => setStartInput(e.target.value)}
                            placeholder={tCustomer("ui.map.typeLocation")}
                            className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1 text-[13px] text-foreground outline-none focus:border-primary"
                          />
                        ) : (
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-bold text-foreground">{tCustomer("ui.map.addStartingPoint")}</span>
                            <span className="block text-[11px] text-muted-foreground">{tCustomer("ui.map.typePlaceOrGps")}</span>
                          </span>
                        )}
                        <span className="flex shrink-0 items-center gap-0.5">
                          <button onClick={() => (editingStart ? setEditingStart(false) : openStartEditor())} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-black/5" aria-label={tCustomer("ui.map.typeAddress")} title={tCustomer("ui.map.typeAddress")}>
                            {editingStart ? <X size={15} /> : <Pencil size={13} />}
                          </button>
                          <button onClick={useGps} disabled={locating} className="grid h-7 w-7 place-items-center rounded-md text-primary hover:bg-black/5 disabled:opacity-50" aria-label={tCustomer("ui.map.useCurrentLocation")} title={tCustomer("ui.map.useGpsLocation")}>
                            {locating ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={15} />}
                          </button>
                        </span>
                      </div>
                      {editingStart && locationSuggestions()}
                      {locError && <p className="mt-1 px-1 text-[11px] text-destructive">{locError}</p>}
                    </li>
                  )}

                  {trip.stops.map((s, i) => {
                    const isLocation = s.source === "location" && s.id === trip.origin?.id;
                    const isCustom = s.source === "location" && s.id !== trip.origin?.id;
                    const editing = isLocation ? editingStart : editingStopId === s.id;
                    const badge = i + 1;
                    return (
                      <li
                        key={s.id}
                        draggable
                        onDragStart={() => setDragIndex(i)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => handleDrop(i)}
                        onDragEnd={() => setDragIndex(null)}
                        className={`rounded-xl border p-2 ${isLocation ? "border-transparent" : "border-border bg-muted"} ${dragIndex === i ? "opacity-40" : ""}`}
                        style={isLocation ? { backgroundColor: "var(--secondary, #dbe6ff)" } : undefined}
                      >
                        {editing ? (
                          <div>
                            <div className="flex items-center gap-2">
                              <GripVertical size={14} className="shrink-0 cursor-grab text-muted-foreground" />
                              <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white ${isLocation ? "" : "bg-primary"}`} style={isLocation ? { backgroundColor: "var(--nature-green, #16A34A)" } : undefined}>{badge}</span>
                              <input
                                autoFocus
                                type="text"
                                value={isLocation ? startInput : editStopInput}
                                onChange={(e) => (isLocation ? setStartInput(e.target.value) : setEditStopInput(e.target.value))}
                                placeholder={tCustomer("ui.map.typeNewLocation")}
                                className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1 text-[13px] text-foreground outline-none focus:border-primary"
                              />
                              {isLocation && (
                                <button onClick={useGps} disabled={locating} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-primary hover:bg-black/5 disabled:opacity-50" aria-label={tCustomer("ui.map.useCurrentLocation")} title={tCustomer("ui.map.useGpsLocation")}>
                                  {locating ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={15} />}
                                </button>
                              )}
                              <button onClick={() => (isLocation ? setEditingStart(false) : setEditingStopId(null))} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-black/5" aria-label={tCustomer("ui.map.cancelEdit")}>
                                <X size={15} />
                              </button>
                            </div>
                            {isLocation ? (
                              locationSuggestions()
                            ) : (
                              <div className="mt-1.5">
                                {editStopLoading && <p className="px-1 py-1 text-[11px] text-muted-foreground">{tCustomer("ui.map.searching")}</p>}
                                {!editStopLoading && editStopInput.trim().length >= 3 && editStopSuggestions.length === 0 && <p className="px-1 py-1 text-[11px] text-muted-foreground">{tCustomer("ui.map.noMatches")}</p>}
                                {editStopSuggestions.length > 0 && (
                                  <ul className="overflow-hidden rounded-lg border border-border bg-card">
                                    {editStopSuggestions.map((sug, i2) => (
                                      <li key={`${sug.lat},${sug.lng},${i2}`}>
                                        <button onClick={() => chooseStopEditSuggestion(sug)} className="flex w-full items-start gap-2 border-b border-border px-2.5 py-2 text-left last:border-0 hover:bg-muted">
                                          <LocateFixed size={12} className="mt-0.5 shrink-0 text-primary" />
                                          <span className="line-clamp-2 text-[12px] text-foreground">{sug.label}</span>
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            )}
                            {isLocation && locError && <p className="mt-1 px-1 text-[11px] text-destructive">{locError}</p>}
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <GripVertical size={14} className="shrink-0 cursor-grab text-muted-foreground" />
                            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white ${isLocation ? "" : "bg-primary"}`} style={isLocation ? { backgroundColor: "var(--nature-green, #16A34A)" } : undefined}>{badge}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[13px] font-bold text-foreground">{s.label}</span>
                              {isLocation ? (
                                <span className="block text-[11px] text-muted-foreground">{s.locationKind === "gps" ? tCustomer("ui.map.currentLocation") : tCustomer("ui.map.customStart")}</span>
                              ) : (
                                s.sublabel && <span className="block truncate text-[11px] text-muted-foreground">{s.sublabel}</span>
                              )}
                            </span>
                            {(isLocation || isCustom) && (
                              <button onClick={() => (isLocation ? openStartEditor() : openStopEditor(s))} className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-primary" aria-label={isLocation ? tCustomer("ui.map.editLocation") : tCustomer("ui.map.editStop")}>
                                <Pencil size={13} />
                              </button>
                            )}
                            {isLocation && (
                              <button onClick={useGps} disabled={locating} className="shrink-0 rounded-md p-1 text-primary hover:bg-black/5 disabled:opacity-50" aria-label={tCustomer("ui.map.useCurrentLocation")} title={tCustomer("ui.map.useGpsLocation")}>
                                {locating ? <Loader2 size={13} className="animate-spin" /> : <LocateFixed size={14} />}
                              </button>
                            )}
                            <button onClick={() => trip.remove(s.id)} className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-destructive" aria-label={isLocation ? tCustomer("ui.map.removeLocation") : tCustomer("ui.map.removeStop")}>
                              <X size={14} />
                            </button>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>

                {/* Add any address as a stop */}
                <div className="mb-3">
                  {addingStop ? (
                    <div className="rounded-xl border border-border bg-muted p-2">
                      <div className="flex items-center gap-2">
                        <Search size={13} className="shrink-0 text-muted-foreground" />
                        <input
                          autoFocus
                          type="text"
                          value={stopSearchInput}
                          onChange={(e) => setStopSearchInput(e.target.value)}
                          placeholder={tCustomer("ui.map.searchPlaceToAdd")}
                          className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1 text-[13px] text-foreground outline-none focus:border-primary"
                        />
                        <button onClick={() => { setAddingStop(false); setStopSearchInput(""); setStopSuggestions([]); }} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-black/5" aria-label={tCustomer("ui.actions.cancel")}>
                          <X size={15} />
                        </button>
                      </div>
                      <div className="mt-1.5">
                        {stopSearchLoading && <p className="px-1 py-1 text-[11px] text-muted-foreground">{tCustomer("ui.map.searching")}</p>}
                        {!stopSearchLoading && stopSearchInput.trim().length >= 3 && stopSuggestions.length === 0 && <p className="px-1 py-1 text-[11px] text-muted-foreground">{tCustomer("ui.map.noMatches")}</p>}
                        {stopSuggestions.length > 0 && (
                          <ul className="overflow-hidden rounded-lg border border-border bg-card">
                            {stopSuggestions.map((s, i) => (
                              <li key={`${s.lat},${s.lng},${i}`}>
                                <button onClick={() => chooseStopSuggestion(s)} className="flex w-full items-start gap-2 border-b border-border px-2.5 py-2 text-left last:border-0 hover:bg-muted">
                                  <LocateFixed size={12} className="mt-0.5 shrink-0 text-primary" />
                                  <span className="line-clamp-2 text-[12px] text-foreground">{s.label}</span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setAddingStop(true)} className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2 text-[12px] font-semibold text-muted-foreground hover:border-primary hover:text-primary">
                      <Plus size={13} /> {tCustomer("ui.map.addPlace")}
                    </button>
                  )}
                </div>

                {waypointCount === 0 && (
                  <p className="mb-3 rounded-xl border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">{tCustomer("ui.map.addStopsHint")}</p>
                )}

                {/* travel modes with per-mode time */}
                <div className="mb-3 mt-1 flex gap-1.5">
                  {TRAVEL_MODES.map((m) => {
                    const supported = Boolean(ORS_PROFILE[m.id]);
                    const best = routes[m.id]?.[0];
                    return (
                      <button
                        key={m.id}
                        onClick={() => setMode(m.id)}
                        className="flex flex-1 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 text-[11px] font-bold"
                        style={{ borderColor: mode === m.id ? "var(--travel-blue)" : "var(--border)", backgroundColor: mode === m.id ? "var(--travel-blue)" : "transparent", color: mode === m.id ? "white" : "var(--foreground)" }}
                      >
                        <span className="flex items-center gap-1"><m.icon size={13} /> {travelModeLabel(m.id)}</span>
                        <span className="text-[9px] font-semibold opacity-80">{!hasRouteInputs ? "" : !supported ? tCustomer("ui.map.maps") : routesLoading ? "…" : best ? formatDurationShort(best.durationMin) : "—"}</span>
                      </button>
                    );
                  })}
                </div>

                {/* alternative routes (driving, simple 2-point trips) */}
                {activeRoutes.length > 1 && (
                  <div className="mb-3 flex flex-col gap-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{tCustomer("ui.map.routeOptions")}</p>
                    {activeRoutes.map((r, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedRouteIdx(idx)}
                        className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left"
                        style={{ borderColor: idx === selectedRouteIdx ? "var(--travel-blue)" : "var(--border)", backgroundColor: idx === selectedRouteIdx ? "var(--secondary, #dbe6ff)" : "transparent" }}
                      >
                        <span className="text-[13px] font-bold text-foreground">
                          {formatDuration(r.durationMin)} <span className="font-semibold text-muted-foreground">· {tCustomer("ui.map.distanceKm", { distance: r.distanceKm })}</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          {idx === 0 && <span className="rounded-full bg-nature-green/10 px-1.5 py-0.5 text-[9px] font-bold" style={{ color: "var(--nature-green, #16A34A)" }}>{tCustomer("ui.map.fastest")}</span>}
                          {r.hasTolls && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-amber-900" style={{ backgroundColor: "var(--highlight-yellow)" }}>{tCustomer("ui.map.toll")}</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* nearby to add */}
                <p className="mb-2 mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-primary">{tCustomer("ui.map.nearbyToAdd")}</p>
                <ul className="mb-2 flex flex-col gap-0.5 pb-2">
                  {visibleActivities.slice(0, 12).map((a) => {
                    const inTrip = trip.has(a.id);
                    return (
                      <li key={a.id} className="flex items-center gap-2.5 rounded-xl p-1.5 hover:bg-muted">
                        <button
                          type="button"
                          onClick={() => focusPin({ id: a.id, lat: a.outlet.lat, lng: a.outlet.lng, label: a.name, sublabel: `RM ${a.price} · ${a.outlet.city}`, href: `/customer/activity/${a.id}` })}
                          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                        >
                          {a.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.image} alt={a.name} className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                          ) : (
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                              <ImageOff size={14} strokeWidth={1.5} aria-hidden="true" />
                            </div>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-bold text-foreground">{a.name}</span>
                            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <Star size={10} fill="var(--highlight-yellow)" stroke="none" /> {a.rating}
                              {" · "}
                              {near && a.distanceKm !== undefined ? `${a.distanceKm.toFixed(1)} km` : a.outlet.city}
                              {" · "}RM {a.price}
                            </span>
                          </span>
                        </button>
                        <button
                          onClick={() => toggleStop({ id: a.id, lat: a.outlet.lat, lng: a.outlet.lng, label: a.name, sublabel: `RM ${a.price} · ${a.outlet.city}` })}
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg border text-base font-bold"
                          style={inTrip ? { backgroundColor: "var(--nature-green, #16A34A)", borderColor: "var(--nature-green, #16A34A)", color: "white" } : { borderColor: "var(--border)", color: "var(--primary)" }}
                          aria-label={inTrip ? tCustomer("ui.map.removeFromTrip") : tCustomer("ui.actions.addToTrip")}
                        >
                          {inTrip ? "✓" : "+"}
                        </button>
                      </li>
                    );
                  })}
                  {visibleActivities.length === 0 && <li className="px-1 py-2 text-xs text-muted-foreground">{tCustomer("ui.map.noPlacesRadius")}</li>}
                </ul>
              </div>

              <div className="border-t border-border px-4 pb-4 pt-3">
                {hasRouteInputs && (
                  <p className="mb-2 flex items-center justify-center gap-1.5 text-center text-[12px] font-semibold text-foreground">
                    {mode === "TRANSIT" ? (
                      <span className="text-muted-foreground">{tCustomer("ui.map.transitOpensMaps")}</span>
                    ) : routesLoading ? (
                      <span className="text-muted-foreground">{tCustomer("ui.map.calculatingRoute")}</span>
                    ) : activeRoute ? (
                      <>
                        <span>{travelModeLabel(mode)} · {formatDuration(activeRoute.durationMin)} · {tCustomer("ui.map.distanceKm", { distance: activeRoute.distanceKm })}</span>
                        {activeRoute.hasTolls && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-amber-900" style={{ backgroundColor: "var(--highlight-yellow)" }}>{tCustomer("ui.map.toll")}</span>}
                      </>
                    ) : (
                      <span className="text-muted-foreground">{tCustomer("ui.map.routeUnavailable")}</span>
                    )}
                  </p>
                )}
                <button onClick={handleGetDirections} disabled={!directionsUrl} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white disabled:opacity-40">
                  <Navigation size={16} /> {tCustomer("ui.map.getDirectionsGoogle")}
                </button>
                <div className="mt-2 flex items-center justify-between">
                  <button onClick={() => setUrlPreview((c) => (c ? null : directionsUrl))} className="text-[11px] font-bold text-muted-foreground hover:text-foreground">{urlPreview ? tCustomer("ui.map.hideHandoffUrl") : tCustomer("ui.map.showHandoffUrl")}</button>
                  <button onClick={trip.clear} className="text-[11px] font-bold text-muted-foreground hover:text-destructive">{tCustomer("ui.map.clearTrip")}</button>
                </div>
                {trip.stops.length > 9 && <p className="mt-1.5 text-[11px] font-semibold text-destructive">{tCustomer("ui.map.maxStops")}</p>}
                {urlPreview && (
                  <div className="mt-2 rounded-lg border border-border bg-muted p-2">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--nature-green, #16A34A)" }}>{tCustomer("ui.map.opensNewTab")}</p>
                    <code className="block break-all text-[10.5px] text-foreground">{urlPreview}</code>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

      {/* Right Side: Map */}
      <div className="relative flex-1 bg-muted">
        <MapView
          pins={pins}
          center={center}
          zoom={near ? 12 : 7}
          height="100%"
          cluster
          radiusCenter={near ? [near.lat, near.lng] : undefined}
          radiusKm={near ? radiusKm : undefined}
          onAddStop={toggleStop}
          stopIds={trip.stops.map((s) => s.id)}
          routes={activeRoutes.map((r, i) => ({ path: r.geometry, selected: i === selectedRouteIdx }))}
          routeColor={MODE_STYLE[mode].color}
          routeDashed={MODE_STYLE[mode].dashed}
          focusRequest={focusRequest}
        />
        {/* Radius toggle overlay */}
        {near && (
          <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 gap-1 rounded-full border border-border bg-card p-1 shadow-lg">
            {RADIUS_OPTIONS_KM.map((r) => (
              <button key={r} onClick={() => setRadiusKm(r)} className={`rounded-full px-3 py-1 text-xs font-bold transition ${radiusKm === r ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
                {r} km
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
