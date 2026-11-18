import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { getServerTranslation } from "@/lib/i18n/server";
import { getTrips, legacyCustomerTrips } from "@/backend/domains/trips";
import { getClaimsUserId } from "@/lib/auth/claims-user";
import { highestDefaultTripNumber } from "@/lib/customer/trip-name";
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
  // Sign-in redirect only; getTrips still checks the owner with getUser().
  const userId = await getClaimsUserId(db);

  if (!userId) {
    redirect("/login?next=/customer/trip");
  }

  const trips = await getTrips(db);
  // Same value as getTripNameSequence(db), without reading the trips a second time.
  const tripNameSequence = highestDefaultTripNumber(trips);

  return <TripHubClient initialTrips={trips} initialTripNameSequence={tripNameSequence} hasLegacyTrips={(await legacyCustomerTrips(userId)).length>0} />;
}
