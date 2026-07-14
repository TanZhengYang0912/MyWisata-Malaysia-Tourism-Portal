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

function Markers({
  pins,
  cluster,
  selectedId,
  onSelect,
}: {
  pins: MapPin[];
  cluster?: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
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
    clustererRef.current = new MarkerClusterer({ map });
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
          onClick={() => onSelect(pin.id)}
        />
      ))}
      {selectedPin && markersRef.current[selectedPin.id] && (
        <InfoWindow anchor={markersRef.current[selectedPin.id]} onCloseClick={() => onSelect(null)}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{selectedPin.label}</div>
          {selectedPin.sublabel && <div style={{ fontSize: 11, color: "#666" }}>{selectedPin.sublabel}</div>}
          {selectedPin.href && (
            <a href={selectedPin.href} style={{ fontSize: 11, fontWeight: 600, color: "var(--travel-blue)" }}>
              View details →
            </a>
          )}
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
}: {
  pins: MapPin[];
  center: [number, number];
  zoom?: number;
  height?: number;
  cluster?: boolean;
  radiusCenter?: [number, number];
  radiusKm?: number;
  onApiLoaded?: () => void;
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
        <Markers pins={pins} cluster={cluster} selectedId={selectedId} onSelect={setSelectedId} />
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
