import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { searchActivities } from "@/backend/domains/catalogue";
import { ExploreClient } from "./explore-client";

export const metadata: Metadata = {
  title: "Explore Malaysia — MyWisata",
  description: "Discover destinations by state or filter experiences by category across Malaysia.",
};

export default async function ExplorePage() {
  const db = await createClient();
  const activities = await searchActivities({ state: "All Malaysia", category: null }, db);
  return <ExploreClient initialActivities={activities} />;
}
