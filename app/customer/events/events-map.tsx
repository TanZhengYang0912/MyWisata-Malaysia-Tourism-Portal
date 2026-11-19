"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import geoJson from "@/lib/demo-map/malaysia-states.json";
import { DEMO_STATES } from "@/lib/demo-map/data";
import { featureToPath, geometryBounds, type GeoJsonGeometry } from "@/lib/demo-map/geo";
import { EVENT_MAP_REGION_IDS, EVENT_MAP_REGION_STATES, type EventMapRegionId } from "@/lib/promotion-campaigns/event-state-counts";
import styles from "./events-map.module.css";

type StateFeature = { properties: { id: string }; geometry: GeoJsonGeometry };

// Each landmass is fitted into its box from the approved atlas sample (850×328 viewBox), so West and East
// Malaysia sit closer than real distance. Built once per module load.
const LAND_BOXES = {
  Peninsular: { x: 80.5, y: 63.4, width: 191.5, height: 207.6 },
  Borneo: { x: 466.5, y: 39.4, width: 379.4, height: 246.7 },
} as const;
const LANDS = (Object.keys(LAND_BOXES) as (keyof typeof LAND_BOXES)[]).flatMap((region) => {
  const features = (geoJson as { features: StateFeature[] }).features
    .filter((feature) => DEMO_STATES.find((state) => state.id === feature.properties.id)?.region === region);
  const bounds = geometryBounds(features.map((feature) => feature.geometry));
  const { x, y, width, height } = LAND_BOXES[region];
  return features.map((feature) => ({
    stateId: feature.properties.id,
    d: featureToPath(feature.geometry, bounds, { width, height, padding: 0 }),
    transform: `translate(${x} ${y})`,
  }));
});

/** Pin centres in the 850×328 viewBox (approved sample). */
const PIN_POINTS: Record<EventMapRegionId, { x: number; y: number }> = {
  north: { x: 104, y: 105 },
  central: { x: 178, y: 195 },
  south: { x: 258, y: 265 },
  "east-coast": { x: 285, y: 122 },
  "east-malaysia": { x: 677, y: 153 },
};

export function EventsMap({ regionCounts, eventStates, selected, onSelect }: {
  regionCounts: Record<EventMapRegionId, number>;
  /** State ids of the active stops of the shown events (land "has events"). */
  eventStates: ReadonlySet<string>;
  selected: EventMapRegionId | null;
  onSelect: (region: EventMapRegionId | null) => void;
}) {
  const { t } = useTranslation("customer");
  const sectionRef = useRef<HTMLElement>(null);
  const pinRefs = useRef<Partial<Record<EventMapRegionId, HTMLButtonElement | null>>>({});
  const clearedRef = useRef<EventMapRegionId | null>(null);
  // Remounts the selected pin's ring so the confirm animation plays on every selection.
  const [confirmKey, setConfirmKey] = useState(0);
  const selectedStates = selected ? EVENT_MAP_REGION_STATES[selected] : [];

  // After a clear, focus returns to the cleared pin, or to the map when that pin is now disabled (0 events).
  useEffect(() => {
    if (selected !== null || !clearedRef.current) return;
    const pin = pinRefs.current[clearedRef.current];
    clearedRef.current = null;
    (pin && !pin.hasAttribute("disabled") ? pin : sectionRef.current)?.focus();
  }, [selected]);

  const clear = () => {
    clearedRef.current = selected;
    onSelect(null);
  };

  return (
    <section ref={sectionRef} tabIndex={-1} aria-label={t("ui.promotionCampaigns.map.mapRegion")} className={styles.atlas}>
      {selected && (
        <button type="button" className={styles.reset} onClick={clear}>
          <RotateCcw size={14} aria-hidden="true" />
          {t("ui.promotionCampaigns.map.allMalaysia")}
        </button>
      )}
      <div className={styles.frame}>
        <svg className={styles.art} viewBox="0 0 850 328" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <pattern id="events-map-grid" width="45" height="45" patternUnits="userSpaceOnUse">
              <path className={styles.grid} d="M45 0H0V45" fill="none" />
            </pattern>
          </defs>
          <rect width="850" height="328" fill="url(#events-map-grid)" />
          {LANDS.map((land) => (
            <path
              key={land.stateId}
              data-land={land.stateId}
              d={land.d}
              transform={land.transform}
              fillRule="evenodd"
              className={[styles.land, eventStates.has(land.stateId) && styles.hasEvents, selectedStates.includes(land.stateId) && styles.inRegion].filter(Boolean).join(" ")}
            />
          ))}
          <text x="51" y="34" className={styles.label}>{t("ui.promotionCampaigns.map.peninsularLabel")}</text>
          <text x="586" y="266" className={styles.label}>{t("ui.promotionCampaigns.map.eastLabel")}</text>
          <text x="397" y="142" className={styles.water}>{t("ui.promotionCampaigns.map.seaLabel")}</text>
          <path className={styles.compass} d="M806 263v38m-19-19h38m-19-19-5 11h10z" />
          <text x="802" y="255" className={styles.label}>{t("ui.promotionCampaigns.map.northLabel")}</text>
        </svg>
        {EVENT_MAP_REGION_IDS.map((id) => {
          const count = regionCounts[id];
          const isSelected = selected === id;
          return (
            <button
              key={id}
              ref={(node) => { pinRefs.current[id] = node; }}
              type="button"
              data-region={id}
              className={styles.pin}
              style={{ left: `${PIN_POINTS[id].x / 8.5}%`, top: `${PIN_POINTS[id].y / 3.28}%` }}
              aria-pressed={isSelected}
              aria-label={t("ui.promotionCampaigns.map.markerLabel", { state: t(`ui.promotionCampaigns.map.regions.${id}.title`), count })}
              disabled={count === 0 && !isSelected}
              onClick={() => {
                if (isSelected) clear();
                else {
                  setConfirmKey((key) => key + 1);
                  onSelect(id);
                }
              }}
            >
              <b>{count}</b>
              <span className={styles.pinName}>{t(`ui.promotionCampaigns.map.regions.${id}.name`)}</span>
              {isSelected && <span key={confirmKey} className={styles.confirm} aria-hidden="true" />}
            </button>
          );
        })}
      </div>
    </section>
  );
}
