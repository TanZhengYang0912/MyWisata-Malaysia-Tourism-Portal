"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { MalaysiaDistrictMap, type MapMarker } from "@/components/demo-map/malaysia-district-map";
import { DiscoveryPinPreview } from "@/components/demo-map/discovery-pin-preview";
import type { DiscoveryMapData, DiscoveryPin } from "@/lib/demo-map/discovery-pins";
import { DEMO_STATES } from "@/lib/demo-map/data";
import { formatMYR } from "@/lib/i18n/format";

function pinCoord(pin: DiscoveryPin): [number, number] {
  return pin.kind === "outlet" ? [pin.outlet.lat, pin.outlet.lng] : [pin.lat, pin.lng];
}

function coordKey(pin: DiscoveryPin): string {
  const [lat, lng] = pinCoord(pin);
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function pinToMarker(pin: DiscoveryPin): MapMarker {
  const [lat, lng] = pinCoord(pin);
  return pin.kind === "outlet"
    ? { id: pin.id, kind: "outlet", lat, lng, name: pin.outlet.name, detail: pin.outlet.vendorName }
    : { id: pin.id, kind: "activity", lat, lng, name: pin.activity.name, detail: formatMYR(Number(pin.activity.price)) };
}

const CLUSTER_PREFIX = "cluster:";

export function DevExploreClient({ mapData, error }: { mapData: DiscoveryMapData | null; error: string | null }) {
  const { t } = useTranslation("auth");
  const [stateId, setStateId] = useState<string | null>(null);
  const [districtId, setDistrictId] = useState<string | null>(null);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);

  // Pins scoped to the current state/district, grouped by coordinate so
  // several outlets/activities at the same spot collapse into one cluster
  // marker instead of stacking illegibly (spec D5).
  const { markers, groups } = useMemo(() => {
    if (!mapData || !stateId) return { markers: [] as MapMarker[], groups: new Map<string, DiscoveryPin[]>() };
    const scoped = mapData.pins.filter((pin) => pin.stateId === stateId && (!districtId || pin.districtId === districtId));
    const byCoord = new Map<string, DiscoveryPin[]>();
    for (const pin of scoped) {
      const key = coordKey(pin);
      (byCoord.get(key) ?? byCoord.set(key, []).get(key)!).push(pin);
    }
    const built: MapMarker[] = [];
    for (const [key, group] of byCoord) {
      if (group.length === 1) {
        built.push(pinToMarker(group[0]));
      } else {
        const [lat, lng] = pinCoord(group[0]);
        built.push({ id: `${CLUSTER_PREFIX}${key}`, kind: "cluster", lat, lng, name: t("dev.explore.clusterPlaces", { count: group.length }), count: group.length });
      }
    }
    return { markers: built, groups: byCoord };
  }, [mapData, stateId, districtId, t]);

  const selectedPins: DiscoveryPin[] = useMemo(() => {
    if (!selectedMarkerId) return [];
    if (selectedMarkerId.startsWith(CLUSTER_PREFIX)) {
      return groups.get(selectedMarkerId.slice(CLUSTER_PREFIX.length)) ?? [];
    }
    const pin = mapData?.pins.find((p) => p.id === selectedMarkerId);
    return pin ? [pin] : [];
  }, [selectedMarkerId, groups, mapData]);

  const activeState = DEMO_STATES.find((s) => s.id === stateId);

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6">
      <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{t("dev.explore.prototype")}</p>
      <h1 className="mt-1 text-3xl font-bold text-foreground font-[family-name:var(--font-display)]">
        {t("dev.explore.title")}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
        {t("dev.explore.description")}
      </p>

      {mapData && mapData.omittedPlaceProducts.length > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <p>
            {/* Template string, not adjacent JSX text nodes: SWC drops the space
                around a mid-sentence expression otherwise. */}
            {t(mapData.omittedPlaceProducts.length === 1 ? "dev.explore.omittedProduct" : "dev.explore.omittedProducts", {
              count: mapData.omittedPlaceProducts.length,
              products: mapData.omittedPlaceProducts.map((p) => p.name).join(", "),
            })}
          </p>
        </div>
      )}

      {error ? (
        <div className="mt-6 rounded-2xl border border-red-300 bg-red-50 px-4 py-6 text-sm text-red-900">
          <p className="font-bold">{t("dev.explore.loadErrorTitle")}</p>
          <p className="mt-1 text-xs">{error}</p>
        </div>
      ) : !mapData ? null : (
        <div className="relative mt-6">
          <MalaysiaDistrictMap
            counts={mapData.counts}
            stateId={stateId}
            districtId={districtId}
            onSelectState={(next) => { setStateId(next); setDistrictId(null); setSelectedMarkerId(null); }}
            onSelectDistrict={(next) => { setDistrictId(next); setSelectedMarkerId(null); }}
            markers={markers}
            selectedMarkerId={selectedMarkerId}
            onSelectMarker={(id) => setSelectedMarkerId((current) => (current === id ? null : id))}
          />

          {stateId && markers.length === 0 && (
            <p className="mt-3 rounded-xl bg-muted px-3 py-2.5 text-xs leading-5 text-muted-foreground">
              {t("dev.explore.noAvailable", { location: districtId ? t("dev.explore.thisDistrict") : activeState?.name ?? t("dev.explore.thisState") })}
            </p>
          )}

          {selectedPins.length > 0 && (
            <div className="fixed bottom-4 right-4 z-20 w-[min(360px,calc(100vw-2rem))]">
              <DiscoveryPinPreview pins={selectedPins} onClose={() => setSelectedMarkerId(null)} />
            </div>
          )}
        </div>
      )}
    </main>
  );
}
