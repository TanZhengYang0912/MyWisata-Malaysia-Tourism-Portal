"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layer, Map as MapLibre, Marker, NavigationControl, Source, type MapRef } from "react-map-gl/maplibre";
import type { Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { Compass, MapPin, Move3d } from "lucide-react";
import geoJson from "@/lib/demo-map/malaysia-states.json";
import { DEMO_STATES } from "@/lib/demo-map/data";

export const MYWISATA_EXPLORE_MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";
const STATE_SOURCE_ID = "mywisata-states";
const STATE_FILL_LAYER_ID = "mywisata-state-fill";
const STATE_LINE_LAYER_ID = "mywisata-state-line";

type StateFeature = {
  type: "Feature";
  properties: { id: string; name: string };
  geometry: {
    type: "Polygon";
    coordinates: number[][][];
  } | {
    type: "MultiPolygon";
    coordinates: number[][][][];
  };
};

type StateFeatureCollection = {
  type: "FeatureCollection";
  features: StateFeature[];
};

type ExploreMapProps = {
  selectedStateId: string | null;
  onSelectState: (stateId: string | null) => void;
};

const stateFeatureCollection = geoJson as StateFeatureCollection;

function featurePoint(feature: StateFeature): [number, number] {
  const points = feature.geometry.type === "Polygon"
    ? feature.geometry.coordinates.flat()
    : feature.geometry.coordinates.flat(2);
  const longitude = points.reduce((sum, point) => sum + point[0], 0) / points.length;
  const latitude = points.reduce((sum, point) => sum + point[1], 0) / points.length;
  return [longitude, latitude];
}

const statePoints = new globalThis.Map(stateFeatureCollection.features.map((feature) => [feature.properties.id, featurePoint(feature)]));

function statePoint(stateId: string): [number, number] {
  return statePoints.get(stateId) ?? DEMO_STATES.find((state) => state.id === stateId)?.label ?? [102.5, 4.5];
}

function applyBuildingStyle(map: MapLibreMap): boolean {
  const buildingLayer = map.getLayer("building-3d");
  if (!buildingLayer) return false;
  try {
    map.setLayerZoomRange("building-3d", 12, 24);
    map.setPaintProperty("building-3d", "fill-extrusion-color", "#010066");
    map.setPaintProperty("building-3d", "fill-extrusion-opacity", 0.86);
    return true;
  } catch {
    return false;
  }
}

import { useTranslation } from "react-i18next";

export function MyWisataExploreMap({ selectedStateId, onSelectState }: ExploreMapProps) {
  const { t } = useTranslation("customer");
  const mapRef = useRef<MapRef | null>(null);
  const [buildingsEnabled, setBuildingsEnabled] = useState(false);
  const selectedPoint = selectedStateId ? statePoint(selectedStateId) : null;

  const stateFeatures = useMemo(() => stateFeatureCollection, []);

  useEffect(() => {
    if (!selectedPoint) {
      mapRef.current?.flyTo({ center: [102.5, 4.5], zoom: 5.2, pitch: 48, bearing: -12, duration: 850, essential: true });
      return;
    }
    mapRef.current?.flyTo({
      center: selectedPoint,
      zoom: selectedStateId === "kuala-lumpur" ? 15.2 : 8.2,
      pitch: selectedStateId === "kuala-lumpur" ? 58 : 48,
      bearing: selectedStateId === "kuala-lumpur" ? -18 : -12,
      duration: 950,
      essential: true,
    });
  }, [selectedPoint, selectedStateId]);

  function handleMapLoad(event: { target: MapLibreMap }) {
    setBuildingsEnabled(applyBuildingStyle(event.target));
  }

  function handleMapClick(event: MapLayerMouseEvent) {
    const stateId = event.features?.[0]?.properties?.id;
    if (typeof stateId === "string") onSelectState(stateId === selectedStateId ? null : stateId);
  }

  return (
    <div className="mywisata-explore-map relative aspect-[1600/1060] min-h-[440px] w-full overflow-hidden rounded-[1.8rem] border border-primary/20 bg-card shadow-sm sm:min-h-[500px] lg:h-[620px] lg:aspect-auto lg:min-h-0">
      <style>{`.mywisata-explore-map .maplibregl-canvas-container { overflow: hidden; }`}</style>
      <MapLibre
        ref={mapRef}
        initialViewState={{ longitude: 102.5, latitude: 4.5, zoom: 5.2, pitch: 48, bearing: -12 }}
        mapStyle={MYWISATA_EXPLORE_MAP_STYLE}
        maxPitch={70}
        dragRotate
        touchPitch
        attributionControl={false}
        interactiveLayerIds={[STATE_FILL_LAYER_ID]}
        onLoad={handleMapLoad}
        onClick={handleMapClick}
      >
        <NavigationControl position="bottom-right" showCompass showZoom={false} />
        <Source id={STATE_SOURCE_ID} type="geojson" data={stateFeatures}>
          <Layer
            id={STATE_FILL_LAYER_ID}
            type="fill"
            paint={{
              "fill-color": ["case", ["==", ["get", "id"], selectedStateId ?? ""], "#ffcc00", "#dce4ff"],
              "fill-opacity": ["case", ["==", ["get", "id"], selectedStateId ?? ""], 0.16, 0.42],
            }}
          />
          <Layer
            id={STATE_LINE_LAYER_ID}
            type="line"
            paint={{
              "line-color": ["case", ["==", ["get", "id"], selectedStateId ?? ""], "#ffcc00", "#010066"],
              "line-opacity": ["case", ["==", ["get", "id"], selectedStateId ?? ""], 0.96, 0.38],
              "line-width": ["case", ["==", ["get", "id"], selectedStateId ?? ""], 2.8, 1.1],
              "line-blur": ["case", ["==", ["get", "id"], selectedStateId ?? ""], 0.2, 0],
            }}
          />
        </Source>
        {DEMO_STATES.map((state) => {
          const [longitude, latitude] = statePoint(state.id);
          const isSelected = selectedStateId === state.id;
          return (
            <Marker key={state.id} longitude={longitude} latitude={latitude} anchor="bottom">
              <button
                type="button"
                aria-label={`Select ${state.name}`}
                aria-pressed={isSelected}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectState(isSelected ? null : state.id);
                }}
                className="group flex flex-col items-center outline-none"
              >
                {isSelected && <span className="mb-1 max-w-[150px] truncate rounded-full border border-primary bg-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground shadow-lg">{state.name}</span>}
                <span className={`grid place-items-center rounded-full border-2 border-white shadow-[0_5px_14px_rgba(1,0,102,0.28)] transition ${isSelected ? "h-11 w-11 bg-accent text-accent-foreground" : "h-7 w-7 bg-primary text-primary-foreground group-hover:scale-110"}`}>
                  <MapPin size={isSelected ? 21 : 14} fill={isSelected ? "currentColor" : "none"} />
                </span>
              </button>
            </Marker>
          );
        })}
      </MapLibre>

      <div className="pointer-events-none absolute left-5 top-4 z-10 sm:left-7 sm:top-6">
        <div className="inline-flex items-center gap-2 rounded-lg bg-accent px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-accent-foreground shadow-lg"><Compass size={14} /> {t("ui.map.exploreMap", "Explore the map")}</div>
      </div>

      <div className="pointer-events-none absolute right-5 top-5 z-10 hidden items-center gap-2 rounded-full border border-white/80 bg-white/90 px-3 py-2 text-[10px] font-bold text-primary shadow-lg backdrop-blur sm:flex">
        <Move3d size={14} /> {buildingsEnabled ? t("ui.map.buildings3D", "3D buildings") : t("ui.map.view3D", "3D map view")}
      </div>
      <div className="absolute bottom-3 right-3 z-10 rounded-full bg-primary/85 px-2.5 py-1 font-mono text-[8px] font-bold uppercase tracking-[0.08em] text-primary-foreground/75 shadow-lg">{t("ui.map.attribution")}</div>
    </div>
  );
}
