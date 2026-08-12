import { createClient } from "@/lib/supabase/server";
import { getTrips } from "@/backend/domains/trips";
import { TripHubClient } from "./trip-hub-client";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Trip Hub — MyWisata",
  description: "Manage your saved trips and itineraries.",
};

export default async function TripPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();

  if (!user) {
    redirect("/auth/sign-in?redirect_to=/customer/trip");
  }

  const trips = await getTrips(db);

  return <TripHubClient initialTrips={trips} />;
}
