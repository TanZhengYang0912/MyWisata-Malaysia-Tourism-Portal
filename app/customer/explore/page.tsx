import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { searchActivities } from "@/backend/domains/catalogue";
import { getStatesWithPlaces } from "@/backend/domains/places";
import { ExploreClient } from "./explore-client";
import { BRAND_NAME } from "@/lib/i18n/invariant-tokens";

export const metadata: Metadata = {
  title: `Explore Malaysia — ${BRAND_NAME}`,
  description: "Discover destinations by state or filter experiences by category across Malaysia.",
};

export default async function ExplorePage() {
  const db = await createClient();
  const [activities, statesWithPlaces, placeRows] = await Promise.all([
    searchActivities({ state: "All Malaysia", category: null }, db),
    getStatesWithPlaces(db),
    db.from("places").select("state").eq("level", "poi").eq("status", "active"),
  ]);

  const placeCountByState = new Map<string, number>();
  for (const row of (placeRows.data ?? []) as { state: string }[]) {
    placeCountByState.set(row.state, (placeCountByState.get(row.state) ?? 0) + 1);
  }

  return (
    <ExploreClient
      initialActivities={activities}
      statesWithPlaces={statesWithPlaces}
      placeCountByState={Object.fromEntries(placeCountByState)}
    />
  );
}
