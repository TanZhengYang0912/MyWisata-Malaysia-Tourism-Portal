import { SupabaseClient } from "@supabase/supabase-js";

import { cookies } from "next/headers";

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
};

// --- COOKIE BASED MOCK STORE FOR LOCAL TESTING ---
async function getMockData() {
  const cookieStore = await cookies();
  const tripsStr = cookieStore.get("MOCK_TRIPS")?.value;
  const itemsStr = cookieStore.get("MOCK_TRIP_ITEMS")?.value;
  
  let MOCK_TRIPS: Trip[];
  try {
    MOCK_TRIPS = tripsStr ? JSON.parse(tripsStr) : [];
  } catch {
    MOCK_TRIPS = [];
  }

  if (MOCK_TRIPS.length === 0) {
    MOCK_TRIPS = [
      {
        id: "mock-trip-1",
        user_id: "mock-user",
        name: "Penang Weekend Gateway",
        start_date: "2026-08-15",
        end_date: "2026-08-17",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    ];
  }

  let MOCK_TRIP_ITEMS: TripItem[];
  try {
    MOCK_TRIP_ITEMS = itemsStr ? JSON.parse(itemsStr) : [];
  } catch {
    MOCK_TRIP_ITEMS = [];
  }

  return { MOCK_TRIPS, MOCK_TRIP_ITEMS, cookieStore };
}

async function saveMockData(trips: Trip[], items: TripItem[]) {
  const cookieStore = await cookies();
  cookieStore.set("MOCK_TRIPS", JSON.stringify(trips), { path: "/" });
  cookieStore.set("MOCK_TRIP_ITEMS", JSON.stringify(items), { path: "/" });
}
// -------------------------------------------------

export async function getTrips(db: SupabaseClient<any>): Promise<Trip[]> {
  const { MOCK_TRIPS } = await getMockData();
  return MOCK_TRIPS;
}

export async function createTrip(
  input: { name: string; start_date?: string; end_date?: string },
  db: SupabaseClient<any>
): Promise<Trip | null> {
  const { MOCK_TRIPS, MOCK_TRIP_ITEMS } = await getMockData();
  const newTrip: Trip = {
    id: "trip-" + Math.random().toString(36).substring(2, 9),
    user_id: "mock-user",
    name: input.name,
    start_date: input.start_date || null,
    end_date: input.end_date || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  MOCK_TRIPS.push(newTrip);
  await saveMockData(MOCK_TRIPS, MOCK_TRIP_ITEMS);
  return newTrip;
}

export async function addTripItem(
  input: { 
    trip_id: string; 
    experience_id?: string; 
    source: "vendor" | "location";
    kind?: "custom" | "gps";
    lat: number;
    lng: number;
    label: string;
    sublabel?: string;
  },
  db: SupabaseClient<any>
): Promise<void> {
  const { MOCK_TRIPS, MOCK_TRIP_ITEMS } = await getMockData();
  const trip = MOCK_TRIPS.find(t => t.id === input.trip_id);
  if (!trip) throw new Error("Trip not found");

  const existingItems = MOCK_TRIP_ITEMS.filter(i => i.trip_id === input.trip_id);
  const nextSequence = existingItems.length;

  MOCK_TRIP_ITEMS.push({
    id: input.experience_id || ("loc-" + Math.random().toString(36).substring(2, 9)),
    trip_id: input.trip_id,
    experience_id: input.experience_id || null,
    sequence: nextSequence,
    scheduled_date: null,
    scheduled_time: null,
    created_at: new Date().toISOString(),
    source: input.source,
    kind: input.kind,
    lat: input.lat,
    lng: input.lng,
    label: input.label,
    sublabel: input.sublabel
  });
  await saveMockData(MOCK_TRIPS, MOCK_TRIP_ITEMS);
}

export async function getTripById(tripId: string, db: SupabaseClient<any>): Promise<Trip | null> {
  const { MOCK_TRIPS } = await getMockData();
  return MOCK_TRIPS.find(t => t.id === tripId) || null;
}

export async function getTripItems(tripId: string, db: SupabaseClient<any>): Promise<TripItem[]> {
  const { MOCK_TRIP_ITEMS } = await getMockData();
  const items = MOCK_TRIP_ITEMS.filter(i => i.trip_id === tripId).sort((a, b) => a.sequence - b.sequence);
  return items;
}

export async function updateTripItem(
  itemId: string,
  updates: { sequence?: number; scheduled_date?: string | null },
  db: SupabaseClient<any>
): Promise<void> {
  const { MOCK_TRIPS, MOCK_TRIP_ITEMS } = await getMockData();
  const item = MOCK_TRIP_ITEMS.find(i => i.id === itemId);
  if (item) {
    if (updates.sequence !== undefined) item.sequence = updates.sequence;
    if (updates.scheduled_date !== undefined) item.scheduled_date = updates.scheduled_date;
  }
  await saveMockData(MOCK_TRIPS, MOCK_TRIP_ITEMS);
}

export async function reorderTripItems(
  tripId: string,
  reorderedItemIds: string[],
  db: SupabaseClient<any>
): Promise<void> {
  const { MOCK_TRIPS, MOCK_TRIP_ITEMS } = await getMockData();
  const tripItems = MOCK_TRIP_ITEMS.filter(i => i.trip_id === tripId);
  for (let i = 0; i < reorderedItemIds.length; i++) {
    const item = tripItems.find(item => item.id === reorderedItemIds[i]);
    if (item) item.sequence = i;
  }
  await saveMockData(MOCK_TRIPS, MOCK_TRIP_ITEMS);
}

export async function updateTripItemLocation(
  itemId: string,
  updates: { label: string; lat: number; lng: number },
  db: SupabaseClient<any>
): Promise<void> {
  const { MOCK_TRIPS, MOCK_TRIP_ITEMS } = await getMockData();
  const item = MOCK_TRIP_ITEMS.find(i => i.id === itemId);
  if (item) {
    item.label = updates.label;
    item.lat = updates.lat;
    item.lng = updates.lng;
  }
  await saveMockData(MOCK_TRIPS, MOCK_TRIP_ITEMS);
}

export async function deleteTripItem(itemId: string, db: SupabaseClient<any>): Promise<void> {
  const { MOCK_TRIPS, MOCK_TRIP_ITEMS } = await getMockData();
  const index = MOCK_TRIP_ITEMS.findIndex(i => i.id === itemId);
  if (index > -1) MOCK_TRIP_ITEMS.splice(index, 1);
  await saveMockData(MOCK_TRIPS, MOCK_TRIP_ITEMS);
}

export async function deleteTrip(tripId: string, db: SupabaseClient<any>): Promise<void> {
  const { MOCK_TRIPS, MOCK_TRIP_ITEMS } = await getMockData();
  const index = MOCK_TRIPS.findIndex(t => t.id === tripId);
  if (index > -1) {
    MOCK_TRIPS.splice(index, 1);
    const remainingItems = MOCK_TRIP_ITEMS.filter(i => i.trip_id !== tripId);
    await saveMockData(MOCK_TRIPS, remainingItems);
  }
}
