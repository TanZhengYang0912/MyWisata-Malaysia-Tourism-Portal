"use client";

import { useMemo, useState } from "react";
import geoJson from "@/lib/demo-map/malaysia-states.json";
import { DEMO_STATES } from "@/lib/demo-map/data";
import { featureToPath, geometryBounds, projectPoint, type GeoBounds, type GeoJsonGeometry } from "@/lib/demo-map/geo";
import type { DemoLocation, MapPlace } from "@/lib/demo-map/types";

const WIDTH = 960;
const HEIGHT = 520;
const PADDING = 30;
const CANVAS = { width: WIDTH, height: HEIGHT, padding: PADDING };

type StateFeature = {
  type: "Feature";
  properties: { id: string; name: string };
  geometry: GeoJsonGeometry;
};

const stateFeatures = (geoJson as { features: StateFeature[] }).features;
const bounds = geometryBounds(stateFeatures.map((feature) => feature.geometry));

function stateColor(stateId: string, selected: boolean): string {
  if (selected) return "#ffcc00";
  const state = DEMO_STATES.find((item) => item.id === stateId);
  return state?.region === "Borneo" ? "#e2e6ff" : "#eef2ff";
}

function projected(place: { lat: number; lng: number }, mapBounds: GeoBounds) {
  return projectPoint([place.lng, place.lat], mapBounds, CANVAS);
}

export function MalaysiaStateMap({
  places,
  location,
  selectedPlaceId,
  selectedStateId,
  onSelectPlace,
  onSelectState,
}: {
  places: MapPlace[];
  location?: DemoLocation | null;
  selectedPlaceId: string | null;
  selectedStateId: string | null;
  onSelectPlace: (placeId: string) => void;
  onSelectState: (stateId: string | null) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const zoomedIn = zoom > 1;
  const selectedState = DEMO_STATES.find((state) => state.id === selectedStateId);

  const clusters = useMemo(() => {
    if (zoomedIn) return [];
    const grouped = new Map<string, MapPlace[]>();
    for (const place of places) grouped.set(place.stateId, [...(grouped.get(place.stateId) ?? []), place]);
    return [...grouped.entries()].map(([stateId, groupedPlaces]) => ({
      stateId,
      places: groupedPlaces,
      point: projected({ lat: groupedPlaces[0].lat, lng: groupedPlaces[0].lng }, bounds),
    }));
  }, [places, zoomedIn]);

  const locationPoint = location ? projected(location, bounds) : null;

  function handleKeyDown(event: React.KeyboardEvent<SVGGElement>, action: () => void) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  }

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-border bg-secondary shadow-[0_18px_44px_rgba(1,0,102,0.12)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.46),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_55%)]" />
      <div className="absolute right-4 top-4 z-10 flex flex-col overflow-hidden rounded-xl border border-white/80 bg-white/90 shadow-lg backdrop-blur-sm">
        <button type="button" aria-label="Zoom in" onClick={() => setZoom((value) => Math.min(2, value + 1))} className="px-3 py-2 text-sm font-bold text-primary hover:bg-secondary">+</button>
        <button type="button" aria-label="Zoom out" onClick={() => setZoom((value) => Math.max(1, value - 1))} className="border-t border-border px-3 py-2 text-sm font-bold text-primary hover:bg-secondary">−</button>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Interactive map of Malaysia showing all states and federal territories" className="relative block h-auto min-h-[360px] w-full">
        <title>Malaysia state discovery map</title>
        <g opacity={0.34} stroke="#ffffff" strokeWidth="1">
          {Array.from({ length: 9 }, (_, index) => <path key={`lat-${index}`} d={`M 0 ${70 + index * 50} H ${WIDTH}`} />)}
          {Array.from({ length: 13 }, (_, index) => <path key={`lng-${index}`} d={`M ${40 + index * 72} 0 V ${HEIGHT}`} />)}
        </g>

        {stateFeatures.map((feature) => {
          const state = DEMO_STATES.find((item) => item.id === feature.properties.id);
          if (!state) return null;
          const selected = state.id === selectedStateId;
          return (
            <g key={state.id}>
              <path
                d={featureToPath(feature.geometry, bounds, CANVAS)}
                fill={stateColor(state.id, selected)}
                stroke={selected ? "#b38a00" : "#c3c8ee"}
                strokeWidth={selected ? 2.4 : 1.5}
                className="cursor-pointer transition-colors"
                role="button"
                tabIndex={0}
                aria-label={`Select ${state.name}`}
                onClick={() => onSelectState(selected ? null : state.id)}
                onKeyDown={(event) => handleKeyDown(event, () => onSelectState(selected ? null : state.id))}
              >
                <title>{state.name}</title>
              </path>
            </g>
          );
        })}

        {DEMO_STATES.map((state) => {
          const point = projected({ lat: state.label[1], lng: state.label[0] }, bounds);
          const compact = state.name === "Kuala Lumpur" || state.name === "Putrajaya" || state.name === "Labuan";
          return (
            <g key={`label-${state.id}`} className="pointer-events-none">
              <text x={point.x} y={point.y} textAnchor="middle" fill="#010066" fontSize={compact ? 10 : 11} fontWeight={700} paintOrder="stroke" stroke="#eef2ff" strokeWidth="4" strokeLinejoin="round">
                {state.name}
              </text>
            </g>
          );
        })}

        {!zoomedIn && clusters.map((cluster) => {
          const state = DEMO_STATES.find((item) => item.id === cluster.stateId);
          if (!state) return null;
          return (
            <g
              key={`cluster-${cluster.stateId}`}
              role="button"
              tabIndex={0}
              aria-label={`${cluster.places.length} places in ${state.name}`}
              className="cursor-pointer"
              onClick={() => onSelectPlace(cluster.places[0].id)}
              onKeyDown={(event) => handleKeyDown(event, () => onSelectPlace(cluster.places[0].id))}
            >
              <circle cx={cluster.point.x} cy={cluster.point.y} r={cluster.places.length > 1 ? 17 : 9} fill="#010066" stroke="#ffffff" strokeWidth="4" />
              {cluster.places.length > 1 && <text x={cluster.point.x} y={cluster.point.y + 4} textAnchor="middle" fill="#ffffff" fontSize="11" fontWeight={800}>{cluster.places.length}</text>}
              {cluster.places.length === 1 && <circle cx={cluster.point.x} cy={cluster.point.y} r={3} fill="#ffcc00" />}
            </g>
          );
        })}

        {zoomedIn && places.map((place) => {
          const point = projected(place, bounds);
          const selected = place.id === selectedPlaceId;
          return (
            <g
              key={place.id}
              role="button"
              tabIndex={0}
              aria-label={`Open ${place.name}`}
              className="cursor-pointer"
              onClick={() => onSelectPlace(place.id)}
              onKeyDown={(event) => handleKeyDown(event, () => onSelectPlace(place.id))}
            >
              <circle cx={point.x} cy={point.y} r={selected ? 11 : 8} fill="#010066" stroke="#ffffff" strokeWidth={selected ? 4 : 3} />
              <circle cx={point.x} cy={point.y} r={selected ? 3.5 : 2.5} fill="#ffffff" />
              <title>{place.name}</title>
            </g>
          );
        })}

        {locationPoint && (
          <g aria-label="Your current location">
            <circle cx={locationPoint.x} cy={locationPoint.y} r="14" fill="#010066" opacity="0.18" />
            <circle cx={locationPoint.x} cy={locationPoint.y} r="6" fill="#010066" stroke="#ffffff" strokeWidth="3" />
          </g>
        )}
      </svg>
      <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between gap-2 text-[10px] font-semibold text-primary">
        <span className="rounded-full border border-white/80 bg-white/85 px-3 py-1.5 backdrop-blur-sm">{zoomedIn ? "Place pins" : `${places.length} experiences · tap a cluster`}</span>
        <button type="button" onClick={() => onSelectState(null)} className={`rounded-full border border-white/80 bg-white/85 px-3 py-1.5 backdrop-blur-sm hover:bg-white ${selectedState ? "" : "opacity-0"}`}>Clear state</button>
      </div>
    </div>
  );
}
