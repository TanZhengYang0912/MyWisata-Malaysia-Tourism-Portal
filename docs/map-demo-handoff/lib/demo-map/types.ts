export type PlaceType = "activity" | "vendor" | "recommended";
export type TravelMode = "driving" | "walking" | "bicycling" | "transit";

export interface RouteSummary {
  durationText: string;
  distanceText: string;
}

export interface DemoState {
  id: string;
  name: string;
  kind: "state" | "federal-territory";
  region: "Peninsular" | "Borneo";
  label: [number, number];
}

export interface DemoPlace {
  id: string;
  name: string;
  type: PlaceType;
  category: string;
  stateId: string;
  city: string;
  description: string;
  image?: string;
  accent: string;
  lat: number;
  lng: number;
  rating: number;
  reviews: number;
  price: number;
  address: string;
  tags: string[];
  route: Record<TravelMode, RouteSummary>;
}

export interface DemoPlaceWithDistance extends DemoPlace {
  distanceKm?: number;
}

export interface DemoLocation {
  lat: number;
  lng: number;
}

export interface DemoPreferences {
  category: string | null;
  radiusKm: number;
  selectedStateId: string | null;
  savedPlaceIds: string[];
}
