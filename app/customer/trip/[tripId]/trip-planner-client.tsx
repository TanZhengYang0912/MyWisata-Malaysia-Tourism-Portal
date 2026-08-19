"use client";

import { useEffect, useRef, useState } from "react";
import { Eye, EyeOff, GripVertical, ImageOff, Loader2, LocateFixed, Navigation, Pencil, Plus, Search, Star, X } from "lucide-react";
import { MapView, type MapPin } from "@/components/map/map-view";
import { CATEGORIES, searchActivities } from "@/backend/domains/catalogue";
import { TRAVEL_MODES, buildGoogleMapsDirectionsUrl, type TravelModeId } from "@/lib/travel-modes";
import { ORS_PROFILE, type GeoHit, type RouteResult } from "@/lib/routing";
import type { ComputedActivity } from "@/backend/core/types";
import type { Trip, TripItem } from "@/backend/domains/trips";
import { getDiscoverySearchFilter } from "@/lib/customer/discovery-categories";
import { groupTripItemsByDay, formatTripDay } from "@/lib/customer/trip-planner";
import { addTripItemAction, deleteTripItemAction, reorderTripItemsAction, updateTripItemLocationAction, updateTripItemScheduleAction } from "../actions";

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
    items,
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
    schedule: async (id: string, scheduledDate: string | null, scheduledTime: string | null) => {
      const previous = items.find((item) => item.id === id);
      setItems((current) => current.map((item) => item.id === id ? { ...item, scheduled_date: scheduledDate, scheduled_time: scheduledTime } : item));
      try {
        await updateTripItemScheduleAction(tripId, id, { scheduled_date: scheduledDate, scheduled_time: scheduledTime });
      } catch {
        if (previous) setItems((current) => current.map((item) => item.id === id ? previous : item));
      }
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

function fmtMin(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}
function fmtShort(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${m}` : `${h}h`;
}

function formatTripRange(trip: Trip) {
  if (!trip.start_date) return "Dates pending";
  const format = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return trip.end_date ? `${format(trip.start_date)} – ${format(trip.end_date)}` : format(trip.start_date);
}

export function MapClient({ tripData, initialItems, initialActivities }: { tripData: Trip; initialItems: TripItem[]; initialActivities: ComputedActivity[] }) {
  const trip = useSyncTrip(tripData.id, initialItems);
  const [category, setCategory] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [activities, setActivities] = useState<ComputedActivity[] | null>(initialActivities);
  const [mode, setMode] = useState<TravelModeId>("DRIVING");
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

  const [dragItemId, setDragItemId] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<"itinerary" | "map" | "places">("itinerary");
  const [listingQuery, setListingQuery] = useState("");
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, origin?.lat, origin?.lng]);

  // Route fetch (debounced): all ORS-supported modes → routes[mode] = options.
  // A route needs at least two points (origin + one more).
  const pointsKey = trip.stops.map((s) => `${s.lat},${s.lng}`).join("|");
  useEffect(() => {
    if (trip.stops.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointsKey]);

  // Real-time geocoding as the user types the start location.
  useEffect(() => {
    if (!editingStart) return;
    const q = startInput.trim();
    if (q.length < 3) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
      setLocError("Location isn't available on this device.");
      return;
    }
    setLocating(true);
    setLocError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        trip.setLocation({ label: "Your location", lat: pos.coords.latitude, lng: pos.coords.longitude, locationKind: "gps" });
        setLocating(false);
        setEditingStart(false);
      },
      () => {
        setLocating(false);
        setLocError("Location access was denied.");
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

  const visibleActivities = near ? (activities ?? []).filter((a) => (a.distanceKm ?? Infinity) <= radiusKm) : activities ?? [];
  const filteredActivities = visibleActivities.filter((activity) => activity.name.toLowerCase().includes(listingQuery.trim().toLowerCase()));
  const groupedItems = groupTripItemsByDay(tripData, trip.items);
  const scheduledItemCount = trip.items.filter((item) => item.scheduled_date).length;
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

  const directionsUrl = buildGoogleMapsDirectionsUrl(origin, trip.stops.slice(1), mode);
  const hasRouteInputs = trip.stops.length >= 2;
  function handleDropOnDay(date: string | null) {
    if (!dragItemId) return;
    const item = trip.items.find((entry) => entry.id === dragItemId);
    if (item) trip.schedule(item.id, date, item.scheduled_time);
    setDragItemId(null);
  }

  function handleDropOnItem(targetId: string) {
    if (!dragItemId || dragItemId === targetId) {
      setDragItemId(null);
      return;
    }
    const from = trip.items.findIndex((item) => item.id === dragItemId);
    const to = trip.items.findIndex((item) => item.id === targetId);
    trip.move(from, to);
    setDragItemId(null);
  }

  function renderStopRow(item: TripItem) {
    const stopNumber = trip.stops.findIndex((stop) => stop.id === item.id) + 1;
    const isLocation = item.source === "location";
    const isCustom = isLocation && item.id !== trip.origin?.id;
    const editing = editingStopId === item.id || (isLocation && editingStart);

    return (
      <li
        key={item.id}
        draggable
        onDragStart={() => setDragItemId(item.id)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => handleDropOnItem(item.id)}
        onDragEnd={() => setDragItemId(null)}
        className={"rounded-xl border bg-card p-2.5 transition " + (dragItemId === item.id ? "opacity-40" : "border-border hover:border-primary/40")}
      >
        {editing ? (
          <div>
            <div className="flex items-center gap-2">
              <GripVertical size={14} className="shrink-0 cursor-grab text-muted-foreground" />
              <input
                autoFocus
                value={isLocation ? startInput : editStopInput}
                onChange={(event) => isLocation ? setStartInput(event.target.value) : setEditStopInput(event.target.value)}
                placeholder="Search a new location…"
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
              <button onClick={() => isLocation ? setEditingStart(false) : setEditingStopId(null)} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Cancel edit">
                <X size={14} />
              </button>
            </div>
            {isLocation ? locationSuggestions() : (
              <div className="mt-2">
                {editStopLoading && <p className="text-xs text-muted-foreground">Searching…</p>}
                {editStopSuggestions.length > 0 && (
                  <ul className="overflow-hidden rounded-lg border border-border bg-card">
                    {editStopSuggestions.map((suggestion, index) => (
                      <li key={suggestion.lat + "," + suggestion.lng + "," + index}>
                        <button onClick={() => chooseStopEditSuggestion(suggestion)} className="flex w-full items-start gap-2 border-b border-border px-3 py-2 text-left text-xs last:border-0 hover:bg-muted">
                          <LocateFixed size={13} className="mt-0.5 shrink-0 text-primary" />
                          <span className="line-clamp-2">{suggestion.label}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <GripVertical size={14} className="shrink-0 cursor-grab text-muted-foreground" />
            <span className={"grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white " + (isLocation ? "bg-[#16A34A]" : "bg-primary")}>{stopNumber > 0 ? stopNumber : "–"}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-foreground">{item.label}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{isLocation ? (item.kind === "gps" ? "Current location" : "Starting point") : item.sublabel || "Added place"}</span>
            </span>
            <input
              type="time"
              value={item.scheduled_time ?? ""}
              onChange={(event) => trip.schedule(item.id, item.scheduled_date, event.target.value || null)}
              aria-label={"Time for " + item.label}
              className="w-[86px] rounded-lg border border-border bg-background px-1.5 py-1 text-[11px] text-foreground"
            />
            {item.scheduled_date && <span className="sr-only">Scheduled for {item.scheduled_date}</span>}
            {(isLocation || isCustom) && (
              <button
                onClick={() => isLocation ? openStartEditor() : openStopEditor({ id: item.id, lat: item.lat, lng: item.lng, label: item.label, sublabel: item.sublabel, source: item.source, locationKind: item.kind })}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                aria-label={"Edit " + item.label}
              >
                <Pencil size={13} />
              </button>
            )}
            <button onClick={() => trip.remove(item.id)} className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={"Remove " + item.label}>
              <X size={14} />
            </button>
          </div>
        )}
      </li>
    );
  }

  function renderDaySection(title: string, date: string | null, items: TripItem[], emptyCopy: string) {
    return (
      <section
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => handleDropOnDay(date)}
        className="rounded-2xl border border-border bg-muted/35 p-3"
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-primary">{title}</h2>
            {date && <p className="mt-0.5 text-[11px] text-muted-foreground">{formatTripDay(date)}</p>}
          </div>
          <span className="rounded-full bg-background px-2 py-1 text-[10px] font-bold text-muted-foreground">{items.length} {items.length === 1 ? "stop" : "stops"}</span>
        </div>
        {items.length > 0 ? <ul className="flex flex-col gap-2">{items.map(renderStopRow)}</ul> : <p className="rounded-xl border border-dashed border-border bg-background/70 px-3 py-3 text-center text-xs text-muted-foreground">{emptyCopy}</p>}
      </section>
    );
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] w-full flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 gap-1 border-b border-border bg-card p-2 md:hidden" aria-label="Planner views">
        {(["itinerary", "map", "places"] as const).map((panel) => (
          <button key={panel} onClick={() => setActivePanel(panel)} className={"flex-1 rounded-lg px-3 py-2 text-xs font-bold capitalize " + (activePanel === panel ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted")}>
            {panel === "places" ? "Add places" : panel}
          </button>
        ))}
      </div>

      <div className="grid min-h-0 flex-1 md:grid-cols-[360px_minmax(0,1fr)_360px]">
        <aside aria-label="Trip itinerary" className={(activePanel === "itinerary" ? "flex" : "hidden") + " min-h-0 flex-col border-r border-border bg-card md:flex"}>
          <header className="shrink-0 border-b border-border px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Trip planner</p>
                <h1 className="mt-1 truncate text-lg font-bold text-foreground">{tripData.name}</h1>
                <p className="mt-1 text-xs text-muted-foreground">{formatTripRange(tripData)}</p>
              </div>
              <span className="shrink-0 rounded-full bg-secondary px-2 py-1 text-[10px] font-bold text-primary">{scheduledItemCount}/{trip.items.length} planned</span>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-foreground">Build your route</p>
              <button type="button" onClick={() => setShowAllVendors((value) => !value)} aria-pressed={showAllVendors} className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-primary">
                {showAllVendors ? <Eye size={13} className="text-primary" /> : <EyeOff size={13} />}
                {showAllVendors ? "Map vendors on" : "Map vendors"}
              </button>
            </div>

            {!locationStop && (
              <div className="mb-3 rounded-2xl border border-dashed border-primary/30 bg-secondary/60 p-3">
                <div className="flex items-center gap-2">
                  <LocateFixed size={16} className="shrink-0 text-primary" />
                  {editingStart ? <input autoFocus value={startInput} onChange={(event) => setStartInput(event.target.value)} placeholder="Type your starting point" className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary" /> : <span className="min-w-0 flex-1"><span className="block text-xs font-bold">Add your starting point</span><span className="block text-[11px] text-muted-foreground">Type a place or use GPS</span></span>}
                  <button onClick={() => editingStart ? setEditingStart(false) : openStartEditor()} className="rounded-lg p-1 text-muted-foreground hover:bg-background" aria-label="Type a starting point">{editingStart ? <X size={14} /> : <Pencil size={14} />}</button>
                  <button onClick={useGps} disabled={locating} className="rounded-lg p-1 text-primary hover:bg-background disabled:opacity-50" aria-label="Use current location">{locating ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={14} />}</button>
                </div>
                {editingStart && locationSuggestions()}
                {locError && <p className="mt-1 text-xs text-destructive">{locError}</p>}
              </div>
            )}

            <div className="space-y-3">
              {groupedItems.days.length > 0 ? groupedItems.days.map((day, index) => renderDaySection("Day " + (index + 1), day.date, day.items, "Drop a stop here or add one from the right panel.")) : renderDaySection("Plan your days", null, groupedItems.unscheduled, "Add places from the right panel to start planning.")}
              {groupedItems.days.length > 0 && renderDaySection("Unscheduled", null, groupedItems.unscheduled, "All your places are assigned to a day.")}
            </div>

            <div className="mt-3">
              {addingStop ? (
                <div className="rounded-2xl border border-border bg-muted p-3">
                  <div className="flex items-center gap-2">
                    <Search size={14} className="text-muted-foreground" />
                    <input autoFocus value={stopSearchInput} onChange={(event) => setStopSearchInput(event.target.value)} placeholder="Search an address to add" className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary" />
                    <button onClick={() => { setAddingStop(false); setStopSearchInput(""); setStopSuggestions([]); }} className="rounded-lg p-1 text-muted-foreground hover:bg-background" aria-label="Cancel add stop"><X size={14} /></button>
                  </div>
                  {stopSearchLoading && <p className="mt-2 text-xs text-muted-foreground">Searching…</p>}
                  {stopSuggestions.length > 0 && <ul className="mt-2 overflow-hidden rounded-lg border border-border bg-card">{stopSuggestions.map((suggestion, index) => <li key={suggestion.lat + "," + suggestion.lng + "," + index}><button onClick={() => chooseStopSuggestion(suggestion)} className="flex w-full items-start gap-2 border-b border-border px-3 py-2 text-left text-xs last:border-0 hover:bg-muted"><LocateFixed size={13} className="mt-0.5 shrink-0 text-primary" /><span className="line-clamp-2">{suggestion.label}</span></button></li>)}</ul>}
                </div>
              ) : <button onClick={() => setAddingStop(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-xs font-bold text-muted-foreground hover:border-primary hover:text-primary"><Plus size={14} /> Add a custom place</button>}
            </div>
          </div>

          <footer className="shrink-0 border-t border-border bg-card p-3">
            <div className="mb-2 grid grid-cols-4 gap-1.5">
              {TRAVEL_MODES.map((travelMode) => {
                const supported = Boolean(ORS_PROFILE[travelMode.id]);
                const best = routes[travelMode.id]?.[0];
                return <button key={travelMode.id} onClick={() => setMode(travelMode.id)} className="flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-[10px] font-bold" style={{ borderColor: mode === travelMode.id ? "var(--travel-blue)" : "var(--border)", backgroundColor: mode === travelMode.id ? "var(--travel-blue)" : "transparent", color: mode === travelMode.id ? "white" : "var(--foreground)" }}><span className="flex items-center gap-1"><travelMode.icon size={12} />{travelMode.label}</span><span className="text-[9px] opacity-80">{!hasRouteInputs ? "" : !supported ? "Maps" : routesLoading ? "…" : best ? fmtShort(best.durationMin) : "—"}</span></button>;
              })}
            </div>
            {activeRoutes.length > 1 && (
              <div className="mb-2 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Route options</p>
                {activeRoutes.map((route, index) => (
                  <button key={index} onClick={() => setSelectedRouteIdx(index)} className="flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-[11px]" style={{ borderColor: index === selectedRouteIdx ? "var(--travel-blue)" : "var(--border)", backgroundColor: index === selectedRouteIdx ? "var(--secondary, #dbe6ff)" : "transparent" }}>
                    <span className="font-bold">{fmtMin(route.durationMin)} <span className="font-semibold text-muted-foreground">· {route.distanceKm} km</span></span>
                    <span className="flex items-center gap-1">{index === 0 && <span className="rounded-full bg-nature-green/10 px-1.5 py-0.5 text-[9px] font-bold text-[#16A34A]">Fastest</span>}{route.hasTolls && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-900">Toll</span>}</span>
                  </button>
                ))}
              </div>
            )}
            {hasRouteInputs && <p className="mb-2 text-center text-[11px] font-semibold text-foreground">{mode === "TRANSIT" ? "Transit route opens in Google Maps" : routesLoading ? "Calculating route…" : activeRoute ? (TRAVEL_MODES.find((travelMode) => travelMode.id === mode)?.label + " · " + fmtMin(activeRoute.durationMin) + " · " + activeRoute.distanceKm + " km") : "Route unavailable for this mode"}</p>}
            <button onClick={() => directionsUrl && window.open(directionsUrl, "_blank")} disabled={!directionsUrl} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-bold text-white disabled:opacity-40"><Navigation size={14} /> Get directions</button>
            <div className="mt-2 flex items-center justify-between"><button onClick={() => setUrlPreview((current) => current ? null : directionsUrl)} className="text-[10px] font-bold text-muted-foreground hover:text-foreground">{urlPreview ? "Hide" : "Show"} handoff URL</button><button onClick={trip.clear} className="text-[10px] font-bold text-muted-foreground hover:text-destructive">Clear trip</button></div>
            {trip.stops.length > 9 && <p className="mt-1 text-[10px] font-semibold text-destructive">Google Maps supports up to 9 stops.</p>}
            {urlPreview && <code className="mt-2 block max-h-16 overflow-auto break-all rounded-lg bg-muted p-2 text-[10px]">{urlPreview}</code>}
          </footer>
        </aside>

        <main aria-label="Trip map" className={(activePanel === "map" ? "flex" : "hidden") + " relative min-h-0 bg-muted md:flex"}>
          <MapView pins={pins} center={center} zoom={near ? 12 : 7} height="100%" cluster radiusCenter={near ? [near.lat, near.lng] : undefined} radiusKm={near ? radiusKm : undefined} onAddStop={toggleStop} stopIds={trip.stops.map((stop) => stop.id)} routes={activeRoutes.map((route, index) => ({ path: route.geometry, selected: index === selectedRouteIdx }))} routeColor={MODE_STYLE[mode].color} routeDashed={MODE_STYLE[mode].dashed} focusRequest={focusRequest} />
          {near && <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-1 rounded-full border border-border bg-card p-1 shadow-lg">{RADIUS_OPTIONS_KM.map((radius) => <button key={radius} onClick={() => setRadiusKm(radius)} className={"rounded-full px-3 py-1 text-[11px] font-bold " + (radiusKm === radius ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted")}>{radius} km</button>)}</div>}
        </main>

        <aside aria-label="Places to add" className={(activePanel === "places" ? "flex" : "hidden") + " min-h-0 flex-col border-l border-border bg-card md:flex"}>
          <header className="shrink-0 border-b border-border px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Discover nearby</p>
            <div className="mt-1 flex items-end justify-between gap-2"><div><h2 className="text-lg font-bold text-foreground">Add places</h2><p className="mt-1 text-xs text-muted-foreground">{filteredActivities.length} places ready to add</p></div><button type="button" onClick={() => setShowAllVendors((value) => !value)} aria-pressed={showAllVendors} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-primary" title="Toggle vendor pins">{showAllVendors ? <Eye size={16} /> : <EyeOff size={16} />}</button></div>
            <label className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 focus-within:border-primary"><Search size={15} className="text-muted-foreground" /><span className="sr-only">Search places</span><input value={listingQuery} onChange={(event) => setListingQuery(event.target.value)} placeholder="Search places or experiences" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></label>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2"><label className="sr-only" htmlFor="planner-category">Category</label><select id="planner-category" value={category ?? ""} onChange={(event) => setCategory(event.target.value || null)} className="rounded-lg border border-border bg-background px-2 py-2 text-xs font-semibold outline-none focus:border-primary"><option value="">All categories</option>{CATEGORIES.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}</select><label className="sr-only" htmlFor="planner-radius">Distance</label><select id="planner-radius" value={radiusKm} onChange={(event) => setRadiusKm(Number(event.target.value))} className="rounded-lg border border-border bg-background px-2 py-2 text-xs font-semibold outline-none focus:border-primary">{RADIUS_OPTIONS_KM.map((radius) => <option key={radius} value={radius}>{radius} km</option>)}</select></div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <ul className="flex flex-col gap-2">
              {filteredActivities.slice(0, 24).map((activity) => {
                const added = trip.has(activity.id);
                // eslint-disable-next-line @next/next/no-img-element
                return <li key={activity.id} className={"rounded-2xl border p-2.5 transition " + (added ? "border-[#16A34A]/40 bg-[#16A34A]/5" : "border-border hover:border-primary/40")}><div className="flex gap-2.5"><button type="button" onClick={() => focusPin({ id: activity.id, lat: activity.outlet.lat, lng: activity.outlet.lng, label: activity.name, sublabel: "RM " + activity.price + " · " + activity.outlet.city, href: "/customer/activity/" + activity.id })} className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-secondary" aria-label={"Show " + activity.name + " on map"}>{activity.image ? <img src={activity.image} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-muted-foreground"><ImageOff size={17} /></span>}</button><div className="min-w-0 flex-1"><h3 className="truncate text-xs font-bold text-foreground">{activity.name}</h3><p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><Star size={10} fill="var(--highlight-yellow)" stroke="none" /> {activity.rating} · {near && activity.distanceKm !== undefined ? activity.distanceKm.toFixed(1) + " km" : activity.outlet.city} · RM {activity.price}</p><div className="mt-2 flex items-center gap-2"><button onClick={() => toggleStop({ id: activity.id, lat: activity.outlet.lat, lng: activity.outlet.lng, label: activity.name, sublabel: "RM " + activity.price + " · " + activity.outlet.city })} className={"rounded-lg px-2.5 py-1 text-[11px] font-bold " + (added ? "bg-[#16A34A] text-white" : "bg-primary text-white")}>{added ? "Added" : "Add to trip"}</button><a href={"/customer/activity/" + activity.id} className="text-[11px] font-semibold text-muted-foreground hover:text-primary">View details</a></div></div></div></li>;
              })}
            </ul>
            {filteredActivities.length === 0 && <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center"><Search size={22} className="mx-auto mb-2 text-muted-foreground" /><p className="text-xs font-bold text-foreground">No places found</p><p className="mt-1 text-[11px] text-muted-foreground">Try a different search or widen the distance.</p></div>}
            {filteredActivities.length > 24 && <p className="mt-3 text-center text-[11px] text-muted-foreground">Showing the first 24 matches. Refine your search to see more.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}
