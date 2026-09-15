import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getServerTranslation } from "@/lib/i18n/server";
import { getTripById, getTripItems } from "@/backend/domains/trips";
import { searchActivities } from "@/backend/domains/catalogue";
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
  const { data: { user } } = await db.auth.getUser();

  const resolvedParams = await params;
  const tripId = resolvedParams.tripId;

  if (!user) {
    redirect(`/auth/sign-in?redirect_to=/customer/trip/${tripId}`);
  }

  const trip = await getTripById(tripId, db);
  if (!trip) {
    notFound();
  }

  const [items, activities, placementsResult, suggestionsResult] = await Promise.all([
    getTripItems(tripId, db),
    searchActivities({ category: null, sort: "recommended" }, db),
    db.rpc("list_active_sponsored_discovery_placements"),
    db.from("vendor_recommendations")
      .select("converted_vendor_id,created_at")
      .eq("status", "converted")
      .not("converted_vendor_id", "is", null),
  ]);
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

  return <MapClient initialActivities={activities} tripData={trip} initialItems={items} sponsoredPlacements={sponsoredPlacements} suggestedAtByVendor={suggestedAtByVendor} />;
}
