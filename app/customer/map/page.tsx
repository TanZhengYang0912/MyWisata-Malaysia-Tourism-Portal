import { createClient } from "@/lib/supabase/server";
import { searchActivities } from "@/backend/domains/catalogue";
import { MapClient } from "./map-client";

export default async function MapPage() {
  const db = await createClient();
  const activities = await searchActivities({ category: null, sort: "recommended" }, db);
  return <MapClient initialActivities={activities} />;
}
