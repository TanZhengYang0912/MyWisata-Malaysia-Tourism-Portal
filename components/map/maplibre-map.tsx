"use client";

import { useTranslation } from "react-i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import { Fragment, type ReactNode } from "react";
import Map, { Layer, Marker, Popup, Source, type MapRef, type MarkerDragEvent } from "react-map-gl/maplibre";
import type { GeoJSONSource, MapMouseEvent } from "maplibre-gl";
import type { Feature, FeatureCollection, LineString, Point, Polygon } from "geojson";
import type { RouteTrafficSegment } from "@/lib/routing";
import "maplibre-gl/dist/maplibre-gl.css";

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
  href?: string;
  imageUrl?: string | null;
  order?: number;
  /** Set on a Budget Guard suggestion pin — the real trip item (id or experience_id) it's meant to replace when added, so onAddStop can swap in place instead of appending. */
  replacesId?: string;
}

// OpenFreeMap — free hosted vector tiles, no API key / signup / card. Swap to
// "bright" or "positron" for a different look (one-line change).
const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

const SOURCE_ID = "pins";
const CLUSTER_LAYER_ID = "clusters";
const CLUSTER_COUNT_LAYER_ID = "cluster-count";
const POINT_LAYER_ID = "unclustered-point";

function pinsToGeoJSON(pins: MapPin[]): FeatureCollection<Point> {
  return {
    type: "FeatureCollection",
    features: pins.map((p) => ({
      type: "Feature",
      properties: { id: p.id },
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
    })),
  };
}

// Destination point along a great circle — used to draw a geographic-radius
// circle as a GeoJSON polygon (the circle-radius paint is in pixels, not meters).
function destinationPoint(lat: number, lng: number, bearingDeg: number, distanceKm: number): [number, number] {
  const R = 6371;
  const bearing = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lng1 = (lng * Math.PI) / 180;
  const angularDistance = distanceKm / R;
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing));
  const lng2 = lng1 + Math.atan2(Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1), Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2));
  return [(lng2 * 180) / Math.PI, (lat2 * 180) / Math.PI];
}

function circlePolygon(center: [number, number], radiusKm: number): Feature<Polygon> {
  const [lat, lng] = center;
  const points = 64;
  const coordinates = Array.from({ length: points + 1 }, (_, i) => destinationPoint(lat, lng, (i * 360) / points, radiusKm));
  return { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [coordinates] } };
}

function routeGeoJSON(path: [number, number][]): Feature<LineString> {
  return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: path.map(([lat, lng]) => [lng, lat]) } };
}

function trafficRouteGeoJSON(segments: RouteTrafficSegment[]): FeatureCollection<LineString> {
  return {
    type: "FeatureCollection",
    features: segments
      .filter((segment) => segment.geometry.length > 1)
      .map((segment) => ({
        type: "Feature",
        properties: { trafficLevel: segment.level },
        geometry: { type: "LineString", coordinates: segment.geometry.map(([lat, lng]) => [lng, lat]) },
      })),
  };
}

function StopMarkerVisual({ pin, number }: { pin: MapPin; number: number }) {
  const [imageFailed, setImageFailed] = useState(false);
  const order = pin.order ?? number;
  if (pin.imageUrl && !imageFailed) {
    return (
      <div
        data-map-pin-image={pin.id}
        aria-label={pin.label}
        className="relative h-14 w-14 cursor-pointer overflow-hidden rounded-2xl border-[3px] border-white bg-white shadow-[0_12px_30px_rgba(15,23,42,0.24)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pin.imageUrl} alt="" onError={() => setImageFailed(true)} className="h-full w-full object-cover" />
        <span className="absolute bottom-0.5 left-0.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-primary px-1 text-[10px] font-black text-white">
          {order}
        </span>
      </div>
    );
  }
  return (
    <svg width="30" height="38" viewBox="0 0 30 38" style={{ cursor: "pointer", display: "block" }} aria-label={pin.label}>
      <path d="M15 37C15 37 28 22.5 28 14C28 6.82 21.9 1 15 1C8.1 1 2 6.82 2 14C2 22.5 15 37 15 37Z" fill="#DC2626" stroke="#ffffff" strokeWidth="2" />
      <text x="15" y="18.5" textAnchor="middle" fontSize="13" fontWeight="700" fill="#ffffff" fontFamily="sans-serif">{order}</text>
    </svg>
  );
}

// Same photo-thumbnail treatment as an in-trip stop, but a distinct star
// badge instead of a sequence number — visually marks "this is an AI
// suggestion, not yet part of your itinerary" at a glance.
function SuggestedMarkerVisual({ pin }: { pin: MapPin }) {
  const [imageFailed, setImageFailed] = useState(false);
  if (pin.imageUrl && !imageFailed) {
    return (
      <div
        data-map-pin-image={pin.id}
        aria-label={pin.label}
        className="relative h-14 w-14 cursor-pointer overflow-hidden rounded-2xl border-[3px] border-white bg-white shadow-[0_12px_30px_rgba(15,23,42,0.24)]"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pin.imageUrl} alt="" onError={() => setImageFailed(true)} className="h-full w-full object-cover" />
        <span className="absolute bottom-0.5 left-0.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-white bg-amber-500 px-1 text-[10px] font-black text-white">
          ★
        </span>
      </div>
    );
  }
  return (
    <svg width="30" height="38" viewBox="0 0 30 38" style={{ cursor: "pointer", display: "block" }} aria-label={pin.label}>
      <path d="M15 37C15 37 28 22.5 28 14C28 6.82 21.9 1 15 1C8.1 1 2 6.82 2 14C2 22.5 15 37 15 37Z" fill="#D97706" stroke="#ffffff" strokeWidth="2" />
      <text x="15" y="19" textAnchor="middle" fontSize="13" fontWeight="700" fill="#ffffff" fontFamily="sans-serif">★</text>
    </svg>
  );
}

export function MaplibreMap({
  pins,
  center,
  zoom = 11,
  height = 320,
  cluster,
  radiusCenter,
  radiusKm,
  onApiLoaded,
  userLocation,
  onUserLocationDrag,
  onAddStop,
  stopIds,
  suggestedIds,
  routes,
  routeColor = "#2563EB",
  routeDashed,
  focusRequest,
  onMapMovingChange,
  children,
}: {
  pins: MapPin[];
  center: [number, number];
  zoom?: number;
  height?: number | string;
  cluster?: boolean;
  radiusCenter?: [number, number];
  radiusKm?: number;
  onApiLoaded?: () => void;
  userLocation?: [number, number];
  onUserLocationDrag?: (lat: number, lng: number) => void;
  onAddStop?: (pin: MapPin) => void;
  stopIds?: string[];
  /** Pins from an AI suggestion (e.g. Budget Guard) not yet in the trip — rendered with a distinct star marker, and the popup reads "Suggested" instead of "+ Add to trip". */
  suggestedIds?: string[];
  routes?: { path: [number, number][]; selected: boolean; trafficSegments?: RouteTrafficSegment[] }[];
  routeColor?: string;
  routeDashed?: boolean;
  /** Bumping `token` (even for the same pin) re-triggers the pan+select. */
  focusRequest?: { pin: MapPin; token: number } | null;
  onMapMovingChange?: (moving: boolean) => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation("customer");
  const mapRef = useRef<MapRef | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cursor, setCursor] = useState("grab");

  // Trip-stop and suggested pins render as DOM markers below, not the GL dot layer.
  const dotPins = useMemo(
    () => pins.filter((p) => !stopIds?.includes(p.id) && !suggestedIds?.includes(p.id)),
    [pins, stopIds, suggestedIds],
  );
  const stopPins = useMemo(
    () => (stopIds ?? []).map((id, i) => ({ pin: pins.find((p) => p.id === id), number: i + 1 })).filter((s): s is { pin: MapPin; number: number } => !!s.pin),
    [pins, stopIds],
  );
  const suggestedPins = useMemo(
    () => (suggestedIds ?? []).filter((id) => !stopIds?.includes(id)).map((id) => pins.find((p) => p.id === id)).filter((p): p is MapPin => !!p),
    [pins, stopIds, suggestedIds],
  );
  const pinsGeoJSON = useMemo(() => pinsToGeoJSON(dotPins), [dotPins]);
  const selectedPin = pins.find((p) => p.id === selectedId) ?? null;
  const radiusGeoJSON = useMemo(
    () => (radiusCenter && radiusKm ? circlePolygon(radiusCenter, radiusKm) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [radiusCenter?.[0], radiusCenter?.[1], radiusKm],
  );
  const interactiveLayerIds = cluster ? [CLUSTER_LAYER_ID, POINT_LAYER_ID] : [POINT_LAYER_ID];

  // Recenter when `center`/`zoom` change (e.g. switching filters).
  useEffect(() => {
    mapRef.current?.flyTo({ center: [center[1], center[0]], zoom, duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center[0], center[1], zoom]);

  // External trigger (e.g. tapping a "Nearby to add" row) — pan to the pin and open its popup.
  useEffect(() => {
    if (!focusRequest) return;
    const map = mapRef.current;
    if (!map) return;
    setSelectedId(focusRequest.pin.id);
    map.flyTo({ center: [focusRequest.pin.lng, focusRequest.pin.lat], zoom: Math.max(map.getZoom(), 14), duration: 600 });
  }, [focusRequest]);

  async function handleMapClick(e: MapMouseEvent) {
    const map = mapRef.current?.getMap();
    if (!map) return;
    const features = map.queryRenderedFeatures(e.point, { layers: interactiveLayerIds });
    if (!features.length) {
      setSelectedId(null);
      return;
    }
    const feature = features[0];
    if (feature.layer?.id === CLUSTER_LAYER_ID) {
      const clusterId = feature.properties?.cluster_id;
      const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
      const [lng, lat] = (feature.geometry as Point).coordinates as [number, number];
      const expansionZoom = await source?.getClusterExpansionZoom(clusterId);
      if (expansionZoom != null) map.easeTo({ center: [lng, lat], zoom: expansionZoom, duration: 400 });
      return;
    }
    setSelectedId(String(feature.properties?.id ?? ""));
  }

  return (
    <Map
      ref={mapRef}
      initialViewState={{ longitude: center[1], latitude: center[0], zoom }}
      mapStyle={MAP_STYLE}
      style={{ height, width: "100%", borderRadius: "1rem" }}
      interactiveLayerIds={interactiveLayerIds}
      cursor={cursor}
      onMouseEnter={() => setCursor("pointer")}
      onMouseLeave={() => setCursor("grab")}
      onLoad={() => onApiLoaded?.()}
      onMoveStart={() => onMapMovingChange?.(true)}
      onMoveEnd={() => onMapMovingChange?.(false)}
      onClick={handleMapClick}
    >
      <Source id={SOURCE_ID} type="geojson" data={pinsGeoJSON} cluster={cluster} clusterMaxZoom={14} clusterRadius={50}>
        {cluster && (
          <Layer
            id={CLUSTER_LAYER_ID}
            type="circle"
            filter={["has", "point_count"]}
            paint={{
              "circle-color": "#010066",
              "circle-opacity": 0.96,
              "circle-radius": ["step", ["get", "point_count"], 18, 10, 22, 25, 28],
              "circle-stroke-width": 2,
              "circle-stroke-color": "#ffffff",
            }}
          />
        )}
        {cluster && (
          <Layer
            id={CLUSTER_COUNT_LAYER_ID}
            type="symbol"
            filter={["has", "point_count"]}
            layout={{ "text-field": ["get", "point_count_abbreviated"], "text-size": 12, "text-font": ["Noto Sans Bold"] }}
            paint={{ "text-color": "#ffffff" }}
          />
        )}
        <Layer
          id={POINT_LAYER_ID}
          type="circle"
          filter={["!", ["has", "point_count"]]}
          paint={{
            "circle-color": ["case", ["==", ["get", "id"], selectedId ?? ""], "#FACC15", "#010066"],
            "circle-radius": ["case", ["==", ["get", "id"], selectedId ?? ""], 10, 7],
            "circle-stroke-width": 2,
            "circle-stroke-color": "#ffffff",
          }}
        />
      </Source>

      {children}

      {routes
        ?.filter((r) => !r.selected)
        .map((r, i) => r.path.length > 1 && (
          <Source key={`alt-${i}`} id={`route-alt-${i}`} type="geojson" data={routeGeoJSON(r.path)}>
            <Layer
              id={`route-alt-line-${i}`}
              type="line"
              layout={{ "line-cap": "round", "line-join": "round" }}
              paint={{ "line-color": "#94A3B8", "line-width": 3, "line-opacity": 0.55, ...(routeDashed ? { "line-dasharray": [2, 2] } : {}) }}
            />
          </Source>
        ))}
      {routes
        ?.filter((r) => r.selected)
        .map((r, i) => r.path.length > 1 && (
          <Fragment key={`sel-${i}`}>
            <Source id={`route-sel-${i}`} type="geojson" data={routeGeoJSON(r.path)}>
              <Layer
                id={`route-sel-casing-${i}`}
                type="line"
                layout={{ "line-cap": "round", "line-join": "round" }}
                paint={{ "line-color": "#FFFFFF", "line-width": 8, "line-opacity": 0.78, ...(routeDashed ? { "line-dasharray": [2, 2] } : {}) }}
              />
              <Layer
                id={`route-sel-line-${i}`}
                type="line"
                layout={{ "line-cap": "round", "line-join": "round" }}
                paint={{ "line-color": routeColor, "line-width": 5.5, "line-opacity": 0.95, ...(routeDashed ? { "line-dasharray": [2, 2] } : {}) }}
              />
            </Source>
            {!!r.trafficSegments?.length && (
              <Source id={`route-traffic-${i}`} type="geojson" data={trafficRouteGeoJSON(r.trafficSegments)}>
                <Layer
                  id={`route-traffic-line-${i}`}
                  type="line"
                  layout={{ "line-cap": "round", "line-join": "round" }}
                  paint={{
                    "line-color": [
                      "match",
                      ["get", "trafficLevel"],
                      "slow", "#FACC15",
                      "congested", "#EF4444",
                      "severe", "#B91C1C",
                      "#2563EB",
                    ],
                    "line-width": 5.5,
                    "line-opacity": 0.98,
                  }}
                />
              </Source>
            )}
          </Fragment>
        ))}

      {radiusGeoJSON && (
        <Source id="radius" type="geojson" data={radiusGeoJSON}>
          <Layer id="radius-fill" type="fill" paint={{ "fill-color": "#010066", "fill-opacity": 0.06 }} />
          <Layer id="radius-outline" type="line" paint={{ "line-color": "#010066", "line-opacity": 0.5, "line-width": 1.5 }} />
        </Source>
      )}

      {userLocation && (
        <Marker
          longitude={userLocation[1]}
          latitude={userLocation[0]}
          draggable={!!onUserLocationDrag}
          onDragEnd={(e: MarkerDragEvent) => onUserLocationDrag?.(e.lngLat.lat, e.lngLat.lng)}
        >
          <div
            title={onUserLocationDrag ? t("ui.map.dragToSetLocation") : t("ui.map.youAreHere")}
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              background: "#2563EB",
              border: "3px solid #ffffff",
              boxShadow: "0 0 0 1px rgba(0,0,0,0.15)",
              cursor: onUserLocationDrag ? "grab" : undefined,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 11,
              fontWeight: 700,
              color: "#ffffff",
              fontFamily: "sans-serif",
            }}
          >
            1
          </div>
        </Marker>
      )}

      {stopPins.map(({ pin, number }) => (
        <Marker
          key={pin.id}
          longitude={pin.lng}
          latitude={pin.lat}
          anchor="bottom"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            setSelectedId(pin.id);
          }}
        >
          <StopMarkerVisual pin={pin} number={number} />
        </Marker>
      ))}

      {suggestedPins.map((pin) => (
        <Marker
          key={pin.id}
          longitude={pin.lng}
          latitude={pin.lat}
          anchor="bottom"
          onClick={(e) => {
            e.originalEvent.stopPropagation();
            setSelectedId(pin.id);
          }}
        >
          <SuggestedMarkerVisual pin={pin} />
        </Marker>
      ))}

      {selectedPin && (
        <Popup longitude={selectedPin.lng} latitude={selectedPin.lat} onClose={() => setSelectedId(null)} closeOnClick={false} offset={12}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{selectedPin.label}</div>
          {selectedPin.sublabel && <div style={{ fontSize: 11, color: "#666" }}>{selectedPin.sublabel}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            {selectedPin.href && (
              <a href={selectedPin.href} style={{ fontSize: 11, fontWeight: 600, color: "var(--travel-blue)" }}>
                {t("ui.actions.viewDetails")} →
              </a>
            )}
            {onAddStop && (
              <button
                type="button"
                onClick={() => onAddStop(selectedPin)}
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: "#fff",
                  background: stopIds?.includes(selectedPin.id)
                    ? "#16A34A"
                    : suggestedIds?.includes(selectedPin.id) ? "#D97706" : "#010066",
                  border: "none",
                  borderRadius: 8,
                  padding: "5px 9px",
                  cursor: "pointer",
                }}
              >
                {stopIds?.includes(selectedPin.id)
                  ? `✓ ${t("ui.actions.inTrip")}`
                  : suggestedIds?.includes(selectedPin.id) ? `★ ${t("ui.actions.suggested")}` : `+ ${t("ui.actions.addToTrip")}`}
              </button>
            )}
          </div>
        </Popup>
      )}
    </Map>
  );
}
