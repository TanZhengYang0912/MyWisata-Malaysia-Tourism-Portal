import geoJson from "@/lib/demo-map/malaysia-states.json";
import { DEMO_STATES } from "@/lib/demo-map/data";
import type { GeoJsonGeometry } from "@/lib/demo-map/geo";
import type { PromotionCampaignPublic, PromotionCampaignPublicLocation } from "./types";

type StateFeature = {
  properties: { id: string };
  geometry: GeoJsonGeometry;
};

const stateFeatures = (geoJson as { features: StateFeature[] }).features;
const stateAliases: Record<string, string[]> = {
  penang: ["penang", "pulau pinang"],
  "kuala-lumpur": ["kuala lumpur", "wilayah persekutuan kuala lumpur", "kl"],
  melaka: ["melaka", "malacca"],
  putrajaya: ["putrajaya", "wilayah persekutuan putrajaya"],
  labuan: ["labuan", "wilayah persekutuan labuan"],
};

function normalizeAddress(value: string): string {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function pointInRing(lng: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [currentLng, currentLat] = ring[current];
    const [previousLng, previousLat] = ring[previous];
    const cross = (lng - currentLng) * (previousLat - currentLat) - (lat - currentLat) * (previousLng - currentLng);
    const withinLng = lng >= Math.min(currentLng, previousLng) - 1e-8 && lng <= Math.max(currentLng, previousLng) + 1e-8;
    const withinLat = lat >= Math.min(currentLat, previousLat) - 1e-8 && lat <= Math.max(currentLat, previousLat) + 1e-8;
    if (Math.abs(cross) < 1e-8 && withinLng && withinLat) return true;

    const intersects = (currentLat > lat) !== (previousLat > lat)
      && lng < ((previousLng - currentLng) * (lat - currentLat)) / (previousLat - currentLat) + currentLng;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointInGeometry(lng: number, lat: number, geometry: GeoJsonGeometry): boolean {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => pointInRing(lng, lat, polygon[0]) && !polygon.slice(1).some((hole) => pointInRing(lng, lat, hole)));
}

function stateFromCoordinates(location: PromotionCampaignPublicLocation): string | null {
  if (location.lat === null || location.lng === null || !Number.isFinite(location.lat) || !Number.isFinite(location.lng)) return null;
  const matches = stateFeatures.filter(({ geometry }) => pointInGeometry(location.lng!, location.lat!, geometry));
  const federalTerritory = matches.find(({ properties }) => DEMO_STATES.find((state) => state.id === properties.id)?.kind === "federal-territory");
  return federalTerritory?.properties.id ?? matches[0]?.properties.id ?? null;
}

function stateFromText(location: PromotionCampaignPublicLocation): string | null {
  const text = normalizeAddress(`${location.name} ${location.address ?? ""}`);
  for (const state of DEMO_STATES) {
    const aliases = stateAliases[state.id] ?? [state.name];
    if (aliases.some((alias) => ` ${text} `.includes(` ${normalizeAddress(alias)} `))) return state.id;
  }
  return null;
}

export function resolveEventLocationState(location: PromotionCampaignPublicLocation): string | null {
  return stateFromCoordinates(location) ?? stateFromText(location);
}

export type EventStateBreakdown = {
  allCampaigns: PromotionCampaignPublic[];
  campaignsByState: Record<string, PromotionCampaignPublic[]>;
  unlocatedCampaigns: PromotionCampaignPublic[];
};

export function buildEventStateBreakdown(
  campaigns: PromotionCampaignPublic[],
  today: string,
): EventStateBreakdown {
  const campaignsByState = Object.fromEntries(
    DEMO_STATES.map((state) => [state.id, [] as PromotionCampaignPublic[]]),
  ) as Record<string, PromotionCampaignPublic[]>;
  const allCampaigns: PromotionCampaignPublic[] = [];
  const unlocatedCampaigns: PromotionCampaignPublic[] = [];
  const seenCampaignIds = new Set<string>();

  for (const campaign of campaigns) {
    if (seenCampaignIds.has(campaign.id)) continue;
    seenCampaignIds.add(campaign.id);
    const activeLocations = campaign.locations.filter((location) => location.endsOn >= today);
    if (activeLocations.length === 0) continue;

    allCampaigns.push(campaign);
    const stateIds = new Set(activeLocations.map(resolveEventLocationState).filter((id): id is string => id !== null));
    if (stateIds.size === 0) {
      unlocatedCampaigns.push(campaign);
      continue;
    }
    for (const state of DEMO_STATES) {
      if (stateIds.has(state.id)) campaignsByState[state.id].push(campaign);
    }
  }

  return { allCampaigns, campaignsByState, unlocatedCampaigns };
}

/** The five regions of the Events map (approved Events Atlas sample, with Pahang on the East Coast). */
export const EVENT_MAP_REGION_IDS = ["north", "central", "south", "east-coast", "east-malaysia"] as const;
export type EventMapRegionId = (typeof EVENT_MAP_REGION_IDS)[number];
export const EVENT_MAP_REGION_STATES: Record<EventMapRegionId, readonly string[]> = {
  north: ["perlis", "kedah", "penang", "perak"],
  central: ["selangor", "kuala-lumpur", "putrajaya"],
  south: ["negeri-sembilan", "melaka", "johor"],
  "east-coast": ["kelantan", "terengganu", "pahang"],
  "east-malaysia": ["sarawak", "sabah", "labuan"],
};

/**
 * State ids of the event's active stops; unresolved stops are skipped.
 * Active: running on `day` when a day is picked, otherwise not ended by `today` (as buildEventStateBreakdown).
 */
export function eventMapStateIds(campaign: PromotionCampaignPublic, today: string, day: string | null): Set<string> {
  const isActive = (location: PromotionCampaignPublicLocation) => (day ? location.startsOn <= day && day <= location.endsOn : location.endsOn >= today);
  return new Set(campaign.locations.filter(isActive).map(resolveEventLocationState).filter((id): id is string => id !== null));
}

/** The map regions containing these states. */
export function eventMapRegionIds(stateIds: ReadonlySet<string>): Set<EventMapRegionId> {
  return new Set(EVENT_MAP_REGION_IDS.filter((region) => EVENT_MAP_REGION_STATES[region].some((state) => stateIds.has(state))));
}
