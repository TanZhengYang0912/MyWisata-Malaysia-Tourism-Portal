import { createClient } from "@/lib/supabase/server";
import { searchActivities } from "@/backend/domains/catalogue";
import { StoryMap } from "@/components/demo-map/story-map";

export default async function ExplorePage() {
  const db = await createClient();
  const activities = await searchActivities({ state: "All Malaysia", category: null }, db);
  return <StoryMap initialActivities={activities} />;
}
