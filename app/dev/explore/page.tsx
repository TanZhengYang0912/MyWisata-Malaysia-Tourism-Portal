import { createClient } from "@/lib/supabase/server";
import { getActivities, getOutlets } from "@/backend/domains/catalogue";
import { buildDiscoveryMapData, type DiscoveryMapData } from "@/lib/demo-map/discovery-pins";
import { getServerTranslation } from "@/lib/i18n/server";
import { DevExploreClient } from "./dev-explore-client";

export async function generateMetadata() {
  const { t } = await getServerTranslation("auth");
  return { title: t("dev.explore.title") };
}

/**
 * Successor to the earlier /demo/explore prototype — see
 * docs/plans/2026-08-03-0237-dev-explore-discovery-map.md. Read-only, not
 * linked from anywhere in the product.
 *
 * Deliberately does NOT use searchActivities(): that function collapses a
 * shared product to a single representative outlet, which is right for a
 * catalogue card and wrong for a map that needs every physical location a
 * product is actually sold at (plan D6). getActivities()/getOutlets() give
 * the raw catalogue instead, and buildDiscoveryMapData() does the map-only
 * expansion in one pure, tested function.
 */
export default async function DevExplorePage() {
  const { t } = await getServerTranslation("auth");
  let mapData: DiscoveryMapData | null = null;
  let error: string | null = null;
  try {
    const db = await createClient();
    const [activities, outlets] = await Promise.all([getActivities(db), getOutlets(db)]);
    mapData = buildDiscoveryMapData(activities, outlets);
  } catch (cause) {
    error = cause instanceof Error ? cause.message : t("dev.explore.loadError");
  }

  return <DevExploreClient mapData={mapData} error={error} />;
}
