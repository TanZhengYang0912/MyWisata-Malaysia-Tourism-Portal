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
const MAP_VIEWBOX_TOP = 100;
const MAP_VIEWBOX_HEIGHT = 860;
const MAP_VIEWBOX_BOTTOM = MAP_VIEWBOX_TOP + MAP_VIEWBOX_HEIGHT;
const SINGLE_CANVAS = { x: 0, y: 0, width: WIDTH, height: HEIGHT, padding: 40 };
type StateRegion = "peninsular" | "borneo";
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
const ALL_MAP_BOUNDS = geometryBounds(stateFeatures.map((feature) => feature.geometry));

function stateColor(stateId: string, selected: boolean): string {
  if (selected) return "#c7d2fe";
  return DEMO_STATES.find((item) => item.id === stateId)?.region === "Borneo" ? "#d5defb" : "#dce4ff";
}

function regionForState(stateId: string): StateRegion {
  return DEMO_STATES.find((state) => state.id === stateId)?.region === "Borneo" ? "borneo" : "peninsular";
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function boundsForRegion(region: StateRegion): GeoBounds {
  return ALL_MAP_BOUNDS;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function canvasForRegion(region: StateRegion) {
  return SINGLE_CANVAS;
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

function visibleStateLabelPlacement(placement: StateLabelPlacement): StateLabelPlacement {
  return {
    ...placement,
    y: Math.min(MAP_VIEWBOX_BOTTOM - 36, Math.max(MAP_VIEWBOX_TOP + 36, placement.y)),
  };
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
              className="transition-colors"
              aria-hidden="true"
            />
            <path
              d={featureToPath(feature.geometry, bounds, canvas)}
              data-state-hit-area={state.id}
              fill="#ffffff"
              fillOpacity={0}
              stroke="#010066"
              strokeOpacity={0}
              strokeWidth={18}
              pointerEvents="all"
              vectorEffect="non-scaling-stroke"
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`Select ${state.name}`}
              onClick={() => onSelectState(selected ? null : state.id)}
              onKeyDown={(event) => handleKeyDown(event, () => onSelectState(selected ? null : state.id))}
            />
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
  const activeState = DEMO_STATES.find((state) => state.id === activeStateId);
  const visibleStates = activeState ? [activeState] : [];
  const activeStatePresentation = activeState
    ? (() => {
        const region = regionForState(activeState.id);
        const point = projected({ lat: activeState.label[1], lng: activeState.label[0] }, region);
        const placement = visibleStateLabelPlacement(STATE_LABEL_LAYOUT[activeState.id] ?? { region, x: point.x, y: point.y, side: "right" as const, elbowX: point.x });
        const width = stateLabelWidth(activeState.name);
        return { point, placement, width };
      })()
    : null;
  const activeCalloutPath = activeStateId ? buildStateCalloutPath(
    activeStatePresentation?.point ?? { x: 0, y: 0 },
    activeStatePresentation?.placement ?? { region: "peninsular", x: 0, y: 0, side: "right", elbowX: 0 },
    activeStatePresentation?.width ?? 0,
  )
    : null;

  function handleKeyDown(event: React.KeyboardEvent<SVGGElement>, action: () => void) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      action();
    }
  }

  return (
    <div className="relative w-full max-w-full aspect-[1600/1060] min-h-[440px] overflow-hidden rounded-[1.8rem] border border-border bg-card shadow-sm sm:min-h-[500px] lg:h-[620px] lg:aspect-auto lg:min-h-0">
      <div className="pointer-events-none absolute left-5 right-5 top-4 z-10 border-b border-border pb-3 sm:left-7 sm:right-7 sm:pb-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary 2xl:text-[11px]">{t("ui.labels.malaysia")}</p>
            <h2 className="mt-1 font-[family-name:var(--font-display)] text-[20px] font-bold leading-tight text-foreground sm:text-[24px] 2xl:text-[30px]">{t("ui.map.allStatesTerritories")}</h2>
            <p className="mt-1 max-w-2xl text-[10px] text-muted-foreground 2xl:text-sm">{t("ui.map.chooseState")}</p>
          </div>
          <div className="hidden shrink-0 text-right text-[10px] text-muted-foreground lg:block 2xl:text-xs">
            <p className="font-bold text-foreground">16 regions · 64 places</p>
            <p className="mt-1">{t("ui.map.openDistrictPrompt")}</p>
          </div>
        </div>
      </div>
      <svg
        viewBox={`0 ${MAP_VIEWBOX_TOP} ${WIDTH} ${MAP_VIEWBOX_HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={t("ui.map.allStatesTerritories")}
        className="relative block h-full w-full"
        onClick={(event) => {
          if (event.target === event.currentTarget) onDismissPlace?.();
        }}
      >
        <rect x="0" y="0" width={WIDTH} height={HEIGHT} fill="transparent" pointerEvents="none" onClick={() => onDismissPlace?.()} />
        <g opacity={0.18} stroke="#ffffff" strokeWidth="1">
          {Array.from({ length: 9 }, (_, index) => <path key={`lat-${index}`} d={`M 40 ${225 + index * 94} H ${WIDTH - 40}`} />)}
          {Array.from({ length: 12 }, (_, index) => <path key={`lng-${index}`} d={`M ${120 + index * 122} 225 V 990`} />)}
        </g>

        {renderRegionFeatures(peninsularFeatures, "peninsular", selectedStateId, onSelectState, setHoveredStateId, handleKeyDown)}
        {renderRegionFeatures(borneoFeatures, "borneo", selectedStateId, onSelectState, setHoveredStateId, handleKeyDown)}

        <g aria-hidden="true">
          {activeStatePresentation && activeCalloutPath && (
            <g>
              <path
                d={activeCalloutPath}
                fill="none"
                stroke="#010066"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <circle cx={activeStatePresentation.point.x} cy={activeStatePresentation.point.y} r={5} fill="#010066" stroke="#f8fafc" strokeWidth="2" />
            </g>
          )}
        </g>
      </svg>

      <div data-state-label-layer className="pointer-events-none absolute inset-0 z-10" aria-label={t("ui.map.allStatesTerritories")}>
        <p className="sr-only">Select a state to explore.</p>
        {visibleStates.map((state) => {
          const region = regionForState(state.id);
          const point = projected({ lat: state.label[1], lng: state.label[0] }, region);
          const placement = visibleStateLabelPlacement(STATE_LABEL_LAYOUT[state.id] ?? { region, x: point.x, y: point.y, side: "right" as const, elbowX: point.x });
          const width = stateLabelWidth(state.name);
          const boxX = placement.side === "left" ? placement.x : placement.x - width;
          const places = statePlacesCount(stateCounts, state.id);
          return (
            <button
              key={`label-${state.id}`}
              type="button"
              data-state-label={state.id}
              aria-label={`${t("ui.map.viewDestination")} ${state.name}`}
              aria-pressed={state.id === selectedStateId}
              onMouseEnter={() => setHoveredStateId(state.id)}
              onMouseLeave={() => setHoveredStateId((current) => (current === state.id ? null : current))}
              onClick={() => onSelectState(state.id === selectedStateId ? null : state.id)}
              className="pointer-events-auto absolute -translate-y-1/2 overflow-hidden rounded-xl border border-[#010066] bg-[#010066] px-3 py-2 text-left text-white shadow-[0_8px_22px_rgba(1,0,102,0.2)] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#010066] focus-visible:ring-offset-1"
              style={{ left: `${(boxX / WIDTH) * 100}%`, top: `${((placement.y - MAP_VIEWBOX_TOP) / MAP_VIEWBOX_HEIGHT) * 100}%`, width: `clamp(128px, ${(width / WIDTH) * 100}%, 240px)` }}
            >
              <span className="block truncate text-xs font-bold leading-none 2xl:text-sm">{state.name}</span>
              <span className="mt-1 block truncate text-[10px] leading-none text-white/70">
                {places} {t(places === 1 ? "ui.labels.place" : "ui.labels.places")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
