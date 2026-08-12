import { createClient } from "@/lib/supabase/server";
import { getTripById, getTripItems } from "@/backend/domains/trips";
import { searchActivities } from "@/backend/domains/catalogue";
import { MapClient } from "./trip-planner-client";
import { redirect, notFound } from "next/navigation";

export const metadata = {
  title: "Trip Planner — MyWisata",
};

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
