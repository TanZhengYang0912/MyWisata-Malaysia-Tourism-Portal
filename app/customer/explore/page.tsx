import { createClient } from "@/lib/supabase/server";
import { searchActivities } from "@/backend/domains/catalogue";
import { ExploreClient } from "./explore-client";

export default async function ExplorePage() {
  const db = await createClient();
  const activities = await searchActivities({ state: "All Malaysia", category: null }, db);
  return <ExploreClient initialActivities={activities} />;
}
