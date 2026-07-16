"use client";

import dynamic from "next/dynamic";
import type { MapPin } from "./google-map";

export type { MapPin };

// @vis.gl/react-google-maps touches `window` at import time — must be client-only, no SSR.
const GoogleMap = dynamic(() => import("./google-map").then((m) => m.GoogleMap), {
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
  onAddStop?: (pin: MapPin) => void;
  stopIds?: string[];
  routePath?: [number, number][];
  routeColor?: string;
  routeDashed?: boolean;
}) {
  return <GoogleMap {...props} />;
}
