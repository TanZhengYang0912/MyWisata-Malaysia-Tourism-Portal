import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getServerTranslation } from "@/lib/i18n/server";
import { getTripById, getTripItems } from "@/backend/domains/trips";
import { searchActivities } from "@/backend/domains/catalogue";
import { MapClient } from "./trip-planner-client";
import { redirect, notFound } from "next/navigation";
import { BRAND_NAME } from "@/lib/i18n/invariant-tokens";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslation("customer");
  return {
    title: `${t("ui.map.yourTrip")} — ${BRAND_NAME}`,
    description: t("ui.map.searchHint"),
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

  const items = await getTripItems(tripId, db);
  const activities = await searchActivities({ category: null, sort: "recommended" }, db);

  return <MapClient initialActivities={activities} tripData={trip} initialItems={items} />;
}
