"use client";

import { useTranslation } from "react-i18next";
import { useState } from "react";
import geoJson from "@/lib/demo-map/malaysia-states.json";
import { DEMO_STATES } from "@/lib/demo-map/data";
import { featureToPath, geometryBounds, projectPoint, type GeoBounds, type GeoJsonGeometry } from "@/lib/demo-map/geo";

// This plate intentionally follows the supplied reference: the two Malaysian
// regions are framed independently so both landmasses are immediately legible.
const WIDTH = 1600;
const HEIGHT = 1060;
const REGION_CANVASES = {
  peninsular: { x: 120, y: 195, width: 540, height: 760, padding: 18 },
  borneo: { x: 800, y: 255, width: 640, height: 560, padding: 18 },
} as const;

type StateRegion = keyof typeof REGION_CANVASES;
type StateLabelPlacement = {
  region: StateRegion;
  x: number;
  y: number;
  side: "left" | "right";
  elbowX: number;
};

// Presentation coordinates are deliberately hand-tuned per state. Labels stay
// outside the landmass, with varied elbow positions so leader routes feel
// intentional instead of like a repeated template.
export const STATE_LABEL_LAYOUT: Record<string, StateLabelPlacement> = {
  perlis: { region: "peninsular", x: 18, y: 420, side: "left", elbowX: 105 },
  kedah: { region: "peninsular", x: 18, y: 505, side: "left", elbowX: 115 },
  penang: { region: "peninsular", x: 18, y: 590, side: "left", elbowX: 125 },
  kelantan: { region: "peninsular", x: 18, y: 675, side: "left", elbowX: 138 },
  perak: { region: "peninsular", x: 18, y: 760, side: "left", elbowX: 150 },
  selangor: { region: "peninsular", x: 18, y: 845, side: "left", elbowX: 162 },
  "kuala-lumpur": { region: "peninsular", x: 18, y: 930, side: "left", elbowX: 174 },
  putrajaya: { region: "peninsular", x: 18, y: 1015, side: "left", elbowX: 186 },
  terengganu: { region: "peninsular", x: 800, y: 520, side: "right", elbowX: 700 },
  pahang: { region: "peninsular", x: 800, y: 620, side: "right", elbowX: 684 },
  "negeri-sembilan": { region: "peninsular", x: 800, y: 820, side: "right", elbowX: 668 },
  melaka: { region: "peninsular", x: 800, y: 910, side: "right", elbowX: 652 },
  johor: { region: "peninsular", x: 800, y: 1000, side: "right", elbowX: 636 },
  sarawak: { region: "borneo", x: 690, y: 720, side: "left", elbowX: 755 },
  sabah: { region: "borneo", x: 1540, y: 450, side: "right", elbowX: 1460 },
  labuan: { region: "borneo", x: 1540, y: 540, side: "right", elbowX: 1445 },
};

type StateFeature = {
  type: "Feature";
  properties: { id: string; name: string };
  geometry: GeoJsonGeometry;
};

/** Per-state breakdown of listings across the 4 top-level categories. */
export type StateCounts = Record<string, { category: string; count: number }[]>;

const stateFeatures = (geoJson as { features: StateFeature[] }).features;
const peninsularFeatures = stateFeatures.filter((feature) => DEMO_STATES.find((state) => state.id === feature.properties.id)?.region === "Peninsular");
const borneoFeatures = stateFeatures.filter((feature) => DEMO_STATES.find((state) => state.id === feature.properties.id)?.region === "Borneo");
const WEST_MAP_BOUNDS = geometryBounds(peninsularFeatures.map((feature) => feature.geometry));
const BORNEO_MAP_BOUNDS = geometryBounds(borneoFeatures.map((feature) => feature.geometry));

function stateColor(stateId: string, selected: boolean): string {
  if (selected) return "#c7d2fe";
  return DEMO_STATES.find((item) => item.id === stateId)?.region === "Borneo" ? "#d5defb" : "#dce4ff";
}

function regionForState(stateId: string): StateRegion {
  return DEMO_STATES.find((state) => state.id === stateId)?.region === "Borneo" ? "borneo" : "peninsular";
}

function boundsForRegion(region: StateRegion): GeoBounds {
  return region === "borneo" ? BORNEO_MAP_BOUNDS : WEST_MAP_BOUNDS;
}

function canvasForRegion(region: StateRegion) {
  return REGION_CANVASES[region];
}

function projected(place: { lat: number; lng: number }, region: StateRegion) {
  const canvas = canvasForRegion(region);
  const point = projectPoint([place.lng, place.lat], boundsForRegion(region), canvas);
  return { x: canvas.x + point.x, y: canvas.y + point.y };
}

export function buildStateCalloutPath(
  point: { x: number; y: number },
  placement: StateLabelPlacement,
  width: number,
): string {
  const boxX = placement.side === "left" ? placement.x : placement.x - width;
  const lineEndX = placement.side === "left" ? boxX + width : boxX;
  if (Math.abs(point.y - placement.y) < 4) return `M ${point.x} ${point.y} H ${lineEndX}`;
  return `M ${point.x} ${point.y} H ${placement.elbowX} V ${placement.y} H ${lineEndX}`;
}

function statePlacesCount(stateCounts: StateCounts, stateId: string): number {
  return (stateCounts[stateId] ?? []).reduce((total, bucket) => total + bucket.count, 0);
}

function stateLabelWidth(name: string): number {
  return Math.max(150, Math.min(250, name.length * 11.5 + 54));
}

function renderRegionFeatures(
  features: StateFeature[],
  region: StateRegion,
  selectedStateId: string | null,
  onSelectState: (stateId: string | null) => void,
  setHoveredStateId: React.Dispatch<React.SetStateAction<string | null>>,
  handleKeyDown: (event: React.KeyboardEvent<SVGGElement>, action: () => void) => void,
) {
  const canvas = canvasForRegion(region);
  const bounds = boundsForRegion(region);
  return (
    <g transform={`translate(${canvas.x} ${canvas.y})`}>
      {features.map((feature) => {
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
              d={featureToPath(feature.geometry, bounds, canvas)}
              fill={stateColor(state.id, selected)}
              stroke={selected ? "#010066" : "#aab8df"}
              strokeWidth={selected ? 2.4 : 1.25}
              className="cursor-pointer transition-colors"
              role="button"
              tabIndex={0}
              aria-label={`Select ${state.name}`}
              onClick={() => onSelectState(selected ? null : state.id)}
              onKeyDown={(event) => handleKeyDown(event, () => onSelectState(selected ? null : state.id))}
            >
            </path>
          </g>
        );
      })}
    </g>
  );
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
  const { t } = useTranslation("customer");
  const [hoveredStateId, setHoveredStateId] = useState<string | null>(null);
  const activeStateId = hoveredStateId ?? selectedStateId;

  function handleKeyDown(event: React.KeyboardEvent<SVGGElement>, action: () => void) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  }

  return (
    <div className="relative aspect-[1600/1060] min-h-[620px] overflow-hidden rounded-[1.8rem] border border-[#c5cfee] bg-[#eef2ff] shadow-none sm:min-h-[760px] lg:h-full lg:aspect-auto lg:min-h-0">
      <div className="pointer-events-none absolute left-6 right-6 top-5 z-10 border-b border-[#b7c6d4] pb-3 sm:left-8 sm:right-8 sm:pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-[#91a4b5] 2xl:text-[11px]">{t("ui.labels.malaysia")}</p>
            <h2 className="mt-1 font-[family-name:var(--font-display)] text-[22px] font-bold leading-tight text-[#1d2b3a] lg:text-[22px] 2xl:text-[32px]">{t("ui.map.allStatesTerritories")}</h2>
            <p className="mt-1 max-w-2xl text-[10px] text-[#718395] lg:text-[10px] 2xl:text-sm">{t("ui.map.independentScaleNote")}</p>
          </div>
          <div className="hidden shrink-0 text-right text-[10px] text-[#718395] lg:block 2xl:text-xs">
            <p className="font-bold text-[#1d2b3a]">16 regions · 64 places</p>
            <p className="mt-1">Select a region to explore</p>
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" role="img" aria-label="Interactive map of Malaysia showing all states and federal territories" className="relative block h-full w-full">
        <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="transparent" onClick={() => onDismissPlace?.()} />
        <g opacity={0.42} stroke="#ffffff" strokeWidth="1">
          {Array.from({ length: 9 }, (_, index) => <path key={`lat-${index}`} d={`M 40 ${225 + index * 94} H ${WIDTH - 40}`} />)}
          {Array.from({ length: 12 }, (_, index) => <path key={`lng-${index}`} d={`M ${120 + index * 122} 225 V 990`} />)}
        </g>

        {renderRegionFeatures(peninsularFeatures, "peninsular", selectedStateId, onSelectState, setHoveredStateId, handleKeyDown)}
        {renderRegionFeatures(borneoFeatures, "borneo", selectedStateId, onSelectState, setHoveredStateId, handleKeyDown)}

        <g aria-hidden="true">
          {DEMO_STATES.map((state) => {
            const region = regionForState(state.id);
            const point = projected({ lat: state.label[1], lng: state.label[0] }, region);
            const placement = STATE_LABEL_LAYOUT[state.id] ?? { region, x: point.x, y: point.y, side: "right" as const, elbowX: point.x };
            const active = state.id === activeStateId;
            const width = stateLabelWidth(state.name);
            return (
              <g key={`callout-${state.id}`}>
                <path
                  d={buildStateCalloutPath(point, placement, width)}
                  fill="none"
                  stroke={active ? "#010066" : "#9eafbf"}
                  strokeWidth={active ? 2 : 1.35}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
                <circle cx={point.x} cy={point.y} r={active ? 5 : 4} fill={active ? "#010066" : "#f59e0b"} stroke="#f8fafc" strokeWidth="2" />
              </g>
            );
          })}
        </g>
      </svg>

      <div data-state-label-layer className="pointer-events-none absolute inset-0 z-10" aria-label="Malaysia state labels">
        {DEMO_STATES.map((state) => {
          const region = regionForState(state.id);
          const point = projected({ lat: state.label[1], lng: state.label[0] }, region);
          const placement = STATE_LABEL_LAYOUT[state.id] ?? { region, x: point.x, y: point.y, side: "right" as const, elbowX: point.x };
          const active = state.id === activeStateId;
          const width = stateLabelWidth(state.name);
          const boxX = placement.side === "left" ? placement.x : placement.x - width;
          const places = statePlacesCount(stateCounts, state.id);
          return (
            <button
              key={`label-${state.id}`}
              type="button"
              data-state-label={state.id}
              aria-label={`Select ${state.name}`}
              aria-pressed={state.id === selectedStateId}
              onMouseEnter={() => setHoveredStateId(state.id)}
              onMouseLeave={() => setHoveredStateId((current) => (current === state.id ? null : current))}
              onClick={() => onSelectState(state.id === selectedStateId ? null : state.id)}
              className={`pointer-events-auto absolute -translate-y-1/2 h-[22px] min-h-0 overflow-hidden rounded-lg border px-1 py-0 text-left shadow-[0_3px_10px_rgba(1,0,102,0.06)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#010066] focus-visible:ring-offset-1 lg:h-[22px] lg:px-1.5 2xl:h-auto 2xl:min-h-[44px] 2xl:rounded-xl 2xl:px-3.5 2xl:py-2 ${active ? "border-[#010066] bg-[#010066] text-white shadow-[0_6px_18px_rgba(1,0,102,0.18)]" : "border-[#aebdcb] bg-white/95 text-[#24313a] hover:border-[#010066]"}`}
              style={{ left: `${(boxX / WIDTH) * 100}%`, top: `${(placement.y / HEIGHT) * 100}%`, width: `clamp(112px, ${(width / WIDTH) * 100}%, 250px)` }}
            >
              <span className="block truncate text-[10px] font-bold leading-none lg:text-[11px] 2xl:text-base">{state.name}</span>
              <span className={`mt-0.5 block truncate text-[8px] leading-none lg:text-[9px] 2xl:text-xs ${active ? "text-white/70" : "text-[#718395]"}`}>
                {places} {places === 1 ? "place" : "places"}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
