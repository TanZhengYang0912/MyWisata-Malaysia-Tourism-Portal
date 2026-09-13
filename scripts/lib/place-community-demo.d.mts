export interface DemoPlace {
  id: string;
  level: "state" | "region" | "poi";
  name: string;
  state: string;
  district?: string | null;
  status?: string;
}

export interface DemoPlaceComment {
  id: string;
  place_id: string;
  user_id: string;
  body: string;
  status: string;
  is_anonymous?: boolean | null;
  created_at: string;
}

export interface PlaceCommunityDemoPlan {
  updates: DemoPlaceComment[];
  inserts: DemoPlaceComment[];
  stats: {
    places: number;
    updates: number;
    inserts: number;
    seededNotes: number;
  };
}

export const LEGACY_SAMPLE_PREFIX: string;
export function stableUuid(value: string): string;
export function buildPlaceCommunityDemoPlan(input: {
  places: DemoPlace[];
  customers: Array<{ id: string }>;
  existingComments?: DemoPlaceComment[];
  now?: Date;
}): PlaceCommunityDemoPlan;
