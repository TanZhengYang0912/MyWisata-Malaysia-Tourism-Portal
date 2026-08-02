import { createClient } from "@/lib/supabase/server";
import { searchActivities } from "@/backend/domains/catalogue";
import { slugifyState } from "@/lib/demo-map/adapt";
import { CITY_TO_DISTRICT, getDistricts } from "@/lib/demo-map/districts";
import { DemoExploreClient, type DemoListing } from "./demo-explore-client";

export const metadata = { title: "Prototype · State → District navigation" };

/**
 * UI prototype for the district navigation layer. Read-only, not linked from
 * anywhere in the product, and it writes nothing.
 *
 * outlets has no district column yet, so district is derived from city here —
 * see docs/plans/2026-08-01-1049-state-district-navigation-layer.md Phase 1,
 * which moves this mapping into the database.
 */
export default async function DemoExplorePage() {
  const db = await createClient();
  const activities = await searchActivities({ state: "All Malaysia", category: null }, db);

  const listings: DemoListing[] = activities.map((activity) => {
    const stateId = slugifyState(activity.outlet.state);
    const districtName = CITY_TO_DISTRICT[activity.outlet.city] ?? null;
    const district = districtName
      ? getDistricts(stateId).find((item) => item.name === districtName)
      : undefined;
    return {
      id: activity.id,
      name: activity.name,
      category: activity.category,
      city: activity.outlet.city,
      stateId,
      districtId: district?.id ?? null,
      districtName: district?.name ?? null,
      price: activity.price,
      rating: activity.rating,
      reviews: activity.reviews,
      vendorName: activity.outlet.vendorName ?? "Local vendor",
    };
  });

  return <DemoExploreClient listings={listings} />;
}
