import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getServerTranslation } from "@/lib/i18n/server";
import { getTripNameSequence, getTrips } from "@/backend/domains/trips";
import { TripHubClient } from "./trip-hub-client";
import { redirect } from "next/navigation";
import { BRAND_NAME } from "@/lib/i18n/invariant-tokens";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslation("customer");
  return {
    title: `${t("ui.trip.title")} — ${BRAND_NAME}`,
    description: t("ui.trip.description"),
  };
}

export default async function TripPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();

  if (!user) {
    redirect("/login?next=/customer/trip");
  }

  const trips = await getTrips(db);
  const tripNameSequence = await getTripNameSequence(db);

  return <TripHubClient initialTrips={trips} initialTripNameSequence={tripNameSequence} />;
}
