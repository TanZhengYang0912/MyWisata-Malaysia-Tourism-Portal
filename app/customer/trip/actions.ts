"use server";

import { createClient } from "@/lib/supabase/server";
import { createTrip, deleteTrip } from "@/backend/domains/trips";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

export async function createTripAction(formData: FormData) {
  const db = await createClient();
  const name = formData.get("name") as string;
  const startDate = formData.get("start_date") as string;
  const endDate = formData.get("end_date") as string;

  if (!name) {
    throw new Error("Trip name is required");
  }

  const trip = await createTrip({
    name,
    start_date: startDate || undefined,
    end_date: endDate || undefined,
  }, db);

  const tripId = trip?.id;

  if (tripId) {
    revalidatePath("/customer/trip");
    redirect(`/customer/trip/${tripId}`);
  }
}

export async function deleteTripAction(tripId: string) {
  const db = await createClient();
  await deleteTrip(tripId, db);
  revalidatePath("/customer/trip");
}

export async function addTripItemAction(input: {
  trip_id: string; 
  experience_id?: string; 
  source: "vendor" | "location";
  kind?: "custom" | "gps";
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
}) {
  const db = await createClient();
  await import("@/backend/domains/trips").then(m => m.addTripItem(input, db));
  revalidatePath(`/customer/trip/${input.trip_id}`);
}

export async function deleteTripItemAction(tripId: string, itemId: string) {
  const db = await createClient();
  await import("@/backend/domains/trips").then(m => m.deleteTripItem(itemId, db));
  revalidatePath(`/customer/trip/${tripId}`);
}

export async function reorderTripItemsAction(tripId: string, reorderedItemIds: string[]) {
  const db = await createClient();
  await import("@/backend/domains/trips").then(m => m.reorderTripItems(tripId, reorderedItemIds, db));
  revalidatePath(`/customer/trip/${tripId}`);
}
export async function updateTripItemScheduleAction(
  tripId: string,
  itemId: string,
  updates: { scheduled_date: string | null; scheduled_time: string | null },
) {
  const db = await createClient();
  await import("@/backend/domains/trips").then((m) => m.updateTripItem(itemId, updates, db));
  revalidatePath(`/customer/trip/${tripId}`);
}
export async function updateTripItemLocationAction(tripId: string, itemId: string, updates: { label: string; lat: number; lng: number }) {
  const db = await createClient();
  await import("@/backend/domains/trips").then(m => m.updateTripItemLocation(itemId, updates, db));
  revalidatePath(`/customer/trip/${tripId}`);
}
