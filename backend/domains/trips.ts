import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { highestDefaultTripNumber } from "@/lib/customer/trip-name";

export type Trip = {
  id: string;
  user_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
};

export type TripItem = {
  id: string;
  trip_id: string;
  experience_id: string | null;
  sequence: number;
  scheduled_date: string | null;
  scheduled_time: string | null;
  created_at: string;
  source: "vendor" | "location";
  kind?: "custom" | "gps";
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
  /** Outlet the stop was planned at; null for location stops and stops added before outlets were saved. */
  outlet_id?: string | null;
  is_day_origin?: boolean;
};

export type AddTripItemInput = {
  trip_id: string;
  experience_id?: string;
  source: "vendor" | "location";
  kind?: "custom" | "gps";
  lat: number;
  lng: number;
  label: string;
  sublabel?: string;
  scheduled_date?: string | null;
  scheduled_time?: string | null;
  outlet_id?: string | null;
  is_day_origin?: boolean;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type DbTrip = Trip & { legacy_id?: string | null };
type DbTripItem = TripItem & { kind: TripItem["kind"] | null; sublabel: string | null; legacy_id?: string | null };
async function requireOwner(db: SupabaseClient) {
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user?.id) throw new Error("Authentication required");
  return user.id;
}

function toTrip(row: DbTrip): Trip {
  return {
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    start_date: row.start_date,
    end_date: row.end_date,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function toTripItem(row: DbTripItem): TripItem {
  return {
    id: row.id,
    trip_id: row.trip_id,
    experience_id: row.experience_id,
    sequence: row.sequence,
    scheduled_date: row.scheduled_date,
    scheduled_time: row.scheduled_time,
    created_at: row.created_at,
    source: row.source,
    kind: row.kind ?? undefined,
    lat: Number(row.lat),
    lng: Number(row.lng),
    label: row.label,
    sublabel: row.sublabel ?? undefined,
    outlet_id: row.outlet_id ?? null,
    is_day_origin: row.is_day_origin ?? false,
  };
}

function throwOnError(error: { message?: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback);
}

async function getOwnedTrip(db: SupabaseClient, tripId: string, ownerId: string): Promise<Trip | null> {
  let query = db.from("trips").select("id,user_id,name,start_date,end_date,created_at,updated_at")
    .eq("user_id", ownerId);
  query = UUID_PATTERN.test(tripId) ? query.eq("id", tripId) : query.eq("legacy_id", tripId);
  const { data, error } = await query.maybeSingle();
  throwOnError(error, "Could not load trip");
  return data ? toTrip(data as DbTrip) : null;
}

export async function getTrips(db: SupabaseClient): Promise<Trip[]> {
  const ownerId = await requireOwner(db);
  const { data, error } = await db.from("trips")
    .select("id,user_id,name,start_date,end_date,created_at,updated_at")
    .eq("user_id", ownerId).order("created_at", { ascending: false });
  throwOnError(error, "Could not load trips");
  return (data ?? []).map((row: DbTrip) => toTrip(row));
}

export async function getTripNameSequence(db: SupabaseClient) {
  return highestDefaultTripNumber(await getTrips(db));
}

export type TripMutationCode = "TRIP_CHANGED" | "TRIP_INVALID" | "TRIP_NOT_AVAILABLE" | "TRIP_ACCESS_DENIED" | "TRIP_UNAVAILABLE" | "TRIP_RESULT_UNKNOWN";

export type TripWrite<T> = { value: T; version: string };
export async function writeTrip<T>(db: SupabaseClient, tripId: string, expectedVersion: string, operation: string, input: Record<string, unknown> = {}): Promise<TripWrite<T>> {
  const { data, error } = await db.rpc("mutate_customer_trip", {
    p_trip_id: tripId, p_expected_version: expectedVersion || null, p_operation: operation, p_input: input,
  });
  if (error) {
    const failure = new Error("Trip mutation rejected");
    const message = error.message ?? "";
    const code: TripMutationCode = message.includes("trip_changed") ? "TRIP_CHANGED"
      : /authentication_required/.test(message) || error.code === "42501" ? "TRIP_ACCESS_DENIED"
      : /trip_(not_found|item_not_found|activity_unavailable|outlet_unavailable|schedule_unavailable)/.test(message) ? "TRIP_NOT_AVAILABLE"
      : /trip_.*(invalid|limit|non_chronological)/.test(message) || error.code?.startsWith("22") ? "TRIP_INVALID"
      : error.code ? "TRIP_UNAVAILABLE" : "TRIP_RESULT_UNKNOWN";
    Object.assign(failure, { code });
    throw failure;
  }
  if (!data || typeof data.version !== "string") throw Object.assign(new Error("Trip receipt unavailable"), { code: "TRIP_RESULT_UNKNOWN" });
  return data as TripWrite<T>;
}

export async function createTrip(input: {name:string;start_date?:string;end_date?:string}, db: SupabaseClient): Promise<Trip | null> {
  return (await writeTrip<Trip>(db, "", "", "create", input)).value;
}
export async function addTripItem(input: AddTripItemInput, db: SupabaseClient, version: string) {
  return writeTrip<TripItem>(db, input.trip_id, version, "add", input);
}

export async function getTripById(tripId: string, db: SupabaseClient): Promise<Trip | null> {
  const ownerId = await requireOwner(db);
  return getOwnedTrip(db, tripId, ownerId);
}

export async function getTripItems(tripId: string, db: SupabaseClient): Promise<TripItem[]> {
  const ownerId = await requireOwner(db);
  const trip = await getOwnedTrip(db, tripId, ownerId);
  if (!trip) return [];
  const { data, error } = await db.from("trip_items").select("*,trips!inner(user_id)")
    .eq("trip_id", trip.id).order("sequence", { ascending: true });
  throwOnError(error, "Could not load trip stops");
  return (data ?? []).map((row: DbTripItem) => toTripItem(row));
}

export async function updateTripItem(itemId:string, updates:{scheduled_date:string | null;scheduled_time:string | null}, db:SupabaseClient, tripId:string, version:string) {
  return writeTrip<TripItem>(db,tripId,version,"schedule",{item_id:itemId,...updates});
}
export async function reorderTripItems(tripId:string, ids:string[], db:SupabaseClient, version:string) {
  return writeTrip<TripItem[]>(db,tripId,version,"reorder",{ids});
}
export async function updateTripItemLocation(itemId:string, updates:{label:string;lat:number;lng:number}, db:SupabaseClient, tripId:string, version:string) {
  return writeTrip<TripItem>(db,tripId,version,"location",{item_id:itemId,...updates});
}
export async function deleteTripItem(itemId:string, db:SupabaseClient, tripId:string, version:string) {
  return writeTrip<null>(db,tripId,version,"remove",{item_id:itemId});
}
export async function deleteTrip(tripId:string, db:SupabaseClient, version:string) {
  return writeTrip<null>(db,tripId,version,"delete");
}
export async function clearTripItems(tripId:string, db:SupabaseClient, version:string) {
  return writeTrip<null>(db,tripId,version,"clear");
}
export async function replaceTripItem(itemId:string, replacement:{experience_id:string;outlet_id?:string | null}, db:SupabaseClient, tripId:string, version:string) {
  return writeTrip<TripItem>(db,tripId,version,"replace",{item_id:itemId,...replacement});
}

/** Reads never import. A user explicitly chooses to restore this browser's old data. */
export async function legacyCustomerTrips(ownerId:string) {
  const jar=await cookies();
  try {
    const rawTrips=jar.get("MOCK_TRIPS")?.value ?? "[]";
    const rawItems=jar.get("MOCK_TRIP_ITEMS")?.value ?? "[]";
    if(rawTrips.length>32768 || rawItems.length>131072) return [];
    const trips:unknown=JSON.parse(rawTrips), items:unknown=JSON.parse(rawItems);
    if(!Array.isArray(trips) || !Array.isArray(items)) return [];
    return trips.slice(0,20).flatMap((trip:unknown)=>{
      if(!trip || typeof trip !== "object") return [];
      const t=trip as Record<string,unknown>;
      if(typeof t.id !== "string" || t.id.startsWith("mock-trip-") || typeof t.name !== "string" || (t.user_id !== ownerId && t.user_id !== "mock-user")) return [];
      const stops=items.map((entry:unknown)=>Array.isArray(entry) ? {id:entry[0],trip_id:entry[1],experience_id:entry[2],sequence:entry[3],scheduled_date:entry[4],scheduled_time:entry[5],source:entry[7],kind:entry[8],lat:entry[9],lng:entry[10],label:entry[11],sublabel:entry[12]} : entry)
        .filter((entry):entry is Record<string,unknown>=>Boolean(entry) && typeof entry === "object" && !Array.isArray(entry))
        .filter(entry=>entry.trip_id === t.id && typeof entry.id === "string" && !entry.id.startsWith("seed-"))
        .sort((a,b)=>Number(a.sequence)-Number(b.sequence));
      return [{legacyId:t.id,trip:{name:t.name,start_date:t.start_date ?? null,end_date:t.end_date ?? null},items:stops}];
    });
  } catch {return [];}
}

export async function restoreLegacyCustomerTrips(db:SupabaseClient) {
  const ownerId=await requireOwner(db);
  const candidates=await legacyCustomerTrips(ownerId);
  for(const candidate of candidates) {
    const {error}=await db.rpc("restore_customer_trip",{p_legacy_id:candidate.legacyId,p_trip:candidate.trip,p_items:candidate.items});
    throwOnError(error,"Could not restore saved trip");
  }
  // A completed DB receipt is the cross-browser guarantee; cookie cleanup is optional.
  try {const jar=await cookies();jar.delete("MOCK_TRIPS");jar.delete("MOCK_TRIP_ITEMS");} catch { /* A retry is safe because each trip has a durable receipt. */ }
}
