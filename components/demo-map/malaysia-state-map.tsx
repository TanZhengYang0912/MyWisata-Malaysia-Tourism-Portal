"use client";

import { useState } from "react";
import geoJson from "@/lib/demo-map/malaysia-states.json";
import { DEMO_STATES } from "@/lib/demo-map/data";
import { featureToPath, geometryBounds, projectPoint, type GeoBounds, type GeoJsonGeometry } from "@/lib/demo-map/geo";

const WIDTH = 960;
const HEIGHT = 520;
const PADDING = 30;
const CANVAS = { width: WIDTH, height: HEIGHT, padding: PADDING };

type StateFeature = {
  type: "Feature";
  properties: { id: string; name: string };
  geometry: GeoJsonGeometry;
};

/** Per-state breakdown of listings across the 4 top-level categories. */
export type StateCounts = Record<string, { icon: string; count: number }[]>;

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
  stateCounts,
  selectedStateId,
  onSelectState,
  onDismissPlace,
}: {
  stateCounts: StateCounts;
  selectedStateId: string | null;
  onSelectState: (stateId: string | null) => void;
  onDismissPlace?: () => void;
}) {
  const [hoveredStateId, setHoveredStateId] = useState<string | null>(null);

  const activeStateId = hoveredStateId ?? selectedStateId;
  const activeState = DEMO_STATES.find((state) => state.id === activeStateId);
  const activeCounts = activeStateId ? stateCounts[activeStateId] : undefined;
  const activePoint = activeState ? projected({ lat: activeState.label[1], lng: activeState.label[0] }, bounds) : null;

  function handleKeyDown(event: React.KeyboardEvent<SVGGElement>, action: () => void) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  }

  return (
    <div className="relative overflow-hidden rounded-[2rem] border border-border bg-secondary shadow-[0_18px_44px_rgba(1,0,102,0.12)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,0.46),transparent_30%),linear-gradient(135deg,rgba(255,255,255,0.08),transparent_55%)]" />
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Interactive map of Malaysia showing all states and federal territories" className="relative block h-auto min-h-[360px] w-full">
        <title>Malaysia state discovery map</title>
        {/* Bottom-most background — only receives clicks that miss every state/marker above it, so this dismisses the selected place without stopPropagation gymnastics on every interactive child. */}
        <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="transparent" onClick={() => onDismissPlace?.()} />
        <g opacity={0.34} stroke="#ffffff" strokeWidth="1">
          {Array.from({ length: 9 }, (_, index) => <path key={`lat-${index}`} d={`M 0 ${70 + index * 50} H ${WIDTH}`} />)}
          {Array.from({ length: 13 }, (_, index) => <path key={`lng-${index}`} d={`M ${40 + index * 72} 0 V ${HEIGHT}`} />)}
        </g>

        {stateFeatures.map((feature) => {
          const state = DEMO_STATES.find((item) => item.id === feature.properties.id);
          if (!state) return null;
          const selected = state.id === selectedStateId;
          return (
            <g
              key={state.id}
              onMouseEnter={() => setHoveredStateId(state.id)}
              onMouseLeave={() => setHoveredStateId((current) => (current === state.id ? null : current))}
            >
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

      </svg>

      {activeState && activeCounts && activeCounts.length > 0 && activePoint && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full"
          style={{ left: `${(activePoint.x / WIDTH) * 100}%`, top: `${(activePoint.y / HEIGHT) * 100}%` }}
        >
          <div className="mb-3 whitespace-nowrap rounded-xl border border-white/80 bg-white/95 px-3 py-2 text-center shadow-lg backdrop-blur-sm">
            <p className="text-[11px] font-bold text-primary">{activeState.name}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-foreground">
              {activeCounts.map((c) => `${c.icon} ${c.count}`).join("  ·  ")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
