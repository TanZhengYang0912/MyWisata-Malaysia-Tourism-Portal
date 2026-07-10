"use client";

import dynamic from "next/dynamic";
import type { MapPin } from "./leaflet-map";

// react-leaflet touches `window` at import time — must be client-only, no SSR.
const LeafletMap = dynamic(() => import("./leaflet-map").then((m) => m.LeafletMap), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center rounded-2xl bg-muted text-sm text-muted-foreground" style={{ height: 320 }}>
      Loading map…
    </div>
  ),
});

export function MapView(props: { pins: MapPin[]; center: [number, number]; zoom?: number; height?: number }) {
  return <LeafletMap {...props} />;
}
