import type { Activity, Outlet } from "@/backend/core/types";
import { isPlaceBound } from "@/lib/customer/category-details";
import { CITY_TO_DISTRICT, getDistricts } from "@/lib/demo-map/districts";
import { slugifyState } from "@/lib/demo-map/adapt";
import type { DistrictCounts } from "@/components/demo-map/malaysia-district-map";

export interface OutletDiscoveryPin {
  kind: "outlet";
  id: string; // outlet id
  outlet: Outlet;
  /** Distinct products this outlet sells, own or shared — never the same product id twice. */
  products: Activity[];
  stateId: string;
  districtId: string | null;
}

export interface ActivityDiscoveryPin {
  kind: "activity";
  id: string; // product id
  activity: Activity;
  lat: number;
  lng: number;
  stateId: string;
  districtId: string | null;
  /** The outlet that actually sells this place-bound product — its business, not its destination. Absent if that outlet is inactive. */
  providerOutlet?: Outlet;
}

export type DiscoveryPin = OutletDiscoveryPin | ActivityDiscoveryPin;

export interface DiscoveryMapData {
  pins: DiscoveryPin[];
  /** Coordinate key (4-decimal lat,lng) -> pin ids sharing that spot. Single-entry groups are still listed. */
  clusters: Record<string, string[]>;
  counts: DistrictCounts;
  omittedPlaceProducts: { id: string; name: string }[];
}

function resolveDistrictId(stateId: string, districtName: string | undefined | null): string | null {
  if (!districtName) return null;
  return getDistricts(stateId).find((d) => d.name === districtName)?.id ?? null;
}

function clusterKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

/** Adds one product occurrence to a state/district distinct-product-id count. */
function countProduct(
  stateSets: Map<string, Set<string>>,
  districtSets: Map<string, Map<string, Set<string>>>,
  stateId: string,
  districtId: string | null,
  productId: string,
) {
  (stateSets.get(stateId) ?? stateSets.set(stateId, new Set()).get(stateId)!).add(productId);
  if (!districtId) return;
  const byDistrict = districtSets.get(stateId) ?? districtSets.set(stateId, new Map()).get(stateId)!;
  (byDistrict.get(districtId) ?? byDistrict.set(districtId, new Set()).get(districtId)!).add(productId);
}

/**
 * Builds the dev map's pins from the raw catalogue, independent of
 * `searchActivities()` — that function intentionally collapses a shared
 * product to one representative outlet, which is right for a catalogue card
 * and wrong for a map that needs to plot every physical location a product
 * is actually sold at (docs/plans/2026-08-03-0237-dev-explore-discovery-map.md D6).
 *
 * Place-bound products (nature/cultural/adventure) become their own pin at
 * `activity.place` — never at the provider outlet's coordinate, and never
 * guessed when `place` is missing; those are reported in
 * `omittedPlaceProducts` instead of silently mis-plotted.
 */
export function buildDiscoveryMapData(activities: Activity[], outlets: Outlet[]): DiscoveryMapData {
  const outletMap = new Map(outlets.filter((o) => o.open).map((o) => [o.id, o]));

  const pins: DiscoveryPin[] = [];
  const omittedPlaceProducts: { id: string; name: string }[] = [];
  const outletProducts = new Map<string, { outlet: Outlet; products: Map<string, Activity>; stateId: string; districtId: string | null }>();
  const stateSets = new Map<string, Set<string>>();
  const districtSets = new Map<string, Map<string, Set<string>>>();

  for (const activity of activities) {
    if (isPlaceBound(activity)) {
      if (!activity.place) {
        omittedPlaceProducts.push({ id: activity.id, name: activity.name });
        continue;
      }
      const stateId = slugifyState(activity.place.state);
      const districtId = resolveDistrictId(stateId, activity.place.district);
      const providerOutlet = outletMap.get(activity.outletId);
      pins.push({ kind: "activity", id: activity.id, activity, lat: activity.place.lat, lng: activity.place.lng, stateId, districtId, providerOutlet });
      countProduct(stateSets, districtSets, stateId, districtId, activity.id);
      continue;
    }

    // Expand to every outlet this product is actually sold at — the same
    // outlets `outlet_offers` and `outletId` describe, just not collapsed to
    // a single "best" one the way toComputed() does for catalogue cards.
    const outletIds = activity.offers?.length ? activity.offers.map((o) => o.outletId) : [activity.outletId];
    for (const outletId of new Set(outletIds)) {
      const outlet = outletId ? outletMap.get(outletId) : undefined;
      if (!outlet) continue;
      const stateId = slugifyState(outlet.state);
      const districtId = resolveDistrictId(stateId, CITY_TO_DISTRICT[outlet.city]);
      const entry = outletProducts.get(outlet.id) ?? outletProducts.set(outlet.id, { outlet, products: new Map(), stateId, districtId }).get(outlet.id)!;
      entry.products.set(activity.id, activity);
      countProduct(stateSets, districtSets, stateId, districtId, activity.id);
    }
  }

  for (const { outlet, products, stateId, districtId } of outletProducts.values()) {
    pins.push({ kind: "outlet", id: outlet.id, outlet, products: [...products.values()], stateId, districtId });
  }

  const clusters: Record<string, string[]> = {};
  for (const pin of pins) {
    const [lat, lng] = pin.kind === "outlet" ? [pin.outlet.lat, pin.outlet.lng] : [pin.lat, pin.lng];
    const key = clusterKey(lat, lng);
    (clusters[key] ??= []).push(pin.id);
  }

  const counts: DistrictCounts = {};
  for (const [stateId, productIds] of stateSets) {
    counts[stateId] = { "": productIds.size };
    for (const [districtId, districtProductIds] of districtSets.get(stateId) ?? []) {
      counts[stateId][districtId] = districtProductIds.size;
    }
  }

  return { pins, clusters, counts, omittedPlaceProducts };
}
