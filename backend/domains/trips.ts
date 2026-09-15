import { SupabaseClient } from "@supabase/supabase-js";

import { cookies } from "next/headers";
import { getTripDayDates, hasChronologicalTripTimes } from "@/lib/customer/trip-planner";
import { addMalaysiaCalendarDays, getMalaysiaDateInputValue } from "@/lib/datetime/date-input";
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
};

// --- COOKIE BASED MOCK STORE FOR LOCAL TESTING ---
export const MOCK_TRIP_SEED_VERSION = "relative-itineraries-v2";

const MOCK_TRIP_SEED_VERSION_COOKIE = "MOCK_TRIP_SEED_VERSION";
const MOCK_TRIP_NAME_SEQUENCE_COOKIE = "MOCK_TRIP_NAME_SEQUENCE";

type CompactTripItem = [
  id: string,
  tripId: string,
  experienceId: string | null,
  sequence: number,
  scheduledDate: string | null,
  scheduledTime: string | null,
  createdAt: string,
  source: TripItem["source"],
  kind: TripItem["kind"] | null,
  lat: number,
  lng: number,
  label: string,
  sublabel: string | null,
];

function firstDayOfNextMonth(dateValue: string) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1, 1);
  return date.toISOString().slice(0, 10);
}

export function buildRelativeMockTripSeed(now: Date, ownerId: string): { trips: Trip[]; items: TripItem[] } {
  const today = getMalaysiaDateInputValue(now);
  const dayAfterTomorrow = addMalaysiaCalendarDays(today, 2);
  const nextWeek = addMalaysiaCalendarDays(today, 7);
  const nextMonth = firstDayOfNextMonth(today);
  const timestamp = now.toISOString();

  const trips: Trip[] = [
    {
      id: "mock-trip-penang-two-days",
      user_id: ownerId,
      name: "Penang Escape in Two Days",
      start_date: dayAfterTomorrow,
      end_date: addMalaysiaCalendarDays(dayAfterTomorrow, 2),
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: "mock-trip-kuala-lumpur-next-week",
      user_id: ownerId,
      name: "Kuala Lumpur Next Week",
      start_date: nextWeek,
      end_date: addMalaysiaCalendarDays(nextWeek, 2),
      created_at: timestamp,
      updated_at: timestamp,
    },
    {
      id: "mock-trip-sabah-next-month",
      user_id: ownerId,
      name: "Sabah Next Month Adventure",
      start_date: nextMonth,
      end_date: addMalaysiaCalendarDays(nextMonth, 3),
      created_at: timestamp,
      updated_at: timestamp,
    },
  ];

  const items: TripItem[] = [
    {
      id: "seed-origin-penang-george-town",
      trip_id: trips[0].id,
      experience_id: null,
      sequence: 0,
      scheduled_date: null,
      scheduled_time: null,
      created_at: timestamp,
      source: "location",
      kind: "custom",
      lat: 5.4141,
      lng: 100.3288,
      label: "George Town, Penang",
      sublabel: "Starting point",
    },
    {
      id: "seed-item-penang-george-town-walk",
      trip_id: trips[0].id,
      experience_id: "ae9cf9c7-aa4c-4d31-ae2d-420a2753c5a7",
      sequence: 1,
      scheduled_date: dayAfterTomorrow,
      scheduled_time: "10:00",
      created_at: timestamp,
      source: "vendor",
      lat: 5.422785,
      lng: 100.265224,
      label: "Standard Entrance Pass",
      sublabel: "The Habitat Penang Hill · Ayer Itam",
    },
    {
      id: "seed-item-penang-national-park",
      trip_id: trips[0].id,
      experience_id: "a54fe0fb-042c-e2e4-9dde-c18a8444cb8e",
      sequence: 2,
      scheduled_date: addMalaysiaCalendarDays(dayAfterTomorrow, 1),
      scheduled_time: "09:00",
      created_at: timestamp,
      source: "vendor",
      lat: 5.448652,
      lng: 100.216632,
      label: "Adventureplay + Waterplay Day Pass",
      sublabel: "ESCAPE Penang · Teluk Bahang",
    },
    {
      id: "seed-origin-kuala-lumpur-brickfields",
      trip_id: trips[1].id,
      experience_id: null,
      sequence: 0,
      scheduled_date: null,
      scheduled_time: null,
      created_at: timestamp,
      source: "location",
      kind: "custom",
      lat: 3.1279,
      lng: 101.6869,
      label: "KL Sentral, Brickfields",
      sublabel: "Starting point",
    },
    {
      id: "seed-item-kl-bukit-nanas",
      trip_id: trips[1].id,
      experience_id: "6fda4b3f-b932-4238-a418-dde327462126",
      sequence: 1,
      scheduled_date: nextWeek,
      scheduled_time: "09:30",
      created_at: timestamp,
      source: "vendor",
      lat: 3.1528,
      lng: 101.7038,
      label: "Adult Admission",
      sublabel: "Forest Canopy KL · Kuala Lumpur",
    },
    {
      id: "seed-item-kl-merdeka-square",
      trip_id: trips[1].id,
      experience_id: "494b5af6-49d5-4fc8-a0a9-054c1201d295",
      sequence: 2,
      scheduled_date: addMalaysiaCalendarDays(nextWeek, 1),
      scheduled_time: "16:00",
      created_at: timestamp,
      source: "vendor",
      lat: 3.157,
      lng: 101.712,
      label: "Private Guided Tour",
      sublabel: "Kuala Lumpur City Guides · Kuala Lumpur",
    },
    {
      id: "seed-origin-sabah-kota-kinabalu",
      trip_id: trips[2].id,
      experience_id: null,
      sequence: 0,
      scheduled_date: null,
      scheduled_time: null,
      created_at: timestamp,
      source: "location",
      kind: "custom",
      lat: 5.9749,
      lng: 116.0724,
      label: "Kota Kinabalu, Sabah",
      sublabel: "Starting point",
    },
    {
      id: "seed-item-sabah-kinabalu-foothill",
      trip_id: trips[2].id,
      experience_id: "0ebf0f78-6e99-d77e-954c-1abff3b52514",
      sequence: 1,
      scheduled_date: nextMonth,
      scheduled_time: "08:00",
      created_at: timestamp,
      source: "vendor",
      lat: 5.973711,
      lng: 116.203843,
      label: "Entry & Show Ticket",
      sublabel: "Mari Mari Cultural Village · Tuaran",
    },
    {
      id: "seed-item-sabah-river-rainforest",
      trip_id: trips[2].id,
      experience_id: "a9bcb898-5f5f-22db-9b9d-809cfb3aa108",
      sequence: 2,
      scheduled_date: addMalaysiaCalendarDays(nextMonth, 2),
      scheduled_time: "07:30",
      created_at: timestamp,
      source: "vendor",
      lat: 5.982238,
      lng: 116.076195,
      label: "TAR Marine Park Island Hopping",
      sublabel: "Sticky Rice Travel · Kota Kinabalu",
    },
  ];

  return { trips, items };
}

function parseTripItems(value: string | undefined): TripItem[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as Array<TripItem | CompactTripItem>;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => {
      if (!Array.isArray(item)) return item;
      return {
        id: item[0],
        trip_id: item[1],
        experience_id: item[2],
        sequence: item[3],
        scheduled_date: item[4],
        scheduled_time: item[5],
        created_at: item[6],
        source: item[7],
        kind: item[8] ?? undefined,
        lat: item[9],
        lng: item[10],
        label: item[11],
        sublabel: item[12] ?? undefined,
      };
    });
  } catch {
    return [];
  }
}

function serializeTripItems(items: TripItem[]) {
  const compactItems: CompactTripItem[] = items.map((item) => [
    item.id,
    item.trip_id,
    item.experience_id,
    item.sequence,
    item.scheduled_date,
    item.scheduled_time,
    item.created_at,
    item.source,
    item.kind ?? null,
    item.lat,
    item.lng,
    item.label,
    item.sublabel ?? null,
  ]);
  return JSON.stringify(compactItems);
}

function mergeMissingById<T extends { id: string }>(existing: T[], seeded: T[]) {
  const existingIds = new Set(existing.map((entry) => entry.id));
  return [...existing, ...seeded.filter((entry) => !existingIds.has(entry.id))];
}

function refreshExistingSeedItemMetadata(existing: TripItem[], seeded: TripItem[]) {
  const seededById = new Map(seeded.map((item) => [item.id, item]));
  return existing.map((item) => {
    const seedItem = seededById.get(item.id);
    if (!seedItem) return item;
    return {
      ...item,
      trip_id: seedItem.trip_id,
      experience_id: seedItem.experience_id,
      source: seedItem.source,
      kind: seedItem.kind,
      lat: seedItem.lat,
      lng: seedItem.lng,
      label: seedItem.label,
      sublabel: seedItem.sublabel,
    };
  });
}

async function getMockData(db: SupabaseClient) {
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user?.id) throw new Error("Authentication required");

  const ownerId = user.id;
  const cookieStore = await cookies();
  const tripsStr = cookieStore.get("MOCK_TRIPS")?.value;
  const itemsStr = cookieStore.get("MOCK_TRIP_ITEMS")?.value;
  const seedVersion = cookieStore.get(MOCK_TRIP_SEED_VERSION_COOKIE)?.value;
  
  let MOCK_TRIPS: Trip[];
  try {
    MOCK_TRIPS = tripsStr ? JSON.parse(tripsStr) : [];
  } catch {
    MOCK_TRIPS = [];
  }
  MOCK_TRIPS = MOCK_TRIPS.map((trip) => trip.user_id === "mock-user"
    ? { ...trip, user_id: ownerId }
    : trip);

  let MOCK_TRIP_ITEMS = parseTripItems(itemsStr);
  let tripNameSequences: Record<string, number> = {};
  try {
    tripNameSequences = JSON.parse(cookieStore.get(MOCK_TRIP_NAME_SEQUENCE_COOKIE)?.value ?? "{}") as Record<string, number>;
  } catch {
    tripNameSequences = {};
  }

  if (seedVersion !== MOCK_TRIP_SEED_VERSION) {
    const seed = buildRelativeMockTripSeed(new Date(), ownerId);
    if (seedVersion?.startsWith("relative-itineraries-v")) {
      MOCK_TRIP_ITEMS = refreshExistingSeedItemMetadata(MOCK_TRIP_ITEMS, seed.items);
    } else {
      MOCK_TRIPS = mergeMissingById(MOCK_TRIPS, seed.trips);
      MOCK_TRIP_ITEMS = mergeMissingById(MOCK_TRIP_ITEMS, seed.items);
    }
  }

  const storedSequence = tripNameSequences[ownerId];
  const currentSequence = highestDefaultTripNumber(MOCK_TRIPS.filter((trip) => trip.user_id === ownerId));
  const tripNameSequence = Number.isSafeInteger(storedSequence) && storedSequence >= 0
    ? Math.max(storedSequence, currentSequence)
    : currentSequence;

  return { MOCK_TRIPS, MOCK_TRIP_ITEMS, cookieStore, ownerId, tripNameSequence };
}

async function saveMockData(trips: Trip[], items: TripItem[], ownerId: string) {
  const cookieStore = await cookies();
  let tripNameSequences: Record<string, number> = {};
  try {
    tripNameSequences = JSON.parse(cookieStore.get(MOCK_TRIP_NAME_SEQUENCE_COOKIE)?.value ?? "{}") as Record<string, number>;
  } catch {
    tripNameSequences = {};
  }
  const storedSequence = tripNameSequences[ownerId];
  const currentSequence = highestDefaultTripNumber(trips.filter((trip) => trip.user_id === ownerId));
  tripNameSequences[ownerId] = Number.isSafeInteger(storedSequence) && storedSequence >= 0
    ? Math.max(storedSequence, currentSequence)
    : currentSequence;
  cookieStore.set("MOCK_TRIPS", JSON.stringify(trips), { path: "/" });
  cookieStore.set("MOCK_TRIP_ITEMS", serializeTripItems(items), { path: "/" });
  cookieStore.set(MOCK_TRIP_SEED_VERSION_COOKIE, MOCK_TRIP_SEED_VERSION, { path: "/" });
  cookieStore.set(MOCK_TRIP_NAME_SEQUENCE_COOKIE, JSON.stringify(tripNameSequences), { path: "/" });
}
// -------------------------------------------------

export async function getTrips(db: SupabaseClient): Promise<Trip[]> {
  const { MOCK_TRIPS, ownerId } = await getMockData(db);
  return MOCK_TRIPS.filter((trip) => trip.user_id === ownerId);
}

export async function getTripNameSequence(db: SupabaseClient) {
  const { tripNameSequence } = await getMockData(db);
  return tripNameSequence;
}

export async function createTrip(
  input: { name: string; start_date?: string; end_date?: string },
  db: SupabaseClient
): Promise<Trip | null> {
  const { MOCK_TRIPS, MOCK_TRIP_ITEMS, ownerId } = await getMockData(db);
  const newTrip: Trip = {
    id: "trip-" + Math.random().toString(36).substring(2, 9),
    user_id: ownerId,
    name: input.name,
    start_date: input.start_date || null,
    end_date: input.end_date || null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  MOCK_TRIPS.push(newTrip);
  await saveMockData(MOCK_TRIPS, MOCK_TRIP_ITEMS, ownerId);
  return newTrip;
}

export async function addTripItem(
  input: AddTripItemInput,
  db: SupabaseClient
): Promise<TripItem> {
  const { MOCK_TRIPS, MOCK_TRIP_ITEMS, ownerId } = await getMockData(db);
  const trip = MOCK_TRIPS.find((candidate) => candidate.id === input.trip_id && candidate.user_id === ownerId);
  if (!trip) throw new Error("Trip not found");
  if (input.scheduled_date && !getTripDayDates(trip).includes(input.scheduled_date)) {
    throw new Error("Scheduled date is outside this trip");
  }

  const existingItems = MOCK_TRIP_ITEMS.filter(i => i.trip_id === input.trip_id);
  const nextSequence = existingItems.length;

  const item: TripItem = {
    id: input.experience_id || ("loc-" + Math.random().toString(36).substring(2, 9)),
    trip_id: input.trip_id,
    experience_id: input.experience_id || null,
    sequence: nextSequence,
    scheduled_date: input.scheduled_date ?? null,
    scheduled_time: input.scheduled_time ?? null,
    created_at: new Date().toISOString(),
    source: input.source,
    kind: input.kind,
    lat: input.lat,
    lng: input.lng,
    label: input.label,
    sublabel: input.sublabel
  };
  MOCK_TRIP_ITEMS.push(item);
  await saveMockData(MOCK_TRIPS, MOCK_TRIP_ITEMS, ownerId);
  return item;
}

export async function getTripById(tripId: string, db: SupabaseClient): Promise<Trip | null> {
  const { MOCK_TRIPS, ownerId } = await getMockData(db);
  return MOCK_TRIPS.find((trip) => trip.id === tripId && trip.user_id === ownerId) || null;
}

export async function getTripItems(tripId: string, db: SupabaseClient): Promise<TripItem[]> {
  const { MOCK_TRIPS, MOCK_TRIP_ITEMS, ownerId } = await getMockData(db);
  if (!MOCK_TRIPS.some((trip) => trip.id === tripId && trip.user_id === ownerId)) return [];
  const items = MOCK_TRIP_ITEMS.filter(i => i.trip_id === tripId).sort((a, b) => a.sequence - b.sequence);
  return items;
}

export async function updateTripItem(
  itemId: string,
  updates: { sequence?: number; scheduled_date?: string | null; scheduled_time?: string | null },
  db: SupabaseClient
): Promise<void> {
  const { MOCK_TRIPS, MOCK_TRIP_ITEMS, ownerId } = await getMockData(db);
  const item = MOCK_TRIP_ITEMS.find(i => i.id === itemId);
  if (item && !MOCK_TRIPS.some((trip) => trip.id === item.trip_id && trip.user_id === ownerId)) {
    throw new Error("Trip not found");
  }
  if (item) {
    const proposedItems = MOCK_TRIP_ITEMS.map((entry) => entry.id === itemId ? {
      ...entry,
      ...(updates.sequence === undefined ? {} : { sequence: updates.sequence }),
      ...(updates.scheduled_date === undefined ? {} : { scheduled_date: updates.scheduled_date }),
      ...(updates.scheduled_time === undefined ? {} : { scheduled_time: updates.scheduled_time }),
    } : entry);
    if (!hasChronologicalTripTimes(proposedItems.filter((entry) => entry.trip_id === item.trip_id))) {
      throw new Error("Trip times must follow itinerary order");
    }
    await saveMockData(MOCK_TRIPS, proposedItems, ownerId);
    return;
  }
  await saveMockData(MOCK_TRIPS, MOCK_TRIP_ITEMS, ownerId);
}

export async function reorderTripItems(
  tripId: string,
  reorderedItemIds: string[],
  db: SupabaseClient
): Promise<void> {
  const { MOCK_TRIPS, MOCK_TRIP_ITEMS, ownerId } = await getMockData(db);
  if (!MOCK_TRIPS.some((trip) => trip.id === tripId && trip.user_id === ownerId)) throw new Error("Trip not found");
  const sequenceById = new Map(reorderedItemIds.map((itemId, index) => [itemId, index]));
  const proposedItems = MOCK_TRIP_ITEMS.map((item) => item.trip_id === tripId && sequenceById.has(item.id)
    ? { ...item, sequence: sequenceById.get(item.id)! }
    : item);
  if (!hasChronologicalTripTimes(proposedItems.filter((item) => item.trip_id === tripId))) {
    throw new Error("Trip times must follow itinerary order");
  }
  await saveMockData(MOCK_TRIPS, proposedItems, ownerId);
}

export async function updateTripItemLocation(
  itemId: string,
  updates: { label: string; lat: number; lng: number },
  db: SupabaseClient
): Promise<void> {
  const { MOCK_TRIPS, MOCK_TRIP_ITEMS, ownerId } = await getMockData(db);
  const item = MOCK_TRIP_ITEMS.find(i => i.id === itemId);
  if (item && !MOCK_TRIPS.some((trip) => trip.id === item.trip_id && trip.user_id === ownerId)) {
    throw new Error("Trip not found");
  }
  if (item) {
    item.label = updates.label;
    item.lat = updates.lat;
    item.lng = updates.lng;
  }
  await saveMockData(MOCK_TRIPS, MOCK_TRIP_ITEMS, ownerId);
}

export async function deleteTripItem(itemId: string, db: SupabaseClient): Promise<void> {
  const { MOCK_TRIPS, MOCK_TRIP_ITEMS, ownerId } = await getMockData(db);
  const item = MOCK_TRIP_ITEMS.find((candidate) => candidate.id === itemId);
  if (item && !MOCK_TRIPS.some((trip) => trip.id === item.trip_id && trip.user_id === ownerId)) {
    throw new Error("Trip not found");
  }
  const index = MOCK_TRIP_ITEMS.findIndex(i => i.id === itemId);
  if (index > -1) MOCK_TRIP_ITEMS.splice(index, 1);
  await saveMockData(MOCK_TRIPS, MOCK_TRIP_ITEMS, ownerId);
}

export async function deleteTrip(tripId: string, db: SupabaseClient): Promise<void> {
  const { MOCK_TRIPS, MOCK_TRIP_ITEMS, ownerId } = await getMockData(db);
  const index = MOCK_TRIPS.findIndex((trip) => trip.id === tripId && trip.user_id === ownerId);
  if (index > -1) {
    MOCK_TRIPS.splice(index, 1);
    const remainingItems = MOCK_TRIP_ITEMS.filter(i => i.trip_id !== tripId);
    await saveMockData(MOCK_TRIPS, remainingItems, ownerId);
  }
}
