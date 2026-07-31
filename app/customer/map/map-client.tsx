"use client";

import { useEffect, useRef, useState } from "react";
import { Expand, Eye, EyeOff, GripVertical, Loader2, LocateFixed, Maximize2, Minus, Navigation, Pencil, Plus, Search, Shrink, Star, X } from "lucide-react";
import { MapView, type MapPin } from "@/components/map/map-view";
import { CATEGORIES, searchActivities } from "@/backend/domains/catalogue";
import { useTrip, type TripStop } from "@/components/providers/trip";
import { TRAVEL_MODES, buildGoogleMapsDirectionsUrl, type TravelModeId } from "@/lib/travel-modes";
import { ORS_PROFILE, type GeoHit, type RouteResult } from "@/lib/routing";
import type { ComputedActivity } from "@/backend/core/types";
import { getDiscoverySearchFilter } from "@/lib/customer/discovery-categories";

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

export function MapClient({ initialActivities }: { initialActivities: ComputedActivity[] }) {
  const trip = useTrip();
  const [category, setCategory] = useState<string | null>(null);
  const [radiusKm, setRadiusKm] = useState(5);
  const [activities, setActivities] = useState<ComputedActivity[] | null>(initialActivities);
  const [mode, setMode] = useState<TravelModeId>("DRIVING");
  const [collapsed, setCollapsed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
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
    trip.setLocation({ label: hit.label, lat: hit.lat, lng: hit.lng, kind: "custom" });
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
        trip.setLocation({ label: "Your location", lat: pos.coords.latitude, lng: pos.coords.longitude, kind: "gps" });
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
    trip.add({ id: crypto.randomUUID(), lat: hit.lat, lng: hit.lng, label: hit.label, source: "custom" });
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

  return (
    <div className={fullscreen ? "fixed inset-0 z-[60] bg-background" : "relative mx-auto max-w-7xl px-4 py-4 sm:px-6"}>
      <div className={`relative overflow-hidden border border-border bg-card ${fullscreen ? "h-full rounded-none" : "rounded-[1.375rem] shadow-[0_18px_45px_rgba(1,0,102,0.14)]"}`}>
        <MapView
          pins={pins}
          center={center}
          zoom={near ? 12 : 7}
          height={fullscreen ? "100%" : "max(520px, calc(100dvh - 8.5rem))"}
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

        <div className={`static mt-3 flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_45px_rgba(1,0,102,0.18)] sm:absolute sm:right-4 sm:top-4 sm:mt-0 sm:w-[360px] ${collapsed ? "" : "max-h-[72vh] sm:max-h-[calc(100%-2rem)]"}`}>
          <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-3.5">
            <div className="flex items-center gap-2 text-base font-bold text-foreground">
              <Navigation size={16} className="text-primary" /> Your Trip
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold text-amber-900" style={{ backgroundColor: "var(--highlight-yellow)" }}>
                {waypointCount} stop{waypointCount === 1 ? "" : "s"}
              </span>
              {!collapsed && (
                <button onClick={() => setFullscreen((f) => !f)} className="grid h-6 w-6 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label={fullscreen ? "Exit fullscreen" : "Fullscreen map"}>
                  {fullscreen ? <Shrink size={14} /> : <Expand size={14} />}
                </button>
              )}
              <button onClick={() => setCollapsed((c) => !c)} className="grid h-6 w-6 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label={collapsed ? "Expand trip panel" : "Minimize trip panel"}>
                {collapsed ? <Maximize2 size={14} /> : <Minus size={16} />}
              </button>
            </div>
          </div>

          {!collapsed && (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-4">
                {/* filters */}
                <div className="mb-2 flex gap-2">
                  <label className="flex-1">
                    <span className="sr-only">Filter by category</span>
                    <select value={category ?? ""} onChange={(e) => setCategory(e.target.value || null)} className="w-full rounded-lg border border-border bg-background px-2.5 py-2 text-xs font-semibold text-foreground outline-none focus:border-primary">
                      <option value="">All categories</option>
                      {CATEGORIES.map((c) => (
                        <option key={c.id} value={c.id}>{c.label}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">Radius</span>
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
                  {showAllVendors ? "Showing all vendors on map" : "Show all vendors on map"}
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
                            placeholder="Type your location…"
                            className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1 text-[13px] text-foreground outline-none focus:border-primary"
                          />
                        ) : (
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-bold text-foreground">Add your starting point</span>
                            <span className="block text-[11px] text-muted-foreground">Type a place or use GPS</span>
                          </span>
                        )}
                        <span className="flex shrink-0 items-center gap-0.5">
                          <button onClick={() => (editingStart ? setEditingStart(false) : openStartEditor())} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-black/5" aria-label="Type an address" title="Type an address">
                            {editingStart ? <X size={15} /> : <Pencil size={13} />}
                          </button>
                          <button onClick={useGps} disabled={locating} className="grid h-7 w-7 place-items-center rounded-md text-primary hover:bg-black/5 disabled:opacity-50" aria-label="Use my current location" title="Use my GPS location">
                            {locating ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={15} />}
                          </button>
                        </span>
                      </div>
                      {editingStart && locationSuggestions()}
                      {locError && <p className="mt-1 px-1 text-[11px] text-destructive">{locError}</p>}
                    </li>
                  )}

                  {trip.stops.map((s, i) => {
                    const isLocation = s.source === "location";
                    const isCustom = s.source === "custom";
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
                                placeholder="Type a new location…"
                                className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1 text-[13px] text-foreground outline-none focus:border-primary"
                              />
                              {isLocation && (
                                <button onClick={useGps} disabled={locating} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-primary hover:bg-black/5 disabled:opacity-50" aria-label="Use my current location" title="Use my GPS location">
                                  {locating ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={15} />}
                                </button>
                              )}
                              <button onClick={() => (isLocation ? setEditingStart(false) : setEditingStopId(null))} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-black/5" aria-label="Cancel edit">
                                <X size={15} />
                              </button>
                            </div>
                            {isLocation ? (
                              locationSuggestions()
                            ) : (
                              <div className="mt-1.5">
                                {editStopLoading && <p className="px-1 py-1 text-[11px] text-muted-foreground">Searching…</p>}
                                {!editStopLoading && editStopInput.trim().length >= 3 && editStopSuggestions.length === 0 && <p className="px-1 py-1 text-[11px] text-muted-foreground">No matches — keep typing.</p>}
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
                                <span className="block text-[11px] text-muted-foreground">{s.locationKind === "gps" ? "Your current location" : "Custom start"}</span>
                              ) : (
                                s.sublabel && <span className="block truncate text-[11px] text-muted-foreground">{s.sublabel}</span>
                              )}
                            </span>
                            {(isLocation || isCustom) && (
                              <button onClick={() => (isLocation ? openStartEditor() : openStopEditor(s))} className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-primary" aria-label={isLocation ? "Edit location" : "Edit stop"}>
                                <Pencil size={13} />
                              </button>
                            )}
                            {isLocation && (
                              <button onClick={useGps} disabled={locating} className="shrink-0 rounded-md p-1 text-primary hover:bg-black/5 disabled:opacity-50" aria-label="Use my current location" title="Use my GPS location">
                                {locating ? <Loader2 size={13} className="animate-spin" /> : <LocateFixed size={14} />}
                              </button>
                            )}
                            <button onClick={() => trip.remove(s.id)} className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-destructive" aria-label={isLocation ? "Remove location" : "Remove stop"}>
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
                          placeholder="Search a place to add…"
                          className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 py-1 text-[13px] text-foreground outline-none focus:border-primary"
                        />
                        <button onClick={() => { setAddingStop(false); setStopSearchInput(""); setStopSuggestions([]); }} className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-black/5" aria-label="Cancel">
                          <X size={15} />
                        </button>
                      </div>
                      <div className="mt-1.5">
                        {stopSearchLoading && <p className="px-1 py-1 text-[11px] text-muted-foreground">Searching…</p>}
                        {!stopSearchLoading && stopSearchInput.trim().length >= 3 && stopSuggestions.length === 0 && <p className="px-1 py-1 text-[11px] text-muted-foreground">No matches — keep typing.</p>}
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
                      <Plus size={13} /> Add a place
                    </button>
                  )}
                </div>

                {waypointCount === 0 && (
                  <p className="mb-3 rounded-xl border border-dashed border-border px-3 py-3 text-center text-xs text-muted-foreground">Tap a pin on the map or a place below to add stops.</p>
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
                        <span className="flex items-center gap-1"><m.icon size={13} /> {m.label}</span>
                        <span className="text-[9px] font-semibold opacity-80">{!hasRouteInputs ? "" : !supported ? "Maps" : routesLoading ? "…" : best ? fmtShort(best.durationMin) : "—"}</span>
                      </button>
                    );
                  })}
                </div>

                {/* alternative routes (driving, simple 2-point trips) */}
                {activeRoutes.length > 1 && (
                  <div className="mb-3 flex flex-col gap-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Route options</p>
                    {activeRoutes.map((r, idx) => (
                      <button
                        key={idx}
                        onClick={() => setSelectedRouteIdx(idx)}
                        className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left"
                        style={{ borderColor: idx === selectedRouteIdx ? "var(--travel-blue)" : "var(--border)", backgroundColor: idx === selectedRouteIdx ? "var(--secondary, #dbe6ff)" : "transparent" }}
                      >
                        <span className="text-[13px] font-bold text-foreground">
                          {fmtMin(r.durationMin)} <span className="font-semibold text-muted-foreground">· {r.distanceKm} km</span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          {idx === 0 && <span className="rounded-full bg-nature-green/10 px-1.5 py-0.5 text-[9px] font-bold" style={{ color: "var(--nature-green, #16A34A)" }}>Fastest</span>}
                          {r.hasTolls && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-amber-900" style={{ backgroundColor: "var(--highlight-yellow)" }}>Toll</span>}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* nearby to add */}
                <p className="mb-2 mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-primary">Nearby to add</p>
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
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={a.image} alt={a.name} className="h-9 w-9 shrink-0 rounded-lg object-cover" />
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
                          aria-label={inTrip ? "Remove from trip" : "Add to trip"}
                        >
                          {inTrip ? "✓" : "+"}
                        </button>
                      </li>
                    );
                  })}
                  {visibleActivities.length === 0 && <li className="px-1 py-2 text-xs text-muted-foreground">No places found — try a wider radius.</li>}
                </ul>
              </div>

              <div className="border-t border-border px-4 pb-4 pt-3">
                {hasRouteInputs && (
                  <p className="mb-2 flex items-center justify-center gap-1.5 text-center text-[12px] font-semibold text-foreground">
                    {mode === "TRANSIT" ? (
                      <span className="text-muted-foreground">Transit route opens in Google Maps →</span>
                    ) : routesLoading ? (
                      <span className="text-muted-foreground">Calculating route…</span>
                    ) : activeRoute ? (
                      <>
                        <span>{TRAVEL_MODES.find((m) => m.id === mode)!.label} · {fmtMin(activeRoute.durationMin)} · {activeRoute.distanceKm} km</span>
                        {activeRoute.hasTolls && <span className="rounded-full px-1.5 py-0.5 text-[9px] font-bold text-amber-900" style={{ backgroundColor: "var(--highlight-yellow)" }}>Toll</span>}
                      </>
                    ) : (
                      <span className="text-muted-foreground">Route unavailable for this mode</span>
                    )}
                  </p>
                )}
                <button onClick={handleGetDirections} disabled={!directionsUrl} className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-white disabled:opacity-40">
                  <Navigation size={16} /> Get Directions in Google Maps
                </button>
                <div className="mt-2 flex items-center justify-between">
                  <button onClick={() => setUrlPreview((c) => (c ? null : directionsUrl))} className="text-[11px] font-bold text-muted-foreground hover:text-foreground">{urlPreview ? "Hide" : "Show"} handoff URL</button>
                  <button onClick={trip.clear} className="text-[11px] font-bold text-muted-foreground hover:text-destructive">Clear trip</button>
                </div>
                {trip.stops.length > 9 && <p className="mt-1.5 text-[11px] font-semibold text-destructive">Google allows 9 stops max — extras dropped.</p>}
                {urlPreview && (
                  <div className="mt-2 rounded-lg border border-border bg-muted p-2">
                    <p className="mb-1 text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--nature-green, #16A34A)" }}>Opens in a new tab →</p>
                    <code className="block break-all text-[10.5px] text-foreground">{urlPreview}</code>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
