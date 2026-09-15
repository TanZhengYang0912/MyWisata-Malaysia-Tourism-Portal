"use server";

import { createClient } from "@/lib/supabase/server";
import { createTrip, deleteTrip, getTripNameSequence } from "@/backend/domains/trips";
import type { AddTripItemInput } from "@/backend/domains/trips";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { nextDefaultTripName, parseSubmittedTripDates, parseSubmittedTripName } from "@/lib/customer/trip-name";

export async function createTripAction(formData: FormData) {
  const db = await createClient();
  const submittedName = parseSubmittedTripName(formData.get("name"));
  const { startDate, endDate } = parseSubmittedTripDates(
    formData.get("start_date"),
    formData.get("end_date"),
  );

  const name = submittedName || nextDefaultTripName([], await getTripNameSequence(db));

  const trip = await createTrip({
    name,
    start_date: startDate,
    end_date: endDate,
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

export async function addTripItemAction(input: AddTripItemInput) {
  const db = await createClient();
  const item = await import("@/backend/domains/trips").then(m => m.addTripItem(input, db));
  revalidatePath(`/customer/trip/${input.trip_id}`);
  return item;
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
