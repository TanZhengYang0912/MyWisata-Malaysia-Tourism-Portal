import { createClient } from "@/lib/supabase/server";
import { searchActivities } from "@/backend/domains/catalogue";
import { getRecommendedFeed } from "@/backend/domains/recommend";
import { HomeClient } from "./home-client";

export default async function CustomerHomePage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();

  const [activities, feed] = await Promise.all([
    searchActivities({ state: "All Malaysia", category: null }, db),
    getRecommendedFeed(user?.id ?? null, { limit: 8 }, db),
  ]);

  // Carry each card's match reason (§11.3) through the existing aiTag slot.
  const recommended = feed.map((item) => ({ ...item.activity, aiTag: item.reasonLabel ?? undefined }));

  return <HomeClient initialActivities={activities} initialRecommended={recommended} />;
}
