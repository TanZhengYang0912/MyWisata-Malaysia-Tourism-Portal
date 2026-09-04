import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getServerTranslation } from "@/lib/i18n/server";
import { getTrips } from "@/backend/domains/trips";
import { TripHubClient } from "./trip-hub-client";
import { redirect } from "next/navigation";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslation("customer");
  return {
    title: `${t("ui.trip.title")} — MyWisata`,
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

  return <TripHubClient initialTrips={trips} />;
}
