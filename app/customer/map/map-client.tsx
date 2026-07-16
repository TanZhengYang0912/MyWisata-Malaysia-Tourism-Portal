"use client";

import { useEffect, useRef, useState } from "react";
import { Expand, GripVertical, Loader2, LocateFixed, Maximize2, Minus, Navigation, Pencil, Shrink, Star, X } from "lucide-react";
import { MapView, type MapPin } from "@/components/map/map-view";
import { CATEGORIES, searchActivities } from "@/backend/domains/catalogue";
import { useTrip } from "@/components/providers/trip";
import { TRAVEL_MODES, buildGoogleMapsDirectionsUrl, type TravelModeId } from "@/lib/travel-modes";
import { ORS_PROFILE, type GeoHit, type RouteResult } from "@/lib/routing";
import type { ComputedActivity } from "@/backend/core/types";

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

  // Per-mode route options (may be several alternatives for a 2-point drive).
  const [routes, setRoutes] = useState<Partial<Record<TravelModeId, RouteResult[]>>>({});
  const [routesLoading, setRoutesLoading] = useState(false);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState(0);

  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const near = trip.start ? { lat: trip.start.lat, lng: trip.start.lng } : undefined;

  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    searchActivities({ category, near, sort: near ? "distance_asc" : "recommended" }).then(setActivities);
  }, [category, trip.start?.lat, trip.start?.lng]);

  // Route fetch (debounced): all ORS-supported modes → routes[mode] = options.
  const startKey = trip.start ? `${trip.start.lat},${trip.start.lng}` : "";
  const stopsKey = trip.stops.map((s) => `${s.lat},${s.lng}`).join("|");
  useEffect(() => {
    if (!trip.start || trip.stops.length < 1) {
      setRoutes({});
      setRoutesLoading(false);
      return;
    }
    const points: [number, number][] = [[trip.start.lat, trip.start.lng], ...trip.stops.map((s): [number, number] => [s.lat, s.lng])];
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
  }, [startKey, stopsKey]);

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

  const activeRoutes = ORS_PROFILE[mode] ? routes[mode] ?? [] : [];
  const activeRoute = activeRoutes[selectedRouteIdx] ?? activeRoutes[0];

  function openStartEditor() {
    setStartInput(trip.start?.source === "custom" ? trip.start.label : "");
    setSuggestions([]);
    setLocError("");
    setEditingStart(true);
  }
  function chooseSuggestion(hit: GeoHit) {
    trip.setStart({ label: hit.label, lat: hit.lat, lng: hit.lng, source: "custom" });
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
        trip.setStart({ label: "Your location", lat: pos.coords.latitude, lng: pos.coords.longitude, source: "gps" });
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
    else trip.add({ id: pin.id, lat: pin.lat, lng: pin.lng, label: pin.label, sublabel: pin.sublabel });
  }
  function onDrop(target: number) {
    if (dragIndex !== null && dragIndex !== target) trip.move(dragIndex, target);
    setDragIndex(null);
  }

  const visibleActivities = near ? (activities ?? []).filter((a) => (a.distanceKm ?? Infinity) <= radiusKm) : activities ?? [];
  const center: [number, number] = near ? [near.lat, near.lng] : KL_CENTER;
  const pins: MapPin[] = visibleActivities.map((a) => ({
    id: a.id,
    lat: a.outlet.lat,
    lng: a.outlet.lng,
    label: a.name,
    sublabel: `RM ${a.price} · ${a.outlet.city}`,
    href: `/customer/activity/${a.id}`,
  }));

  const directionsUrl = buildGoogleMapsDirectionsUrl(near ?? null, trip.stops, mode);
  function handleGetDirections() {
    if (directionsUrl) window.open(directionsUrl, "_blank");
  }
  const hasRouteInputs = Boolean(trip.start) && trip.stops.length > 0;

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
          userLocation={near ? [near.lat, near.lng] : undefined}
          onAddStop={toggleStop}
          stopIds={trip.stops.map((s) => s.id)}
          routePath={activeRoute?.geometry}
          routeColor={MODE_STYLE[mode].color}
          routeDashed={MODE_STYLE[mode].dashed}
        />

        <div className={`static mt-3 flex w-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_18px_45px_rgba(1,0,102,0.18)] sm:absolute sm:right-4 sm:top-4 sm:mt-0 sm:w-[360px] ${collapsed ? "" : "max-h-[72vh] sm:max-h-[calc(100%-2rem)]"}`}>
          <div className="flex items-center justify-between gap-2 px-4 pb-3 pt-3.5">
            <div className="flex items-center gap-2 text-base font-bold text-foreground">
              <Navigation size={16} className="text-primary" /> Your Trip
            </div>
            <div className="flex items-center gap-1.5">
              <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold text-amber-900" style={{ backgroundColor: "var(--highlight-yellow)" }}>
                {trip.stops.length} stop{trip.stops.length === 1 ? "" : "s"}
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
                <div className="mb-3 flex gap-2">
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

                {/* stops list — item 1 is the editable location, 2+ are draggable vendors */}
                <ul className="mb-2 flex flex-col gap-1.5">
                  {/* Stop 1: your location */}
                  <li className="rounded-xl border p-2" style={trip.start ? { borderColor: "transparent", backgroundColor: "var(--secondary, #dbe6ff)" } : { borderColor: "var(--border)", borderStyle: "dashed", backgroundColor: "var(--muted)" }}>
                    <div className="flex items-center gap-2">
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white" style={{ backgroundColor: trip.start ? "var(--nature-green, #16A34A)" : "var(--muted-foreground)" }}>1</span>
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
                          <span className="block truncate text-[13px] font-bold text-foreground">{trip.start ? trip.start.label : "Enter your location"}</span>
                          <span className="block text-[11px] text-muted-foreground">{trip.start ? (trip.start.source === "gps" ? "Your current location" : "Custom start") : "Type a place or use GPS"}</span>
                        </span>
                      )}
                      <span className="flex shrink-0 items-center gap-0.5">
                        <button onClick={() => (editingStart ? setEditingStart(false) : openStartEditor())} className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-black/5" aria-label="Edit location" title="Type an address">
                          {editingStart ? <X size={15} /> : <Pencil size={13} />}
                        </button>
                        <button onClick={useGps} disabled={locating} className="grid h-7 w-7 place-items-center rounded-md text-primary hover:bg-black/5 disabled:opacity-50" aria-label="Use my current location" title="Use my GPS location">
                          {locating ? <Loader2 size={14} className="animate-spin" /> : <LocateFixed size={15} />}
                        </button>
                      </span>
                    </div>
                    {editingStart && (
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
                    )}
                    {locError && <p className="mt-1 px-1 text-[11px] text-destructive">{locError}</p>}
                  </li>

                  {/* Stops 2+: vendors, drag to reorder */}
                  {trip.stops.map((s, i) => (
                    <li
                      key={s.id}
                      draggable
                      onDragStart={() => setDragIndex(i)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => onDrop(i)}
                      onDragEnd={() => setDragIndex(null)}
                      className={`flex items-center gap-2 rounded-xl border border-border bg-muted p-2 ${dragIndex === i ? "opacity-40" : ""}`}
                    >
                      <GripVertical size={14} className="shrink-0 cursor-grab text-muted-foreground" />
                      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-primary text-[10px] font-bold text-white">{i + 2}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-bold text-foreground">{s.label}</span>
                        {s.sublabel && <span className="block truncate text-[11px] text-muted-foreground">{s.sublabel}</span>}
                      </span>
                      <button onClick={() => trip.remove(s.id)} className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-destructive" aria-label="Remove stop">
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
                {trip.stops.length === 0 && (
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
