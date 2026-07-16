"use client";

import { useEffect, useRef, useState } from "react";
import { APIProvider, Circle, InfoWindow, Map, Marker, useApiIsLoaded, useMap } from "@vis.gl/react-google-maps";
import { MarkerClusterer } from "@googlemaps/markerclusterer";

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
  href?: string;
}

function ApiLoadedNotifier({ onApiLoaded }: { onApiLoaded?: () => void }) {
  const loaded = useApiIsLoaded();
  useEffect(() => {
    if (loaded) onApiLoaded?.();
  }, [loaded, onApiLoaded]);
  return null;
}

function Recenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    map.panTo({ lat: center[0], lng: center[1] });
    map.setZoom(zoom);
  }, [center[0], center[1], zoom, map]);
  return null;
}

// Draws the trip route geometry (from the ORS proxy) as a Polyline. The
// @vis.gl/react-google-maps version here has no <Polyline> component, so this
// is done imperatively via useMap().
function RouteLine({ path, color, dashed }: { path: [number, number][]; color: string; dashed?: boolean }) {
  const map = useMap();
  const lineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map) return;
    const line = new google.maps.Polyline({
      map,
      path: path.map(([lat, lng]) => ({ lat, lng })),
      geodesic: true,
      strokeColor: color,
      strokeOpacity: dashed ? 0 : 0.9,
      strokeWeight: 5,
      ...(dashed
        ? {
            icons: [
              {
                icon: { path: "M 0,-1 0,1", strokeOpacity: 0.9, strokeWeight: 4, scale: 3 },
                offset: "0",
                repeat: "16px",
              },
            ],
          }
        : {}),
    });
    lineRef.current = line;
    return () => {
      line.setMap(null);
      lineRef.current = null;
    };
  }, [map, path, color, dashed]);

  return null;
}

function YouAreHereMarker({ position }: { position: [number, number] }) {
  return (
    <Marker
      position={{ lat: position[0], lng: position[1] }}
      title="You are here"
      zIndex={Number(google.maps.Marker.MAX_ZINDEX) + 1}
      icon={{
        path: google.maps.SymbolPath.CIRCLE,
        fillColor: "#2563EB",
        fillOpacity: 1,
        strokeColor: "#ffffff",
        strokeWeight: 3,
        scale: 8,
      }}
    />
  );
}

function Markers({
  pins,
  cluster,
  selectedId,
  onSelect,
  onAddStop,
  stopIds,
}: {
  pins: MapPin[];
  cluster?: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onAddStop?: (pin: MapPin) => void;
  stopIds?: string[];
}) {
  const map = useMap();
  // Plain refs, not state: markers are read imperatively (by the clusterer and
  // the InfoWindow anchor) and must never themselves trigger a re-render.
  const markersRef = useRef<Record<string, google.maps.Marker>>({});
  const clustererRef = useRef<MarkerClusterer | null>(null);
  // Stable per-id callback refs: an inline `ref={m => ...}` gets a new identity
  // every render, so React detaches+reattaches it (null then marker) each time,
  // which caused an infinite render loop when that callback wrote to state.
  const refCallbacksRef = useRef<Record<string, (m: google.maps.Marker | null) => void>>({});

  // Classic Marker: no mapId/cloud config needed. Switch to AdvancedMarker +
  // a Map ID only if custom marker art is required later.
  useEffect(() => {
    if (!map || !cluster) return;
    clustererRef.current = new MarkerClusterer({
      map,
      renderer: {
        render: (cluster) => new google.maps.Marker({
          position: cluster.position,
          label: {
            text: String(cluster.count),
            color: "#ffffff",
            fontSize: "12px",
            fontWeight: "700",
          },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: "#010066",
            fillOpacity: 0.96,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            scale: Math.min(24, 13 + Math.log10(cluster.count + 1) * 5),
          },
          zIndex: Number(google.maps.Marker.MAX_ZINDEX) + cluster.count,
        }),
      },
    });
    return () => {
      clustererRef.current?.clearMarkers();
      clustererRef.current = null;
    };
  }, [map, cluster]);

  function getRefCallback(id: string) {
    if (!refCallbacksRef.current[id]) {
      refCallbacksRef.current[id] = (marker: google.maps.Marker | null) => {
        if (marker) markersRef.current[id] = marker;
        else delete markersRef.current[id];

        if (cluster && clustererRef.current) {
          clustererRef.current.clearMarkers();
          clustererRef.current.addMarkers(Object.values(markersRef.current));
        }
      };
    }
    return refCallbacksRef.current[id];
  }

  const selectedPin = pins.find((p) => p.id === selectedId) ?? null;

  return (
    <>
      {pins.map((pin) => (
        <Marker
          key={pin.id}
          position={{ lat: pin.lat, lng: pin.lng }}
          title={pin.label}
          ref={getRefCallback(pin.id)}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: selectedId === pin.id ? "#FACC15" : "#010066",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2,
            scale: selectedId === pin.id ? 10 : 7,
          }}
          onClick={() => onSelect(pin.id)}
        />
      ))}
      {selectedPin && markersRef.current[selectedPin.id] && (
        <InfoWindow anchor={markersRef.current[selectedPin.id]} onCloseClick={() => onSelect(null)}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{selectedPin.label}</div>
          {selectedPin.sublabel && <div style={{ fontSize: 11, color: "#666" }}>{selectedPin.sublabel}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
            {selectedPin.href && (
              <a href={selectedPin.href} style={{ fontSize: 11, fontWeight: 600, color: "var(--travel-blue)" }}>
                View details →
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
                  background: stopIds?.includes(selectedPin.id) ? "#16A34A" : "#010066",
                  border: "none",
                  borderRadius: 8,
                  padding: "5px 9px",
                  cursor: "pointer",
                }}
              >
                {stopIds?.includes(selectedPin.id) ? "✓ In trip" : "+ Add to trip"}
              </button>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  );
}

export function GoogleMap({
  pins,
  center,
  zoom = 11,
  height = 320,
  cluster,
  radiusCenter,
  radiusKm,
  onApiLoaded,
  userLocation,
  onAddStop,
  stopIds,
  routePath,
  routeColor = "#2563EB",
  routeDashed,
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
  onAddStop?: (pin: MapPin) => void;
  stopIds?: string[];
  routePath?: [number, number][];
  routeColor?: string;
  routeDashed?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl bg-muted text-sm text-muted-foreground text-center px-4"
        style={{ height }}
      >
        Map unavailable — set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey}>
      <Map
        defaultCenter={{ lat: center[0], lng: center[1] }}
        defaultZoom={zoom}
        gestureHandling="greedy"
        style={{ height, width: "100%", borderRadius: "1rem" }}
      >
        <ApiLoadedNotifier onApiLoaded={onApiLoaded} />
        <Recenter center={center} zoom={zoom} />
        <Markers pins={pins} cluster={cluster} selectedId={selectedId} onSelect={setSelectedId} onAddStop={onAddStop} stopIds={stopIds} />
        {routePath && routePath.length > 1 && <RouteLine path={routePath} color={routeColor} dashed={routeDashed} />}
        {userLocation && <YouAreHereMarker position={userLocation} />}
        {radiusCenter && radiusKm && (
          <Circle
            center={{ lat: radiusCenter[0], lng: radiusCenter[1] }}
            radius={radiusKm * 1000}
            strokeColor="#010066"
            strokeOpacity={0.5}
            strokeWeight={1.5}
            fillColor="#010066"
            fillOpacity={0.06}
          />
        )}
      </Map>
    </APIProvider>
  );
}
