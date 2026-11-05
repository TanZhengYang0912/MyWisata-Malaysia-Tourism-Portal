"use server";

import { createClient } from "@/lib/supabase/server";
import { createTrip, deleteTrip, getTripById, getTripItems, getTripNameSequence, getTrips } from "@/backend/domains/trips";
import type { AddTripItemInput, TripWrite, TripMutationCode } from "@/backend/domains/trips";
import { searchTripActivities } from "@/backend/domains/catalogue";
import { getCachedDiscoveryActivityData } from "@/lib/cache/catalogue-cache";
import { getTripDiscoveryAnchor } from "@/lib/customer/trip-planner";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { nextDefaultTripName, parseSubmittedTripDates, parseSubmittedTripName } from "@/lib/customer/trip-name";

const tripDiscoverySchema = z.object({
  tripId: z.string().min(1).max(128),
  near: z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).strict().optional(),
});

export async function searchTripActivitiesAction(tripId: string, near?: { lat: number; lng: number }) {
  const input = tripDiscoverySchema.parse({ tripId, near });
  const db = await createClient();
  const trip = await getTripById(input.tripId, db);
  if (!trip) throw new Error("Trip not found");
  const items = await getTripItems(input.tripId, db);
  const discoveryData = await getCachedDiscoveryActivityData();
  const anchor = input.near ?? getTripDiscoveryAnchor(items, trip.start_date);
  // Raw inventory stays on the server; only this owner's persisted stops can
  // request purchase details, projected by the shared Trip catalogue loader.
  return searchTripActivities(
    { category: null, near: anchor, sort: anchor ? "distance_asc" : "recommended" },
    items.flatMap((item) => item.experience_id ? [item.experience_id] : []),
    db,
    discoveryData,
  );
}

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

export async function deleteTripAction(tripId: string, version: string) {
  return mutateTrip(tripId,"delete",async()=>deleteTrip(tripId,await createClient(),version));
}

export type TripMutationResult<T> = {ok:true;value:T;version:string;refreshRequired?:true} | {ok:false;code:TripMutationCode};

async function mutateTrip<T>(tripId:string,operation:string,write:()=>Promise<TripWrite<T>>):Promise<TripMutationResult<T>> {
  try {
    const receipt=await write();
    try {
      revalidatePath(`/customer/trip/${tripId}`);
      return {ok:true,...receipt};
    } catch {
      console.warn("Trip mutation committed; cache refresh deferred",{operation});
      return {ok:true,...receipt,refreshRequired:true};
    }
  } catch(error) {
    // Expected rejection is data, so the framework does not navigate away from preserved UI state.
    // Never log database messages or transport headers: they may contain private input or credentials.
    const code=typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    console.warn("Trip mutation rejected",{operation,code:/^[A-Z0-9_]{2,32}$/.test(code) ? code : "UNAVAILABLE"});
    const known: TripMutationCode[] = ["TRIP_CHANGED", "TRIP_INVALID", "TRIP_NOT_AVAILABLE", "TRIP_ACCESS_DENIED", "TRIP_UNAVAILABLE", "TRIP_RESULT_UNKNOWN"];
    return {ok:false,code:known.includes(code as TripMutationCode) ? code as TripMutationCode : "TRIP_RESULT_UNKNOWN"};
  }
}

export async function addTripItemAction(input: AddTripItemInput,version:string) {
  return mutateTrip(input.trip_id,"add",async()=>{
    const db=await createClient();
    return import("@/backend/domains/trips").then(m=>m.addTripItem(input,db,version));
  });
}

export async function deleteTripItemAction(tripId:string,itemId:string,version:string) {
  return mutateTrip(tripId,"remove",async()=>{
    const db=await createClient();
    return import("@/backend/domains/trips").then(m=>m.deleteTripItem(itemId,db,tripId,version));
  });
}

export async function reorderTripItemsAction(tripId:string,reorderedItemIds:string[],version:string) {
  return mutateTrip(tripId,"reorder",async()=>{
    const db=await createClient();
    return import("@/backend/domains/trips").then(m=>m.reorderTripItems(tripId,reorderedItemIds,db,version));
  });
}

export async function updateTripItemScheduleAction(tripId:string,itemId:string,updates:{scheduled_date:string | null;scheduled_time:string | null},version:string) {
  return mutateTrip(tripId,"schedule",async()=>{
    const db=await createClient();
    return import("@/backend/domains/trips").then(m=>m.updateTripItem(itemId,updates,db,tripId,version));
  });
}

export async function updateTripItemLocationAction(tripId:string,itemId:string,updates:{label:string;lat:number;lng:number},version:string) {
  return mutateTrip(tripId,"location",async()=>{
    const db=await createClient();
    return import("@/backend/domains/trips").then(m=>m.updateTripItemLocation(itemId,updates,db,tripId,version));
  });
}

export async function clearTripItemsAction(tripId:string,version:string) {
  return mutateTrip(tripId,"clear",async()=>{
    const db=await createClient();
    return import("@/backend/domains/trips").then(m=>m.clearTripItems(tripId,db,version));
  });
}

export async function replaceTripItemAction(tripId:string,itemId:string,replacement:{experience_id:string;outlet_id?:string | null},version:string) {
  return mutateTrip(tripId,"replace",async()=>{
    const db=await createClient();
    return import("@/backend/domains/trips").then(m=>m.replaceTripItem(itemId,replacement,db,tripId,version));
  });
}

export async function restoreLegacyTripsAction() {
  try {
    const db=await createClient();
    await import("@/backend/domains/trips").then(m=>m.restoreLegacyCustomerTrips(db));
    revalidatePath("/customer/trip");
    return {ok:true as const,trips:await getTrips(db)};
  } catch {return {ok:false as const};}
}

/** Read-only reconciliation: never repeat a write whose response was lost. */
export async function getTripItemsStateAction(tripId: string) {
  try {
    const db = await createClient();
    const before = await getTripById(tripId, db);
    if (!before) return { ok: false as const };
    const items = await getTripItems(tripId, db);
    const after = await getTripById(tripId, db);
    if (!after || after.updated_at !== before.updated_at) return { ok: false as const };
    return { ok: true as const, items, version: after.updated_at };
  } catch { return { ok: false as const }; }
}
