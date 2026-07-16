import { createClient } from "@/lib/supabase/server";
import { searchActivities } from "@/backend/domains/catalogue";
import { HomeClient } from "./home-client";

export default async function CustomerHomePage() {
  const db = await createClient();
  const activities = await searchActivities({ state: "All Malaysia", category: null }, db);
  return <HomeClient initialActivities={activities} />;
}
