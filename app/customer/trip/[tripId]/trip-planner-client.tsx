"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Eye, EyeOff, GripVertical, ImageOff, Loader2, LocateFixed, Navigation, Pencil, Plus, Search, SlidersHorizontal, Star, X } from "lucide-react";
import { MapView, type MapPin } from "@/components/map/map-view";
import { CustomerPageShell, CustomerPageTitle } from "@/components/customer/customer-page-shell";
import { DirectoryPagination } from "@/components/customer/directory-pagination";
import { CATEGORIES, searchActivities } from "@/backend/domains/catalogue";
import { TRAVEL_MODES, buildGoogleMapsDirectionsUrl, type TravelModeId } from "@/lib/travel-modes";
import { ORS_PROFILE, buildRouteDepartureTime, type GeoHit, type RouteResult } from "@/lib/routing";
import type { ComputedActivity, SponsoredPlacement } from "@/backend/core/types";
import type { Trip, TripItem } from "@/backend/domains/trips";
import { getTripItemTimeBounds, groupTripItemsByDay, formatTripDay, isValidTripCoordinate } from "@/lib/customer/trip-planner";
import { addTripItemAction, deleteTripItemAction, reorderTripItemsAction, updateTripItemLocationAction, updateTripItemScheduleAction } from "../actions";
import { DISTANCE_UNIT_KM } from "@/lib/i18n/invariant-tokens";
import { formatMYR } from "@/lib/i18n/format";
import Link from "next/link";
import { useAppDialog } from "@/components/providers/app-dialog";
import { buildItineraryWeatherPlan } from "@/lib/weather/itinerary";
import { useItineraryWeather } from "./use-itinerary-weather";
import { TripWeatherHint, TripWeatherItemMarker } from "./trip-weather-hint";
import { TripWeatherMapOverlay } from "./trip-weather-map-overlay";
import { useWeatherOverlay } from "./use-weather-overlay";
import { useWeatherRadar } from "./use-weather-radar";
import { canUseLiveRadar, defaultOverlayHour } from "@/lib/weather/overlay-time";
import type { WeatherMapMode } from "@/lib/weather/types";
import { TripPlaceFilterPanel } from "./trip-place-filter-panel";
import { DEFAULT_TRIP_PLACE_FILTERS, countActiveTripPlaceFilters, filterAndRankTripPlaces, type TripPlaceFilters } from "./trip-place-discovery";
import { buildSimulatedWeatherOverlay, buildSimulatedWeatherResult, simulatedWeatherConditionKeyForHour } from "./trip-weather-simulation";

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
  const { alert } = useAppDialog();
  const { t } = useTranslation("customer");
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
    add: async (stop: Omit<TripStop, "id"> & { id?: string }, schedule?: { date: string | null; time?: string | null }) => {
      const tempId = stop.id || ("temp-" + Date.now());
      const newItem: TripItem = {
        id: tempId,
        trip_id: tripId,
        experience_id: stop.source === "vendor" ? tempId : null,
        sequence: items.length,
        scheduled_date: schedule?.date ?? null,
        scheduled_time: schedule?.time ?? null,
        created_at: new Date().toISOString(),
        source: stop.source,
        kind: stop.locationKind,
        lat: stop.lat,
        lng: stop.lng,
        label: stop.label,
        sublabel: stop.sublabel
      };
      setItems(prev => [...prev, newItem]);
      try {
        const stored = await addTripItemAction({
          trip_id: tripId,
          experience_id: stop.source === "vendor" ? stop.id : undefined,
          source: stop.source,
          kind: stop.locationKind,
          lat: stop.lat,
          lng: stop.lng,
          label: stop.label,
          sublabel: stop.sublabel,
          scheduled_date: schedule?.date ?? null,
          scheduled_time: schedule?.time ?? null,
        });
        setItems((current) => current.map((item) => item.id === tempId ? stored : item));
        return stored;
      } catch {
        setItems((current) => current.filter((item) => item.id !== tempId));
        await alert(t("strictMigration.tripPlanner.addFailed"));
        throw new Error("Unable to add trip item");
      }
    },
    remove: async (id: string) => {
      setItems(prev => prev.filter(i => i.id !== id && i.experience_id !== id));
      const target = items.find(i => i.id === id || i.experience_id === id);
      if (target) await deleteTripItemAction(tripId, target.id);
    },
    move: async (from: number, to: number) => {
      const previousItems = items;
      const newItems = [...items];
      const [moved] = newItems.splice(from, 1);
      newItems.splice(to, 0, moved);
      setItems(newItems);
      try {
        await reorderTripItemsAction(tripId, newItems.map(i => i.id));
      } catch {
        setItems(previousItems);
        await alert(t("strictMigration.tripPlanner.scheduleFailed"));
      }
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
        await alert(t("strictMigration.tripPlanner.scheduleFailed"));
      }
    },
    clear: async () => {
      // not implemented for db for safety, just stub
      await alert(t("ui.trip.deleteFromTripHub"));
    }
  };
}

const KL_CENTER: [number, number] = [3.139, 101.6869];
const ROUTE_TRAFFIC_REFRESH_MS = 5 * 60 * 1000;
const TRIP_DAYS_PAGE_SIZE = 5;
const PLACES_PAGE_SIZE = 15;

const MODE_STYLE: Record<TravelModeId, { color: string; dashed?: boolean }> = {
  DRIVING: { color: "#2563EB" },
  WALKING: { color: "#64748b", dashed: true },
  BICYCLING: { color: "#16A34A" },
  TRANSIT: { color: "#010066" },
};

function formatTripRange(trip: Trip) {
  if (!trip.start_date) return "Dates pending";
  const format = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return trip.end_date ? `${format(trip.start_date)} – ${format(trip.end_date)}` : format(trip.start_date);
}

export function MapClient({
  tripData,
  initialItems,
  initialActivities,
  sponsoredPlacements,
  suggestedAtByVendor,
}: {
  tripData: Trip;
  initialItems: TripItem[];
  initialActivities: ComputedActivity[];
  sponsoredPlacements: SponsoredPlacement[];
  suggestedAtByVendor: Record<string, string>;
}) {
  const trip = useSyncTrip(tripData.id, initialItems);
  const { t: tCustomer } = useTranslation("customer");
  const [placeFilters, setPlaceFilters] = useState<TripPlaceFilters>(DEFAULT_TRIP_PLACE_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  const [routeRefreshTick, setRouteRefreshTick] = useState(0);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);

  const [dragPayload, setDragPayload] = useState<{ kind: "item"; itemId: string } | { kind: "catalogue"; activityId: string } | null>(null);
  const [activePanel, setActivePanel] = useState<"itinerary" | "map" | "places">("itinerary");
  const [itineraryCollapsed, setItineraryCollapsed] = useState(false);
  const [placesCollapsed, setPlacesCollapsed] = useState(false);
  const [dayPage, setDayPage] = useState(1);
  const [placesPage, setPlacesPage] = useState(1);
  const [focusRequest, setFocusRequest] = useState<{ pin: MapPin; token: number } | null>(null);
  const focusTokenRef = useRef(0);
  const [selectedDate, setSelectedDate] = useState<string | null>(tripData.start_date);
  const [overlayHour, setOverlayHour] = useState(12);
  const [weatherNow, setWeatherNow] = useState(() => new Date());
  const [weatherMapMode, setWeatherMapMode] = useState<WeatherMapMode>(() => canUseLiveRadar(tripData.start_date, weatherNow) ? "now" : "forecast");
  const [weatherLayerEnabled, setWeatherLayerEnabled] = useState(true);
  const simulationAvailable = process.env.NODE_ENV !== "production";
  const [simulationEnabled, setSimulationEnabled] = useState(false);
  const simulationActive = simulationAvailable && simulationEnabled;
  const [mapMoving, setMapMoving] = useState(false);
  const requestedOverlayHourRef = useRef<{ date: string; hour: number } | null>(null);
  const [discoveryNow] = useState(() => new Date().toISOString());
  const impressedPlacementIdsRef = useRef(new Set<string>());

  const desktopGridClass = itineraryCollapsed
    ? placesCollapsed
      ? "md:grid-cols-[52px_minmax(0,1fr)_52px]"
      : "md:grid-cols-[52px_minmax(0,1fr)_360px]"
    : placesCollapsed
      ? "md:grid-cols-[360px_minmax(0,1fr)_52px]"
      : "md:grid-cols-[360px_minmax(0,1fr)_360px]";

  useEffect(() => {
    if (!selectedDate) return;
    const requestedHour = requestedOverlayHourRef.current;
    requestedOverlayHourRef.current = null;
    if (requestedHour?.date === selectedDate) {
      setOverlayHour(requestedHour.hour);
      return;
    }
    const scheduledTimes = initialItems.filter((item) => item.scheduled_date === selectedDate).map((item) => item.scheduled_time);
    setOverlayHour(defaultOverlayHour({ date: selectedDate, scheduledTimes, now: new Date() }));
  }, [initialItems, selectedDate]);

  useEffect(() => {
    const current = new Date();
    const timer = window.setTimeout(() => setWeatherMapMode(canUseLiveRadar(selectedDate, current) ? "now" : "forecast"), 0);
    return () => window.clearTimeout(timer);
  }, [selectedDate]);

  useEffect(() => {
    const interval = window.setInterval(() => setWeatherNow(new Date()), 60_000);
    return () => window.clearInterval(interval);
  }, []);

  const liveRadarAvailable = canUseLiveRadar(selectedDate, weatherNow);
  const activeWeatherMapMode: WeatherMapMode = simulationActive ? "forecast" : weatherMapMode === "now" && !liveRadarAvailable ? "forecast" : weatherMapMode;

  // Route origin = the top item of the unified stop list.
  const origin = trip.origin && isValidTripCoordinate(trip.origin.lat, trip.origin.lng) ? trip.origin : null;
  const near = origin ? { lat: origin.lat, lng: origin.lng } : undefined;
  const hasOrigin = origin !== null;
  const selectedRouteStops = useMemo(() => {
    const datedStops = trip.items
      .filter((item) => item.scheduled_date === selectedDate && item.id !== origin?.id && isValidTripCoordinate(item.lat, item.lng))
      .sort((a, b) => a.sequence - b.sequence)
      .map((item): TripStop => ({ id: item.id, lat: item.lat, lng: item.lng, label: item.label, sublabel: item.sublabel, source: item.source, locationKind: item.kind }));
    return origin ? [origin, ...datedStops] : datedStops;
  }, [origin, selectedDate, trip.items]);

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (!near) return;
    }
    searchActivities({ category: null, near, sort: near ? "distance_asc" : "recommended" }).then(setActivities);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin?.lat, origin?.lng]);

  // Route fetch (debounced): all ORS-supported modes → routes[mode] = options.
  // A route needs at least two points (origin + one more).
  const pointsKey = selectedRouteStops.map((s) => `${s.lat},${s.lng}`).join("|");
  const routeDepartureTime = buildRouteDepartureTime(
    selectedDate,
    trip.items.filter((item) => item.scheduled_date === selectedDate).map((item) => item.scheduled_time),
  );
  useEffect(() => {
    if (selectedRouteStops.length < 2) return;
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") setRouteRefreshTick((current) => current + 1);
    }, ROUTE_TRAFFIC_REFRESH_MS);
    return () => window.clearInterval(interval);
  }, [pointsKey, selectedRouteStops.length]);
  const routeRequestKey = `${pointsKey}|${routeDepartureTime ?? "live"}|${routeRefreshTick}`;
  useEffect(() => {
    if (selectedRouteStops.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRoutes({});
      setRoutesLoading(false);
      return;
    }
    const points: [number, number][] = selectedRouteStops.map((s): [number, number] => [s.lat, s.lng]);
    let cancelled = false;
    setRoutesLoading(true);
    setSelectedRouteIdx(0);
    const timer = setTimeout(async () => {
      const supported = TRAVEL_MODES.filter((m) => ORS_PROFILE[m.id]);
      const entries = await Promise.all(
        supported.map(async (m) => {
          try {
            const res = await fetch("/api/route", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: m.id, points, departureTime: routeDepartureTime }) });
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
  }, [routeRequestKey]);

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

  function patchPlaceFilters(patch: Partial<TripPlaceFilters>) {
    setPlaceFilters((current) => ({ ...current, ...patch }));
    setPlacesPage(1);
  }

  function clearPlaceFilters() {
    setPlaceFilters(DEFAULT_TRIP_PLACE_FILTERS);
    setPlacesPage(1);
  }

  function recordSponsoredEvent(placementId: string, eventType: "impression" | "click", productId: string) {
    void fetch(`/api/sponsored-placements/${placementId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType, productId }),
    }).catch(() => undefined);
  }

  // Geocode dropdown for the location editor — shared by the "no location yet"
  // placeholder and the location row's inline edit form.
  function locationSuggestions() {
    return (
      <div className="mt-1.5">
        {geoLoading && <p className="px-1 py-1 text-[11px] text-muted-foreground">{tCustomer("ui.map.searching")}</p>}
        {!geoLoading && startInput.trim().length >= 3 && suggestions.length === 0 && <p className="px-1 py-1 text-[11px] text-muted-foreground">{tCustomer("ui.map.noMatches")}</p>}
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

  const filteredActivities = useMemo(() => filterAndRankTripPlaces({
    activities: activities ?? [],
    filters: placeFilters,
    hasOrigin,
    placements: sponsoredPlacements,
    suggestedAtByVendor,
    now: discoveryNow,
  }), [activities, discoveryNow, hasOrigin, placeFilters, sponsoredPlacements, suggestedAtByVendor]);
  const activePlaceFilterCount = countActiveTripPlaceFilters(placeFilters);
  const groupedItems = useMemo(
    () => groupTripItemsByDay(tripData, trip.items),
    [trip.items, tripData],
  );
  const dayTotalPages = Math.max(1, Math.ceil(groupedItems.days.length / TRIP_DAYS_PAGE_SIZE));
  const safeDayPage = Math.min(dayPage, dayTotalPages);
  const dayPageStart = (safeDayPage - 1) * TRIP_DAYS_PAGE_SIZE;
  const visibleDays = groupedItems.days.slice(dayPageStart, dayPageStart + TRIP_DAYS_PAGE_SIZE);
  const placesTotalPages = Math.max(1, Math.ceil(filteredActivities.length / PLACES_PAGE_SIZE));
  const safePlacesPage = Math.min(placesPage, placesTotalPages);
  const placesPageStart = (safePlacesPage - 1) * PLACES_PAGE_SIZE;
  const visibleActivitiesPage = filteredActivities.slice(placesPageStart, placesPageStart + PLACES_PAGE_SIZE);
  useEffect(() => {
    for (const activity of visibleActivitiesPage) {
      const placementId = activity.sponsorship?.placementId;
      if (!placementId || impressedPlacementIdsRef.current.has(placementId)) continue;
      impressedPlacementIdsRef.current.add(placementId);
      void fetch(`/api/sponsored-placements/${placementId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: "impression", productId: activity.id }),
      }).catch(() => undefined);
    }
  }, [visibleActivitiesPage]);
  const activitiesById = useMemo(
    () => new Map([...initialActivities, ...(activities ?? [])].map((activity) => [activity.id, activity])),
    [activities, initialActivities],
  );
  const weatherPlan = useMemo(
    () => buildItineraryWeatherPlan(groupedItems.days, activitiesById),
    [activitiesById, groupedItems.days],
  );
  const weatherState = useItineraryWeather(tripData.id, weatherPlan.targets);
  const simulatedWeatherResult = simulationActive && selectedDate
    ? buildSimulatedWeatherResult(selectedDate, overlayHour)
    : null;
  const simulationAnchor = selectedRouteStops[0] ?? null;
  const simulatedWeatherOverlay = useMemo(() => (
    simulationActive && selectedDate && simulationAnchor
      ? buildSimulatedWeatherOverlay(selectedDate, overlayHour, simulationAnchor)
      : null
  ), [overlayHour, selectedDate, simulationActive, simulationAnchor]);
  const overlayState = useWeatherOverlay(
    tripData.id,
    selectedDate,
    overlayHour,
    weatherLayerEnabled && activeWeatherMapMode === "forecast" && !simulationActive,
    selectedRouteStops.length > 0,
  );
  const displayedWeatherOverlay = simulationActive ? simulatedWeatherOverlay : overlayState.result;
  const displayedWeatherOverlayStatus = simulationActive
    ? simulatedWeatherOverlay ? "ready" as const : "missing_coordinates" as const
    : overlayState.status;
  const radarState = useWeatherRadar(tripData.id, weatherLayerEnabled && activeWeatherMapMode === "now" && liveRadarAvailable);
  const weatherTargetsByKey = useMemo(
    () => new Map(weatherPlan.targets.map((target) => [target.key, target])),
    [weatherPlan.targets],
  );
  const scheduledItemCount = trip.items.filter((item) => item.scheduled_date).length;
  const center: [number, number] = near ? [near.lat, near.lng] : KL_CENTER;
  // Trip-stop pins always render (numbered markers matching the list order);
  // vendor "browse to add" pins are opt-in via showAllVendors, off by default so
  // the map doesn't get cluttered once a trip actually has stops.
  const stopIdSet = new Set(trip.stops.map((s) => s.id));
  const stopPins: MapPin[] = selectedRouteStops.map((s, index) => {
    const activity = activitiesById.get(s.id) ?? (s.source === "vendor" ? activitiesById.get(trip.items.find((item) => item.id === s.id)?.experience_id ?? "") : undefined);
    return { id: s.id, lat: s.lat, lng: s.lng, label: s.label, sublabel: s.sublabel, imageUrl: activity?.image, order: index + 1 };
  });
  const vendorPins: MapPin[] = showAllVendors
    ? filteredActivities.filter((a) => !stopIdSet.has(a.id)).map((a) => ({ id: a.id, lat: a.outlet.lat, lng: a.outlet.lng, label: a.name, sublabel: `${formatMYR(Number(a.price))} · ${a.outlet.city}`, href: `/customer/activity/${a.id}`, imageUrl: a.image }))
    : [];
  const pins: MapPin[] = [...stopPins, ...vendorPins];

  const directionsUrl = buildGoogleMapsDirectionsUrl(origin, selectedRouteStops.filter((stop) => stop.id !== origin?.id), mode);
  const hasRouteInputs = selectedRouteStops.length >= 2;
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
  function travelModeLabel(id: TravelModeId) {
    return tCustomer(`ui.map.travelModes.${id.toLowerCase()}`);
  }
  function activityStop(activity: ComputedActivity): Omit<TripStop, "id"> & { id: string } {
    return { id: activity.id, lat: activity.outlet.lat, lng: activity.outlet.lng, label: activity.name, sublabel: `${formatMYR(Number(activity.price))} · ${activity.outlet.city}`, source: "vendor" };
  }

  function chooseDayForActivity(activity: ComputedActivity, date: string) {
    if (!trip.has(activity.id)) trip.add(activityStop(activity), { date });
    setSelectedDate(date);
    showDatePage(date);
  }

  function showDatePage(date: string) {
    const index = groupedItems.days.findIndex((day) => day.date === date);
    if (index >= 0) setDayPage(Math.floor(index / TRIP_DAYS_PAGE_SIZE) + 1);
  }

  function handleSelectWeatherRiskHour(date: string, hour: number) {
    requestedOverlayHourRef.current = { date, hour };
    setSelectedDate(date);
    showDatePage(date);
    setWeatherLayerEnabled(true);
    setWeatherMapMode("forecast");
    setOverlayHour(hour);
    setActivePanel("map");
  }

  function handleDropOnDay(date: string | null) {
    if (!dragPayload) return;
    if (dragPayload.kind === "item") {
      const item = trip.items.find((entry) => entry.id === dragPayload.itemId);
      if (item) trip.schedule(item.id, date, item.scheduled_time);
    } else {
      const activity = activitiesById.get(dragPayload.activityId);
      if (activity && !trip.has(activity.id)) trip.add(activityStop(activity), { date });
    }
    if (date) setSelectedDate(date);
    setDragPayload(null);
  }

  function handleDropOnItem(targetId: string) {
    if (!dragPayload || dragPayload.kind !== "item" || dragPayload.itemId === targetId) {
      setDragPayload(null);
      return;
    }
    const from = trip.items.findIndex((item) => item.id === dragPayload.itemId);
    const to = trip.items.findIndex((item) => item.id === targetId);
    trip.move(from, to);
    setDragPayload(null);
  }

  function renderStopRow(item: TripItem) {
    const stopNumber = selectedRouteStops.findIndex((stop) => stop.id === item.id) + 1;
    const isLocation = item.source === "location";
    const isCustom = isLocation && item.id !== trip.origin?.id;
    const editing = editingStopId === item.id || (isLocation && editingStart);
    const weatherTargetKey = weatherPlan.itemTargetKeyById[item.id];
    const weatherResult = weatherTargetKey ? weatherState.results[weatherTargetKey] ?? null : null;
    const activity = activitiesById.get(item.experience_id ?? item.id);
    const timeBounds = getTripItemTimeBounds(trip.items, item.id);

    return (
      <li
        key={item.id}
        draggable
        onDragStart={() => setDragPayload({ kind: "item", itemId: item.id })}
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => handleDropOnItem(item.id)}
        onDragEnd={() => setDragPayload(null)}
        className={"rounded-xl border bg-card p-2.5 transition " + (dragPayload?.kind === "item" && dragPayload.itemId === item.id ? "opacity-40" : "border-border hover:border-primary/40")}
      >
        {editing ? (
          <div>
            <div className="flex items-center gap-2">
              <GripVertical size={14} className="shrink-0 cursor-grab text-muted-foreground" />
              <input
                autoFocus
                value={isLocation ? startInput : editStopInput}
                onChange={(event) => isLocation ? setStartInput(event.target.value) : setEditStopInput(event.target.value)}
                placeholder={tCustomer("strictMigration.tripPlanner.searchNewLocation")}
                className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
              <button onClick={() => isLocation ? setEditingStart(false) : setEditingStopId(null)} className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label={tCustomer("ui.map.cancelEdit")}>
                <X size={14} />
              </button>
            </div>
            {isLocation ? locationSuggestions() : (
              <div className="mt-2">
                {editStopLoading && <p className="text-xs text-muted-foreground">{tCustomer("ui.map.searching")}</p>}
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
            {activity?.image ? <span data-itinerary-image={item.id} className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl bg-secondary">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={activity.image} alt="" className="h-full w-full object-cover" /><b className="absolute bottom-0.5 left-0.5 grid h-4 min-w-4 place-items-center rounded-full border border-white bg-primary px-0.5 text-[8px] text-white">{stopNumber > 0 ? stopNumber : "–"}</b></span> : <span className={"grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white " + (isLocation ? "bg-[#16A34A]" : "bg-primary")}>{stopNumber > 0 ? stopNumber : "–"}</span>}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold text-foreground">{item.label}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{isLocation ? (item.kind === "gps" ? tCustomer("ui.map.currentLocation") : tCustomer("ui.map.customStart")) : item.sublabel || tCustomer("ui.map.addPlace")}</span>
              <TripWeatherItemMarker result={weatherResult} />
            </span>
            <input
              type="time"
              value={item.scheduled_time ?? ""}
              min={timeBounds.min}
              max={timeBounds.max}
              disabled={timeBounds.disabled}
              onChange={(event) => trip.schedule(item.id, item.scheduled_date, event.target.value || null)}
              aria-label={tCustomer("strictMigration.tripPlanner.timeFor", { item: item.label })}
              className="w-[86px] rounded-lg border border-border bg-background px-1.5 py-1 text-[11px] text-foreground"
            />
            {item.scheduled_date && <span className="sr-only">{tCustomer("strictMigration.tripPlanner.scheduledFor", { date: item.scheduled_date })}</span>}
            {(isLocation || isCustom) && (
              <button
                onClick={() => isLocation ? openStartEditor() : openStopEditor({ id: item.id, lat: item.lat, lng: item.lng, label: item.label, sublabel: item.sublabel, source: item.source, locationKind: item.kind })}
                className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-primary"
                aria-label={tCustomer("strictMigration.tripPlanner.editItem", { item: item.label })}
              >
                <Pencil size={13} />
              </button>
            )}
            <button onClick={() => trip.remove(item.id)} className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label={tCustomer("strictMigration.tripPlanner.removeItem", { item: item.label })}>
              <X size={14} />
            </button>
          </div>
        )}
      </li>
    );
  }

  function renderDaySection(title: string, date: string | null, items: TripItem[], emptyCopy: string, key?: string | number) {
    const dayTargetKey = date ? weatherPlan.dayTargetKeyByDate[date] : undefined;
    const dayTarget = dayTargetKey ? weatherTargetsByKey.get(dayTargetKey) : undefined;
    const dayWeatherResult = dayTargetKey ? weatherState.results[dayTargetKey] ?? null : null;
    const isSimulatedDay = Boolean(date && date === selectedDate && simulatedWeatherResult);
    const displayedWeatherResult = isSimulatedDay ? simulatedWeatherResult : dayWeatherResult;
    const simulationLabel = isSimulatedDay
      ? `${tCustomer("strictMigration.tripPlanner.weather.simulation.testData")} · ${tCustomer(`strictMigration.tripPlanner.weather.conditions.${simulatedWeatherConditionKeyForHour(overlayHour)}`)} · ${String(overlayHour).padStart(2, "0")}:00`
      : undefined;
    return (
      <section
        key={key ?? title}
        onDragOver={(event) => event.preventDefault()}
        onDrop={() => handleDropOnDay(date)}
        onClick={() => date && setSelectedDate(date)}
        data-trip-day={date ?? "unscheduled"}
        data-selected-day={date === selectedDate ? "true" : "false"}
        className={"rounded-2xl border p-3 transition " + (date === selectedDate ? "border-primary bg-secondary/70 shadow-[0_10px_28px_rgba(1,0,102,0.08)]" : "border-border bg-muted/35 hover:border-primary/30")}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-primary">{title}</h2>
            {date && <p className="mt-0.5 text-[11px] text-muted-foreground">{formatTripDay(date)}</p>}
            {date && (dayTarget || isSimulatedDay) && (
              <TripWeatherHint
                date={date}
                anchorLabel={isSimulatedDay ? tCustomer("strictMigration.tripPlanner.weather.simulation.label") : dayTarget!.label}
                result={displayedWeatherResult}
                loading={!isSimulatedDay && weatherState.status === "loading"}
                simulationLabel={simulationLabel}
                onSelectRiskHour={isSimulatedDay ? undefined : (hour) => handleSelectWeatherRiskHour(date, hour)}
              />
            )}
          </div>
          <span className="rounded-full bg-background px-2 py-1 text-[10px] font-bold text-muted-foreground">{tCustomer("ui.map.stopCount", { count: items.length })}</span>
        </div>
        {items.length > 0 ? <ul className="flex flex-col gap-2">{items.map(renderStopRow)}</ul> : <p className="rounded-xl border border-dashed border-border bg-background/70 px-3 py-3 text-center text-xs text-muted-foreground">{emptyCopy}</p>}
      </section>
    );
  }

  return (
    <>
      <CustomerPageTitle
        eyebrow={tCustomer("accountGroups.myTravel")}
        title={tripData.name}
        description={formatTripRange(tripData)}
        icon={<Navigation size={14} />}
        actions={
          <Link href="/customer/trip" className="inline-flex h-10 items-center gap-2 rounded-full border border-primary/20 bg-card px-4 text-sm font-bold text-primary transition hover:bg-secondary focus:outline-none focus:ring-2 focus:ring-primary/30">
            <Navigation size={15} /> {tCustomer("ui.trip.title")}
          </Link>
        }
      />

      <CustomerPageShell wide className="pt-0 sm:pt-0">
        <section aria-label={tCustomer("strictMigration.tripPlanner.itinerary")} className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
          <div className="flex min-h-[640px] w-full flex-col overflow-hidden bg-card md:h-[680px] md:min-h-0">
            <div className="flex shrink-0 gap-1 border-b border-border bg-card p-2 md:hidden" aria-label={tCustomer("strictMigration.tripPlanner.plannerViews")}>
              {(["itinerary", "map", "places"] as const).map((panel) => (
                <button key={panel} onClick={() => setActivePanel(panel)} className={"flex-1 rounded-full px-3 py-2 text-xs font-bold capitalize " + (activePanel === panel ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted")}>
                  {panel === "itinerary" ? tCustomer("strictMigration.tripPlanner.itineraryTab") : panel === "map" ? tCustomer("strictMigration.tripPlanner.mapTab") : tCustomer("strictMigration.tripPlanner.placesTab")}
                </button>
              ))}
            </div>

      <div className={`grid min-h-0 flex-1 transition-[grid-template-columns] duration-300 ease-out ${desktopGridClass}`}>
        <aside aria-label={tCustomer("strictMigration.tripPlanner.itinerary")} className={(activePanel === "itinerary" ? "flex" : "hidden") + " relative min-h-0 flex-col border-r border-border bg-card md:flex"}>
          <button
            type="button"
            onClick={() => setItineraryCollapsed((collapsed) => !collapsed)}
            aria-expanded={!itineraryCollapsed}
            aria-label={tCustomer(itineraryCollapsed ? "ui.map.expandTripPanel" : "ui.map.minimizeTripPanel")}
            title={tCustomer(itineraryCollapsed ? "ui.map.expandTripPanel" : "ui.map.minimizeTripPanel")}
            className={itineraryCollapsed
              ? "hidden h-full w-full flex-col items-center gap-3 px-2 py-4 text-primary transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 md:flex"
              : "absolute right-3 top-4 z-10 hidden h-8 w-8 place-items-center rounded-full border border-border bg-card text-primary transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 md:grid"}
          >
            {itineraryCollapsed ? (
              <>
              <ChevronRight size={17} />
              <Navigation size={16} />
              <span className="text-[10px] font-bold tracking-[0.12em] [writing-mode:vertical-rl]">{tCustomer("ui.map.yourTrip")}</span>
              </>
            ) : <ChevronLeft size={15} />}
          </button>
          <div className={(itineraryCollapsed ? "flex md:hidden" : "flex") + " min-h-0 flex-1 flex-col"}>
          <header className="shrink-0 border-b border-border px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{tCustomer("ui.map.yourTrip")}</p>
                <h1 className="mt-1 truncate text-lg font-bold text-foreground">{tripData.name}</h1>
                <p className="mt-1 text-xs text-muted-foreground">{formatTripRange(tripData)}</p>
              </div>
              <span className="mr-10 shrink-0 rounded-full bg-secondary px-2 py-1 text-[10px] font-bold text-primary">{tCustomer("strictMigration.tripPlanner.planned", { scheduled: scheduledItemCount, total: trip.items.length })}</span>
            </div>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-foreground">{tCustomer("strictMigration.tripPlanner.buildRoute")}</p>
              <button type="button" onClick={() => setShowAllVendors((value) => !value)} aria-pressed={showAllVendors} className="inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-primary">
                {showAllVendors ? <Eye size={13} className="text-primary" /> : <EyeOff size={13} />}
                {showAllVendors ? tCustomer("ui.map.showingAllVendors") : tCustomer("ui.map.showAllVendors")}
              </button>
            </div>

            {!locationStop && (
              <div className="mb-3 rounded-2xl border border-dashed border-primary/30 bg-secondary/60 p-3">
                <div className="flex items-center gap-2">
                  <LocateFixed size={16} className="shrink-0 text-primary" />
                  {editingStart ? <input autoFocus value={startInput} onChange={(event) => setStartInput(event.target.value)} placeholder={tCustomer("ui.map.typeLocation")} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary" /> : <span className="min-w-0 flex-1"><span className="block text-xs font-bold">{tCustomer("ui.map.addStartingPoint")}</span><span className="block text-[11px] text-muted-foreground">{tCustomer("ui.map.typePlaceOrGps")}</span></span>}
                  <button onClick={() => editingStart ? setEditingStart(false) : openStartEditor()} className="rounded-lg p-1 text-muted-foreground hover:bg-background" aria-label={tCustomer("ui.map.typeAddress")}>{editingStart ? <X size={14} /> : <Pencil size={14} />}</button>
                  <button onClick={useGps} disabled={locating} className="rounded-lg p-1 text-primary hover:bg-background disabled:opacity-50" aria-label={tCustomer("ui.map.useCurrentLocation")}>{locating ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={14} />}</button>
                </div>
                {editingStart && locationSuggestions()}
                {locError && <p className="mt-1 text-xs text-destructive">{locError}</p>}
              </div>
            )}

            <div className="space-y-3">
              {groupedItems.days.length > 0 ? visibleDays.map((day, index) => renderDaySection(tCustomer("strictMigration.tripPlanner.dayNumber", { number: dayPageStart + index + 1 }), day.date, day.items, tCustomer("strictMigration.tripPlanner.dropStopHint"), dayPageStart + index)) : renderDaySection(tCustomer("strictMigration.tripPlanner.planDays"), null, groupedItems.unscheduled, tCustomer("strictMigration.tripPlanner.addPlacesHint"))}
              {groupedItems.days.length > 0 && safeDayPage === dayTotalPages && renderDaySection(tCustomer("strictMigration.tripPlanner.unscheduled"), null, groupedItems.unscheduled, tCustomer("strictMigration.tripPlanner.allAssigned"))}
            </div>

            <div className="mt-3">
              {addingStop ? (
                <div className="rounded-2xl border border-border bg-muted p-3">
                  <div className="flex items-center gap-2">
                    <Search size={14} className="text-muted-foreground" />
                    <input autoFocus value={stopSearchInput} onChange={(event) => setStopSearchInput(event.target.value)} placeholder={tCustomer("ui.map.searchPlaceToAdd")} className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-xs outline-none focus:border-primary" />
                    <button onClick={() => { setAddingStop(false); setStopSearchInput(""); setStopSuggestions([]); }} className="rounded-lg p-1 text-muted-foreground hover:bg-background" aria-label={tCustomer("ui.actions.cancel")}><X size={14} /></button>
                  </div>
                  {stopSearchLoading && <p className="mt-2 text-xs text-muted-foreground">{tCustomer("ui.map.searching")}</p>}
                  {stopSuggestions.length > 0 && <ul className="mt-2 overflow-hidden rounded-lg border border-border bg-card">{stopSuggestions.map((suggestion, index) => <li key={suggestion.lat + "," + suggestion.lng + "," + index}><button onClick={() => chooseStopSuggestion(suggestion)} className="flex w-full items-start gap-2 border-b border-border px-3 py-2 text-left text-xs last:border-0 hover:bg-muted"><LocateFixed size={13} className="mt-0.5 shrink-0 text-primary" /><span className="line-clamp-2">{suggestion.label}</span></button></li>)}</ul>}
                </div>
              ) : <button onClick={() => setAddingStop(true)} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-xs font-bold text-muted-foreground hover:border-primary hover:text-primary"><Plus size={14} /> {tCustomer("ui.map.addPlace")}</button>}
            </div>
          </div>

          <DirectoryPagination
            ariaLabel={tCustomer("strictMigration.tripPlanner.dayPagination")}
            currentPage={safeDayPage}
            itemLabel={tCustomer("strictMigration.tripPlanner.dayItemLabel")}
            onPageChange={setDayPage}
            pageSize={TRIP_DAYS_PAGE_SIZE}
            totalItems={groupedItems.days.length}
            totalPages={dayTotalPages}
            variant="compact"
          />

          <footer className="shrink-0 border-t border-border bg-card p-3">
            <div className="mb-2 grid grid-cols-4 gap-1.5">
              {TRAVEL_MODES.map((travelMode) => {
                const supported = Boolean(ORS_PROFILE[travelMode.id]);
                const best = routes[travelMode.id]?.[0];
                return <button key={travelMode.id} onClick={() => setMode(travelMode.id)} className="flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-[10px] font-bold" style={{ borderColor: mode === travelMode.id ? "var(--travel-blue)" : "var(--border)", backgroundColor: mode === travelMode.id ? "var(--travel-blue)" : "transparent", color: mode === travelMode.id ? "white" : "var(--foreground)" }}><span className="flex items-center gap-1"><travelMode.icon size={12} />{travelModeLabel(travelMode.id)}</span><span className="text-[9px] opacity-80">{!hasRouteInputs ? "" : !supported ? tCustomer("ui.map.maps") : routesLoading ? "…" : best ? formatDurationShort(best.durationMin) : "—"}</span></button>;
              })}
            </div>
            {activeRoutes.length > 1 && (
              <div className="mb-2 space-y-1.5">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{tCustomer("ui.map.routeOptions")}</p>
                {activeRoutes.map((route, index) => (
                  <button key={index} onClick={() => setSelectedRouteIdx(index)} className="flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-[11px]" style={{ borderColor: index === selectedRouteIdx ? "var(--travel-blue)" : "var(--border)", backgroundColor: index === selectedRouteIdx ? "var(--secondary, #dbe6ff)" : "transparent" }}>
                    <span className="font-bold">{formatDuration(route.durationMin)} <span className="font-semibold text-muted-foreground">· {route.distanceKm} {DISTANCE_UNIT_KM}</span></span>
                    <span className="flex items-center gap-1">{index === 0 && <span className="rounded-full bg-nature-green/10 px-1.5 py-0.5 text-[9px] font-bold text-[#16A34A]">{tCustomer("ui.map.fastest")}</span>}{route.hasTolls && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-900">{tCustomer("ui.map.toll")}</span>}</span>
                  </button>
                ))}
              </div>
            )}
            {hasRouteInputs && <p className="mb-2 text-center text-[11px] font-semibold text-foreground">{mode === "TRANSIT" ? tCustomer("ui.map.transitOpensMaps") : routesLoading ? tCustomer("ui.map.calculatingRoute") : activeRoute ? (travelModeLabel(mode) + " · " + formatDuration(activeRoute.durationMin) + " · " + activeRoute.distanceKm + " km") : tCustomer("ui.map.routeUnavailable")}</p>}
            {mode === "DRIVING" && activeRoute?.traffic && (
              <div data-route-traffic-status className="mb-2 rounded-xl border border-border bg-muted/70 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-foreground">
                  <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-500" />{activeRoute.traffic.basis === "live" ? tCustomer("ui.map.trafficLive") : tCustomer("ui.map.trafficPredicted")}</span>
                  <span className="font-semibold text-muted-foreground">Mapbox · {new Date(activeRoute.traffic.retrievedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
                <div className="mt-1.5 grid grid-cols-4 gap-1 text-[9px] font-semibold text-muted-foreground">
                  <span className="flex items-center gap-1"><i className="h-1 w-4 rounded-full bg-[#2563EB]" />{tCustomer("ui.map.trafficNormal")}</span>
                  <span className="flex items-center gap-1"><i className="h-1 w-4 rounded-full bg-[#FACC15]" />{tCustomer("ui.map.trafficSlow")}</span>
                  <span className="flex items-center gap-1"><i className="h-1 w-4 rounded-full bg-[#EF4444]" />{tCustomer("ui.map.trafficCongested")}</span>
                  <span className="flex items-center gap-1"><i className="h-1 w-4 rounded-full bg-[#B91C1C]" />{tCustomer("ui.map.trafficSevere")}</span>
                </div>
              </div>
            )}
            <button onClick={() => directionsUrl && window.open(directionsUrl, "_blank")} disabled={!directionsUrl} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-xs font-bold text-white disabled:opacity-40"><Navigation size={14} /> {tCustomer("ui.map.getDirectionsGoogle")}</button>
            <div className="mt-2 flex items-center justify-between"><button onClick={() => setUrlPreview((current) => current ? null : directionsUrl)} className="text-[10px] font-bold text-muted-foreground hover:text-foreground">{urlPreview ? tCustomer("ui.map.hideHandoffUrl") : tCustomer("ui.map.showHandoffUrl")}</button><button onClick={trip.clear} className="text-[10px] font-bold text-muted-foreground hover:text-destructive">{tCustomer("ui.map.clearTrip")}</button></div>
            {trip.stops.length > 9 && <p className="mt-1 text-[10px] font-semibold text-destructive">{tCustomer("ui.map.maxStops")}</p>}
            {urlPreview && <code className="mt-2 block max-h-16 overflow-auto break-all rounded-lg bg-muted p-2 text-[10px]">{urlPreview}</code>}
          </footer>
          </div>
        </aside>

        <main aria-label={tCustomer("strictMigration.tripPlanner.tripMap")} className={(activePanel === "map" ? "flex" : "hidden") + " relative min-h-0 bg-muted md:flex"}>
          <MapView pins={pins} center={center} zoom={near ? 12 : 7} height="100%" cluster radiusCenter={near && placeFilters.distanceKm !== null ? [near.lat, near.lng] : undefined} radiusKm={near ? placeFilters.distanceKm ?? undefined : undefined} onAddStop={toggleStop} stopIds={selectedRouteStops.map((stop) => stop.id)} routes={activeRoutes.map((route, index) => ({ path: route.geometry, selected: index === selectedRouteIdx, trafficSegments: route.traffic?.segments }))} routeColor={MODE_STYLE[mode].color} routeDashed={MODE_STYLE[mode].dashed} focusRequest={focusRequest} onMapMovingChange={setMapMoving}>
            <TripWeatherMapOverlay result={displayedWeatherOverlay} status={displayedWeatherOverlayStatus} radarResult={radarState.result} radarStatus={radarState.status} mode={activeWeatherMapMode} liveRadarAvailable={liveRadarAvailable} enabled={weatherLayerEnabled} hour={overlayHour} onHourChange={setOverlayHour} onModeChange={setWeatherMapMode} onEnabledChange={setWeatherLayerEnabled} simulationAvailable={simulationAvailable} simulationEnabled={simulationActive} onSimulationEnabledChange={setSimulationEnabled} mapMoving={mapMoving} />
          </MapView>
        </main>

        <aside aria-label={tCustomer("strictMigration.tripPlanner.placesToAdd")} className={(activePanel === "places" ? "flex" : "hidden") + " relative min-h-0 flex-col border-l border-border bg-card md:flex"}>
          <button
            type="button"
            onClick={() => setPlacesCollapsed((collapsed) => !collapsed)}
            aria-expanded={!placesCollapsed}
            aria-label={tCustomer(placesCollapsed ? "ui.map.expandPlacesPanel" : "ui.map.minimizePlacesPanel")}
            title={tCustomer(placesCollapsed ? "ui.map.expandPlacesPanel" : "ui.map.minimizePlacesPanel")}
            className={placesCollapsed
              ? "hidden h-full w-full flex-col items-center gap-3 px-2 py-4 text-primary transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/30 md:flex"
              : "absolute right-3 top-4 z-10 hidden h-8 w-8 place-items-center rounded-full border border-border bg-card text-primary transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 md:grid"}
          >
            {placesCollapsed ? (
              <>
              <ChevronLeft size={17} />
              <Plus size={16} />
              <span className="text-[10px] font-bold tracking-[0.12em] [writing-mode:vertical-rl]">{tCustomer("ui.map.addPlace")}</span>
              </>
            ) : <ChevronRight size={15} />}
          </button>
          <div className={(placesCollapsed ? "flex md:hidden" : "flex") + " min-h-0 flex-1 flex-col"}>
          {filtersOpen ? (
            <TripPlaceFilterPanel
              filters={placeFilters}
              hasOrigin={Boolean(near)}
              resultCount={filteredActivities.length}
              onChange={patchPlaceFilters}
              onClear={clearPlaceFilters}
              onDone={() => setFiltersOpen(false)}
            />
          ) : <>
          <header className="shrink-0 border-b border-border px-4 py-4">
            <p className="pr-10 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{tCustomer("ui.map.nearbyToAdd")}</p>
            <div className="mt-1 flex items-end justify-between gap-2"><div><h2 className="text-lg font-bold text-foreground">{tCustomer("ui.map.addPlace")}</h2><p className="mt-1 text-xs text-muted-foreground">{tCustomer("strictMigration.tripPlanner.placesReady", { count: filteredActivities.length })}</p></div><button type="button" onClick={() => setShowAllVendors((value) => !value)} aria-pressed={showAllVendors} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-primary" title={tCustomer("strictMigration.tripPlanner.toggleVendorPins")}>{showAllVendors ? <Eye size={16} /> : <EyeOff size={16} />}</button></div>
            <label className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2.5 focus-within:border-primary"><Search size={15} className="text-muted-foreground" /><span className="sr-only">{tCustomer("ui.map.searchExperience")}</span><input value={placeFilters.query} onChange={(event) => patchPlaceFilters({ query: event.target.value })} placeholder={tCustomer("ui.map.searchExperience")} className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></label>
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2"><label className="sr-only" htmlFor="planner-category">{tCustomer("ui.recommendations.category")}</label><select id="planner-category" value={placeFilters.category ?? ""} onChange={(event) => patchPlaceFilters({ category: event.target.value || null })} className="rounded-lg border border-border bg-background px-2 py-2 text-xs font-semibold outline-none focus:border-primary"><option value="">{tCustomer("ui.map.allCategories")}</option>{CATEGORIES.map((entry) => <option key={entry.id} value={entry.id}>{tCustomer(entry.labelKey)}</option>)}</select><button type="button" onClick={() => setFiltersOpen(true)} aria-expanded={filtersOpen} aria-label={tCustomer("strictMigration.tripPlanner.filters.moreFilters")} className="relative grid h-9 w-9 place-items-center rounded-full border border-border bg-background text-primary transition hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"><SlidersHorizontal size={15} />{activePlaceFilterCount > 0 && <span className="absolute -right-1 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-bold text-white">{activePlaceFilterCount}</span>}</button></div>
          </header>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <ul className="flex flex-col gap-2">
              {visibleActivitiesPage.map((activity) => {
                const added = trip.has(activity.id);
                // eslint-disable-next-line @next/next/no-img-element
                const sponsoredClick = () => activity.sponsorship && recordSponsoredEvent(activity.sponsorship.placementId, "click", activity.id);
                return <li key={activity.id} data-activity-card={activity.id} data-promoted-activity={activity.sponsorship ? activity.sponsorship.placementId : undefined} draggable={!added} onDragStart={() => setDragPayload({ kind: "catalogue", activityId: activity.id })} onDragEnd={() => setDragPayload(null)} className={"rounded-2xl border p-2.5 transition " + (added ? "border-[#16A34A]/40 bg-[#16A34A]/5" : "cursor-grab border-border hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lg active:cursor-grabbing")}><div className="flex gap-2.5"><button type="button" onClick={() => { sponsoredClick(); focusPin({ id: activity.id, lat: activity.outlet.lat, lng: activity.outlet.lng, label: activity.name, sublabel: formatMYR(Number(activity.price)) + " · " + activity.outlet.city, href: "/customer/activity/" + activity.id, imageUrl: activity.image }); }} className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-secondary" aria-label={tCustomer("strictMigration.tripPlanner.showOnMap", { item: activity.name })}>{activity.image ? <img src={activity.image} alt="" className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-muted-foreground"><ImageOff size={17} /></span>}</button><div className="min-w-0 flex-1"><div className="flex items-center gap-1.5"><h3 className="min-w-0 flex-1 truncate text-xs font-bold text-foreground">{activity.name}</h3>{activity.sponsorship && <span className="shrink-0 rounded-full bg-highlight-yellow/20 px-1.5 py-0.5 text-[9px] font-bold text-foreground">{tCustomer("strictMigration.tripPlanner.filters.promoted")}</span>}</div><p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground"><Star size={10} fill="var(--highlight-yellow)" stroke="none" /> {activity.rating} · {near && activity.distanceKm !== undefined ? tCustomer("ui.map.distanceKm", { distance: activity.distanceKm.toFixed(1) }) : activity.outlet.city} · {formatMYR(Number(activity.price))}</p><div className="mt-2 flex flex-wrap items-center gap-2"><button onClick={() => { sponsoredClick(); toggleStop({ id: activity.id, lat: activity.outlet.lat, lng: activity.outlet.lng, label: activity.name, sublabel: formatMYR(Number(activity.price)) + " · " + activity.outlet.city }); }} className={"rounded-lg px-2.5 py-1 text-[11px] font-bold " + (added ? "bg-[#16A34A] text-white" : "bg-primary text-white")}>{added ? tCustomer("ui.map.removeFromTrip") : tCustomer("ui.actions.addToTrip")}</button>{!added && groupedItems.days.length > 0 && <select aria-label={tCustomer("strictMigration.tripPlanner.chooseDay", { item: activity.name })} defaultValue="" onChange={(event) => { if (event.target.value) { sponsoredClick(); chooseDayForActivity(activity, event.target.value); } event.currentTarget.value = ""; }} className="max-w-[96px] rounded-lg border border-border bg-background px-1.5 py-1 text-[10px] font-bold text-primary"><option value="" disabled>{tCustomer("strictMigration.tripPlanner.chooseDayShort")}</option>{groupedItems.days.map((day, index) => <option key={day.date} value={day.date}>{tCustomer("strictMigration.tripPlanner.dayNumber", { number: index + 1 })}</option>)}</select>}<a href={"/customer/activity/" + activity.id} onClick={sponsoredClick} className="text-[11px] font-semibold text-muted-foreground hover:text-primary">{tCustomer("ui.actions.viewDetails")}</a></div></div></div></li>;
              })}
            </ul>
            {filteredActivities.length === 0 && <div className="rounded-2xl border border-dashed border-border px-4 py-10 text-center"><Search size={22} className="mx-auto mb-2 text-muted-foreground" /><p className="text-xs font-bold text-foreground">{tCustomer("ui.map.noPlacesRadius")}</p><p className="mt-1 text-[11px] text-muted-foreground">{tCustomer("ui.map.noPlacesRadius")}</p></div>}
          </div>
          <DirectoryPagination
            ariaLabel={tCustomer("strictMigration.tripPlanner.placePagination")}
            currentPage={safePlacesPage}
            itemLabel={tCustomer("strictMigration.tripPlanner.placeItemLabel")}
            onPageChange={setPlacesPage}
            pageSize={PLACES_PAGE_SIZE}
            totalItems={filteredActivities.length}
            totalPages={placesTotalPages}
            variant="compact"
          />
          </>}
          </div>
        </aside>
            </div>
          </div>
        </section>
      </CustomerPageShell>
    </>
  );
}
