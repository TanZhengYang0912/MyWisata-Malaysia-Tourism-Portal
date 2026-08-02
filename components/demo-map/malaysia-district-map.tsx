"use client";

import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import geoJson from "@/lib/demo-map/malaysia-states.json";
import { DEMO_STATES } from "@/lib/demo-map/data";
import { getDistricts } from "@/lib/demo-map/districts";
import { featureToPath, geometryBounds, projectPoint, type GeoBounds, type GeoJsonGeometry } from "@/lib/demo-map/geo";

const MAX_WIDTH = 1080;
const MAX_HEIGHT = 760;
const PADDING = 18;

/**
 * Sheet palette. Warm land against cool water is what makes a shape read as a
 * map rather than a blob — the product tokens have no land/sea pair, and this
 * prototype is deliberately not styled as a product screen, so they live here
 * instead of in globals.css. Selection and markers still use the product's own
 * primary and highlight tokens so the interaction language matches the app.
 */
const SEA = "#DCE8F2";
const LAND = "#F1E8D4";
const LAND_QUIET = "#E4E7EB";
const LAND_ACTIVE = "#FBF4DE";
const GRATICULE = "#AFC2D3";
const COAST = "#8FA6BC";

type StateFeature = { properties: { id: string; name: string }; geometry: GeoJsonGeometry };
type Region = "Peninsular" | "Borneo";

const stateFeatures = (geoJson as { features: StateFeature[] }).features;
const nationalBounds = geometryBounds(stateFeatures.map((feature) => feature.geometry));

/** Listing counts keyed by state id, then district id. "" holds the state total. */
export type DistrictCounts = Record<string, Record<string, number>>;

/**
 * projectPoint scales longitude and latitude independently, so the canvas has
 * to match the extent's own proportions or the shape comes out squashed — a
 * tall narrow state like Perak was being stretched to fill a 960x520 box.
 */
function canvasFor(bounds: GeoBounds) {
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.0001);
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.0001);
  const scale = Math.min((MAX_WIDTH - PADDING * 2) / lngSpan, (MAX_HEIGHT - PADDING * 2) / latSpan);
  return {
    width: Math.round(lngSpan * scale) + PADDING * 2,
    height: Math.round(latSpan * scale) + PADDING * 2,
    padding: PADDING,
  };
}

/** Whole-degree grid at national scale, finer as you drill in. */
function graticuleStep(bounds: GeoBounds): number {
  const span = Math.max(bounds.maxLng - bounds.minLng, bounds.maxLat - bounds.minLat);
  if (span > 8) return 2;
  if (span > 3) return 1;
  return 0.5;
}

function ticks(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let value = Math.ceil(min / step) * step; value <= max; value += step) out.push(Number(value.toFixed(2)));
  return out;
}

/**
 * National view is a composite (inset) map: Peninsular and Borneo are two
 * separate landmasses across the South China Sea, so rather than one shared
 * projection leaving a quarter of the plate empty as sea, each half gets its
 * own scale and fills the full plate height — the same convention printed
 * maps use to inset Alaska and Hawaii. The gap between them is drawn, not
 * hidden, so it doesn't read as continuous geography.
 *
 * Only the geometry (bounds + canvas) is static — how far apart the two
 * plates sit depends on how many state pin-cards each side's gutter needs to
 * hold, which depends on `counts`, so offsets are computed per-render in
 * `nationalLayout` below rather than here.
 */
interface RegionPlateGeo {
  bounds: GeoBounds;
  canvas: { width: number; height: number; padding: number };
}

const REGION_GAP = 48;

function regionBounds(region: Region): GeoBounds {
  const ids = new Set(DEMO_STATES.filter((state) => state.region === region).map((state) => state.id));
  return geometryBounds(stateFeatures.filter((item) => ids.has(item.properties.id)).map((item) => item.geometry));
}

function plateCanvas(bounds: GeoBounds, targetHeight: number) {
  const lngSpan = Math.max(bounds.maxLng - bounds.minLng, 0.0001);
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, 0.0001);
  const scale = (targetHeight - PADDING * 2) / latSpan;
  return { width: Math.round(lngSpan * scale) + PADDING * 2, height: targetHeight, padding: PADDING };
}

const WEST_GEO: RegionPlateGeo = { bounds: regionBounds("Peninsular"), canvas: plateCanvas(regionBounds("Peninsular"), MAX_HEIGHT) };
const EAST_GEO: RegionPlateGeo = { bounds: regionBounds("Borneo"), canvas: plateCanvas(regionBounds("Borneo"), MAX_HEIGHT) };
const WEST_STEP = graticuleStep(WEST_GEO.bounds);
const EAST_STEP = graticuleStep(EAST_GEO.bounds);

/** Sizing for a state's pin card, pulled out to the plate's outer gutter. */
const CARD_PADDING_X = 8;
const CARD_HEIGHT = 34;
const NAME_CHAR_WIDTH = 6.4;
const COUNT_CHAR_WIDTH = 5.4;
const ELBOW_GAP = 14;
const CARD_ROW_SPACING = CARD_HEIGHT + 12;

function countLabel(n: number): string {
  return `${n} listing${n === 1 ? "" : "s"}`;
}

function cardWidth(name: string, count: number): number {
  return Math.max(name.length * NAME_CHAR_WIDTH, countLabel(count).length * COUNT_CHAR_WIDTH) + CARD_PADDING_X * 2;
}

export function MalaysiaDistrictMap({
  counts,
  stateId,
  districtId,
  onSelectState,
  onSelectDistrict,
}: {
  counts: DistrictCounts;
  stateId: string | null;
  districtId: string | null;
  onSelectState: (stateId: string | null) => void;
  onSelectDistrict: (districtId: string | null) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  const feature = stateId ? stateFeatures.find((item) => item.properties.id === stateId) : undefined;
  const districts = useMemo(() => (stateId ? getDistricts(stateId) : []), [stateId]);

  // Drilling into a state re-fits the projection to its own extent — real
  // shape, real proportions. Only the national overview below is composite.
  const bounds = useMemo(() => (feature ? geometryBounds([feature.geometry]) : nationalBounds), [feature]);
  const core = useMemo(() => (feature ? canvasFor(bounds) : null), [feature, bounds]);

  const activeState = DEMO_STATES.find((item) => item.id === stateId);
  const total = (id: string) => counts[id]?.[""] ?? 0;
  const stockedCount = districts.filter((d) => (counts[stateId!]?.[d.id] ?? 0) > 0).length;

  /**
   * A dot per daerah, the way a printed tourist map marks towns — no
   * invented boundaries, no permanent label. Every district's name shows on
   * hover/focus only; the stocked/hollow dot colour is the only thing that's
   * always visible.
   */
  const districtPoints = useMemo(() => {
    if (!feature || !core) return [];
    const midLng = (bounds.minLng + bounds.maxLng) / 2;
    return districts.map((district) => ({
      district,
      point: projectPoint(district.seed, bounds, core),
      stocked: (counts[stateId!]?.[district.id] ?? 0) > 0,
      flip: district.seed[0] > midLng,
    }));
  }, [feature, core, districts, bounds, counts, stateId]);

  /**
   * National view: pull every stocked state's name + count out to a card in
   * the plate's outer gutter (Cameron.png's flag-card convention), on an
   * elbow leader back to the state's dot. Gutter width — and so how far
   * apart the two plates sit — depends on how many cards a side holds, which
   * depends on `counts`, so this whole layout is per-render, unlike the
   * plates' own geometry above.
   */
  const nationalLayout = useMemo(() => {
    function side(region: Region, flip: boolean) {
      const geo = region === "Peninsular" ? WEST_GEO : EAST_GEO;
      const midLng = (geo.bounds.minLng + geo.bounds.maxLng) / 2;
      const list = DEMO_STATES
        .filter((state) => state.region === region && (counts[state.id]?.[""] ?? 0) > 0 && (state.label[0] > midLng) === flip)
        .map((state) => ({
          state,
          point: projectPoint(state.label, geo.bounds, geo.canvas),
          width: cardWidth(state.name, counts[state.id]?.[""] ?? 0),
        }))
        .sort((a, b) => a.point.y - b.point.y);
      const anchors = new Map<string, number>();
      let prevY = -Infinity;
      for (const item of list) {
        const y = Math.max(item.point.y, prevY + CARD_ROW_SPACING);
        anchors.set(item.state.id, y);
        prevY = y;
      }
      const width = list.length ? ELBOW_GAP + Math.max(...list.map((item) => item.width)) : 0;
      return { anchors, width };
    }
    const westLeft = side("Peninsular", false);
    const westRight = side("Peninsular", true);
    const eastLeft = side("Borneo", false);
    const eastRight = side("Borneo", true);
    const westOffsetX = westLeft.width;
    const eastOffsetX = westOffsetX + WEST_GEO.canvas.width + westRight.width + REGION_GAP + eastLeft.width;
    const cardY = new Map([...westLeft.anchors, ...westRight.anchors, ...eastLeft.anchors, ...eastRight.anchors]);
    const maxY = Math.max(MAX_HEIGHT - PADDING, ...cardY.values());
    return {
      west: { offsetX: westOffsetX, rightWidth: westRight.width },
      east: { offsetX: eastOffsetX, rightWidth: eastRight.width },
      cardY,
      width: eastOffsetX + EAST_GEO.canvas.width + eastRight.width,
      height: Math.round(maxY + PADDING),
    };
  }, [counts]);

  const canvas = feature && core ? core : { width: nationalLayout.width, height: nationalLayout.height, padding: PADDING };
  const gapCenterX = nationalLayout.west.offsetX + WEST_GEO.canvas.width + nationalLayout.west.rightWidth + REGION_GAP / 2;

  return (
    <figure className="m-0 overflow-hidden rounded-3xl border border-border" style={{ backgroundColor: SEA }}>
      {/* Title block — a map sheet names itself and states its scale. */}
      <figcaption className="flex flex-wrap items-end justify-between gap-3 border-b px-5 py-4" style={{ borderColor: COAST + "55" }}>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: COAST }}>
            {stateId ? "Negeri / State" : "Malaysia"}
          </p>
          <h2 className="mt-0.5 text-xl font-bold text-foreground font-[family-name:var(--font-display)]">
            {activeState?.name ?? "All states and federal territories"}
          </h2>
          {!stateId && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              West and East Malaysia scaled independently to fill the plate — not true relative scale.
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {stateId && (
            <span className="rounded-full px-3 py-1.5 text-[11px] font-semibold" style={{ backgroundColor: "#ffffff", color: COAST }}>
              {districts.length > 0
                ? `${districts.length} daerah · ${stockedCount} with listings`
                : activeState?.kind === "federal-territory"
                  ? "Federal Territory — no daerah"
                  : "No daerah — state goes straight to mukim"}
            </span>
          )}
          {stateId && (
            <button
              type="button"
              onClick={() => { onSelectState(null); onSelectDistrict(null); }}
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-foreground transition hover:text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <ArrowLeft size={12} /> All Malaysia
            </button>
          )}
        </div>
      </figcaption>

      {/* viewBox carries the true geographic proportions per plate; the fixed
          box height plus meet-fitting keeps a tall state (Perak, Kelantan)
          from running past the fold and a wide one from shrinking to a strip. */}
      <svg
        viewBox={`0 0 ${canvas.width} ${canvas.height}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={stateId ? `Districts of ${activeState?.name}` : "Malaysia — select a state to see its districts"}
        className="block h-[85vh] min-h-[560px] w-full"
      >
        <title>{stateId ? `Daerah of ${activeState?.name}` : "Malaysia state and district map"}</title>
        <rect width={canvas.width} height={canvas.height} fill={SEA} onClick={() => onSelectDistrict(null)} />

        {!stateId && (
          <>
            {/* The sea gap between the two plates is drawn, not hidden — this
                is a composite (inset) map, and pretending otherwise would be
                the misleading version. */}
            <line
              x1={gapCenterX}
              y1={PADDING}
              x2={gapCenterX}
              y2={canvas.height - PADDING}
              stroke={COAST}
              strokeWidth={1}
              strokeDasharray="2 5"
              opacity={0.6}
            />
            <text
              x={gapCenterX}
              y={canvas.height / 2}
              textAnchor="middle"
              transform={`rotate(-90 ${gapCenterX} ${canvas.height / 2})`}
              className="text-[8px] font-bold tracking-[0.2em]"
              fill={COAST}
              opacity={0.75}
            >
              SOUTH CHINA SEA · NOT TO SCALE
            </text>

            {([["Peninsular", WEST_GEO, WEST_STEP, nationalLayout.west.offsetX], ["Borneo", EAST_GEO, EAST_STEP, nationalLayout.east.offsetX]] as const).map(
              ([region, geo, step, offsetX]) => {
                const midLng = (geo.bounds.minLng + geo.bounds.maxLng) / 2;
                return (
                  <g key={region} transform={`translate(${offsetX},0)`}>
                    <g stroke={GRATICULE} strokeWidth={0.6} opacity={0.55}>
                      {ticks(geo.bounds.minLng, geo.bounds.maxLng, step).map((lng) => {
                        const { x } = projectPoint([lng, geo.bounds.minLat], geo.bounds, geo.canvas);
                        return <line key={`v${lng}`} x1={x} y1={0} x2={x} y2={geo.canvas.height} />;
                      })}
                      {ticks(geo.bounds.minLat, geo.bounds.maxLat, step).map((lat) => {
                        const { y } = projectPoint([geo.bounds.minLng, lat], geo.bounds, geo.canvas);
                        return <line key={`h${lat}`} x1={0} y1={y} x2={geo.canvas.width} y2={y} />;
                      })}
                    </g>

                    {stateFeatures.map((item) => {
                      const state = DEMO_STATES.find((s) => s.id === item.properties.id);
                      if (!state || state.region !== region) return null;
                      const isHovered = hovered === state.id;
                      const listings = total(state.id);
                      const stocked = listings > 0;
                      const point = projectPoint(state.label, geo.bounds, geo.canvas);
                      const flip = state.label[0] > midLng;
                      const edgeX = flip ? geo.canvas.width : 0;
                      const cardY = nationalLayout.cardY.get(state.id);
                      const cardW = stocked ? cardWidth(state.name, listings) : 0;
                      const rectX = flip ? edgeX + ELBOW_GAP : edgeX - ELBOW_GAP - cardW;
                      return (
                        <g
                          key={state.id}
                          role="button"
                          tabIndex={0}
                          aria-label={`Open ${state.name}, ${listings} listings`}
                          className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                          onMouseEnter={() => setHovered(state.id)}
                          onMouseLeave={() => setHovered((current) => (current === state.id ? null : current))}
                          onFocus={() => setHovered(state.id)}
                          onBlur={() => setHovered((current) => (current === state.id ? null : current))}
                          onClick={() => onSelectState(state.id)}
                          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectState(state.id); } }}
                        >
                          <path
                            d={featureToPath(item.geometry, geo.bounds, geo.canvas)}
                            fill={isHovered ? LAND_ACTIVE : stocked ? LAND : LAND_QUIET}
                            stroke={COAST}
                            strokeWidth={0.8}
                            strokeOpacity={0.7}
                          />
                          {stocked && cardY !== undefined && (
                            <>
                              <path
                                d={`M${point.x},${point.y} L${edgeX},${point.y} L${edgeX},${cardY}`}
                                fill="none"
                                stroke={COAST}
                                strokeWidth={0.9}
                              />
                              <circle cx={point.x} cy={point.y} r={10} fill="transparent" />
                              {isHovered && <circle cx={point.x} cy={point.y} r={9} fill="var(--primary)" opacity={0.16} />}
                              <circle cx={point.x} cy={point.y} r={5.5} fill={isHovered ? "var(--primary)" : "var(--highlight-yellow, #D97706)"} stroke="#ffffff" strokeWidth={1.8} />
                              <rect
                                x={rectX}
                                y={cardY - CARD_HEIGHT / 2}
                                width={cardW}
                                height={CARD_HEIGHT}
                                rx={6}
                                fill="#ffffff"
                                stroke={isHovered ? "var(--primary)" : COAST}
                                strokeWidth={isHovered ? 1.6 : 1}
                              />
                              <text x={rectX + CARD_PADDING_X} y={cardY - CARD_HEIGHT / 2 + 15} className="pointer-events-none text-[11px] font-bold" fill="#16233F">
                                {state.name}
                              </text>
                              <text x={rectX + CARD_PADDING_X} y={cardY - CARD_HEIGHT / 2 + 27} className="pointer-events-none text-[10px]" fill={COAST}>
                                {countLabel(listings)}
                              </text>
                            </>
                          )}
                        </g>
                      );
                    })}
                  </g>
                );
              },
            )}
          </>
        )}

        {feature && core && (
          <g>
            {/* Whole-degree grid at national scale, finer as you drill in —
                these are the actual coordinates the outlets are stored at. */}
            <g stroke={GRATICULE} strokeWidth={0.6} opacity={0.55}>
              {ticks(bounds.minLng, bounds.maxLng, graticuleStep(bounds)).map((lng) => {
                const { x } = projectPoint([lng, bounds.minLat], bounds, core);
                return <line key={`v${lng}`} x1={x} y1={0} x2={x} y2={core.height} />;
              })}
              {ticks(bounds.minLat, bounds.maxLat, graticuleStep(bounds)).map((lat) => {
                const { y } = projectPoint([bounds.minLng, lat], bounds, core);
                return <line key={`h${lat}`} x1={0} y1={y} x2={core.width} y2={y} />;
              })}
            </g>
            <g fill={COAST} className="text-[9px]" style={{ fontVariantNumeric: "tabular-nums" }}>
              {ticks(bounds.minLat, bounds.maxLat, graticuleStep(bounds)).map((lat) => {
                const { y } = projectPoint([bounds.minLng, lat], bounds, core);
                return <text key={`lat${lat}`} x={5} y={y - 3} opacity={0.8}>{lat}°N</text>;
              })}
            </g>

            {/* Neighbouring states stay on the plate when drilled in — a
                state floating alone gives no sense of where in the country
                you are. */}
            {stateFeatures.filter((item) => item.properties.id !== stateId).map((item) => (
              <path
                key={item.properties.id}
                d={featureToPath(item.geometry, bounds, core)}
                fill={LAND_QUIET}
                fillOpacity={0.75}
                stroke={SEA}
                strokeWidth={1}
              />
            ))}

            <path d={featureToPath(feature.geometry, bounds, core)} fill={LAND} stroke={COAST} strokeWidth={1.6} />

            {/* A dot per daerah, the way a printed tourist map marks towns —
                no invented boundaries. Name shows on hover/focus only. */}
            {districtPoints.map(({ district, point, stocked, flip }) => {
              const listings = counts[stateId!]?.[district.id] ?? 0;
              const isSelected = district.id === districtId;
              const isHovered = hovered === district.id;
              return (
                <g
                  key={district.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${district.name}, ${listings} listings`}
                  className="cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  onMouseEnter={() => setHovered(district.id)}
                  onMouseLeave={() => setHovered((current) => (current === district.id ? null : current))}
                  onFocus={() => setHovered(district.id)}
                  onBlur={() => setHovered((current) => (current === district.id ? null : current))}
                  onClick={() => onSelectDistrict(isSelected ? null : district.id)}
                  onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectDistrict(isSelected ? null : district.id); } }}
                >
                  {/* Generous invisible hit area — the visible dot is small. */}
                  <circle cx={point.x} cy={point.y} r={16} fill="transparent" />
                  {(isSelected || isHovered) && <circle cx={point.x} cy={point.y} r={12} fill="var(--primary)" opacity={0.16} />}
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r={stocked ? 5.5 : 3.5}
                    fill={isSelected ? "var(--primary)" : stocked ? "var(--highlight-yellow, #D97706)" : "#ffffff"}
                    stroke={isSelected ? "#ffffff" : COAST}
                    strokeWidth={stocked ? 1.8 : 1.2}
                  />
                  {isHovered && (
                    <text
                      x={point.x + (flip ? -11 : 11)}
                      y={point.y + 3.6}
                      textAnchor={flip ? "end" : "start"}
                      className={`pointer-events-none text-[11px] tracking-[0.06em] ${isSelected ? "font-bold" : "font-medium"}`}
                      fill={isSelected ? "var(--primary)" : "#16233F"}
                      style={{ paintOrder: "stroke", stroke: LAND, strokeWidth: 3.5, strokeLinejoin: "round" }}
                    >
                      {district.name}{stocked ? ` · ${listings}` : ""}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        )}
      </svg>

      {/* Legend — what the dots mean, shown rather than described. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t px-5 py-3 text-[11px]" style={{ borderColor: COAST + "55", backgroundColor: "#ffffffcc", color: "#4A5C71" }}>
        {stateId ? (
          <>
            <span className="inline-flex items-center gap-1.5">
              <svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="var(--highlight-yellow, #D97706)" /></svg>
              Has listings
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="3.5" fill="#ffffff" stroke={COAST} strokeWidth="1.2" /></svg>
              No listings yet
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="var(--primary)" /></svg>
              Selected
            </span>
            <span className="ml-auto">Hover or focus a dot for its name.</span>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-1.5">
              <svg width="14" height="10" aria-hidden="true"><rect width="14" height="10" rx="2" fill={LAND} stroke={COAST} strokeWidth="0.8" /></svg>
              Has listings
            </span>
            <span className="inline-flex items-center gap-1.5">
              <svg width="14" height="10" aria-hidden="true"><rect width="14" height="10" rx="2" fill={LAND_QUIET} /></svg>
              None yet
            </span>
            <span className="ml-auto">Tap a card, dot, or state to open its daerah.</span>
          </>
        )}
      </div>
    </figure>
  );
}
