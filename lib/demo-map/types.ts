export interface DemoState {
  id: string;
  name: string;
  kind: "state" | "federal-territory";
  region: "Peninsular" | "Borneo";
  label: [number, number];
}

/** A real activity, adapted (via activityToMapPlace) for the SVG state map. */
export interface MapPlace {
  id: string;
  name: string;
  stateId: string;
  lat: number;
  lng: number;
  category: string;
  city: string;
  rating: number;
  reviews: number;
  price: number;
  distanceKm?: number;
}

export interface DemoLocation {
  lat: number;
  lng: number;
}
