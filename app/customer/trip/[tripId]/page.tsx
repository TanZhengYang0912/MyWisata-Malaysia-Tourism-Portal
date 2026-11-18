import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getClaimsUserId } from "@/lib/auth/claims-user";
import { getServerTranslation } from "@/lib/i18n/server";
import { getTripById, getTripItems } from "@/backend/domains/trips";
import { searchTripActivities } from "@/backend/domains/catalogue";
import { getCachedDiscoveryActivityData } from "@/lib/cache/catalogue-cache";
import { getTripDiscoveryAnchor, getTripDiscoveryFingerprint } from "@/lib/customer/trip-planner";
import { MapClient } from "./trip-planner-client";
import { redirect, notFound } from "next/navigation";
import { BRAND_NAME } from "@/lib/i18n/invariant-tokens";
import type { SponsoredPlacement } from "@/backend/core/types";
import { collapseSuggestedAtByVendor } from "./trip-place-discovery";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslation("customer");
  return {
    title: `${t("ui.map.yourTrip")} — ${BRAND_NAME}`,
    description: t("ui.map.searchHint"),
    referrer: "no-referrer",
  };
}

export default async function TripPlannerPage({ params }: { params: Promise<{ tripId: string }> }) {
  const db = await createClient();
  // Sign-in redirect only; the trip reads below still check the owner with getUser().
  const userId = await getClaimsUserId(db);

  const resolvedParams = await params;
  const tripId = resolvedParams.tripId;

  if (!userId) {
    redirect(`/auth/sign-in?redirect_to=/customer/trip/${tripId}`);
  }

  // Loaded together: getTripItems returns [] without reading stops when the trip is not the caller's.
  const [trip, items] = await Promise.all([getTripById(tripId, db), getTripItems(tripId, db)]);
  if (!trip) {
    notFound();
  }

  const anchor = getTripDiscoveryAnchor(items, trip.start_date);
  const [discoveryData, placementsResult, suggestionsResult] = await Promise.all([
    getCachedDiscoveryActivityData(),
    db.rpc("list_active_sponsored_discovery_placements"),
    db.from("vendor_recommendations")
      .select("converted_vendor_id,created_at")
      .eq("status", "converted")
      .not("converted_vendor_id", "is", null),
  ]);
  const activities = await searchTripActivities(
    { category: null, near: anchor, sort: anchor ? "distance_asc" : "recommended" },
    items.flatMap((item) => item.experience_id ? [item.experience_id] : []),
    db,
    discoveryData,
  );
  const sponsoredPlacements = placementsResult.error ? [] : ((placementsResult.data ?? []) as Array<{
    id: string;
    product_id: string;
    state: string | null;
    category_slug: string | null;
    starts_at: string;
    ends_at: string;
    priority: number;
    status: SponsoredPlacement["status"];
  }>).map((placement): SponsoredPlacement => ({
    id: placement.id,
    productId: placement.product_id,
    state: placement.state,
    categorySlug: placement.category_slug,
    startsAt: placement.starts_at,
    endsAt: placement.ends_at,
    priority: placement.priority,
    status: placement.status,
  }));
  const suggestedAtByVendor = suggestionsResult.error
    ? {}
    : collapseSuggestedAtByVendor((suggestionsResult.data ?? []) as Array<{ converted_vendor_id: string | null; created_at: string }>);

  return <MapClient key={trip.id} initialActivities={activities} initialDiscoveryFingerprint={getTripDiscoveryFingerprint(items, trip.start_date)} tripData={trip} initialItems={items} sponsoredPlacements={sponsoredPlacements} suggestedAtByVendor={suggestedAtByVendor} />;
}
