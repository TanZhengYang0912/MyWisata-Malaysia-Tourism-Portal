"use client";

import dynamic from "next/dynamic";
import type { MapPin } from "./maplibre-map";

export type { MapPin };

// maplibre-gl touches `window`/WebGL at import time — must be client-only, no SSR.
const MaplibreMap = dynamic(() => import("./maplibre-map").then((m) => m.MaplibreMap), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-2xl bg-muted text-sm text-muted-foreground" style={{ height: 320 }}>
      Loading map…
    </div>
  ),
});

export function MapView(props: {
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
  routes?: { path: [number, number][]; selected: boolean }[];
  routeColor?: string;
  routeDashed?: boolean;
  focusRequest?: { pin: MapPin; token: number } | null;
}) {
  return <MaplibreMap {...props} />;
}
