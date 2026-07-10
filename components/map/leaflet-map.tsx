"use client";

import { useEffect } from "react";
import { MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";

// Bundlers break Leaflet's default marker icon paths — point them at the CDN.
const defaultIcon = L.icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
  href?: string;
}

function Recenter({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center[0], center[1], zoom, map]);
  return null;
}

export function LeafletMap({
  pins,
  center,
  zoom = 11,
  height = 320,
}: {
  pins: MapPin[];
  center: [number, number];
  zoom?: number;
  height?: number;
}) {
  return (
    <MapContainer center={center} zoom={zoom} style={{ height, width: "100%", borderRadius: "1rem" }} scrollWheelZoom={false}>
      <Recenter center={center} zoom={zoom} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {pins.map((pin) => (
        <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={defaultIcon}>
          <Popup>
            <div className="text-sm font-semibold">{pin.label}</div>
            {pin.sublabel && <div className="text-xs text-muted-foreground">{pin.sublabel}</div>}
            {pin.href && (
              <a href={pin.href} className="text-xs font-semibold" style={{ color: "#0F5D4A" }}>
                View details →
              </a>
            )}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
