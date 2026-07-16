import { searchActivities } from "@/backend/domains/catalogue";
import { GuestCatalogue } from "@/components/guest/guest-catalogue";
import type { ComputedActivity } from "@/backend/core/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GuestExplorePage() {
  let activities: ComputedActivity[] = [];
  let error: string | undefined;
  try {
    const db = await createClient();
    activities = (await searchActivities({ state: "All Malaysia", category: null }, db))
      .filter((activity) => activity.outlet.verified);
  } catch {
    error = "Please try again shortly.";
  }
  return <GuestCatalogue activities={activities} error={error} />;
}
