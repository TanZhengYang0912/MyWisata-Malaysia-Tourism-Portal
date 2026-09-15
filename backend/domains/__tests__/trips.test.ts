import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const values = new Map<string, string>();
const cookieStore = {
  get: vi.fn((name: string) => values.has(name) ? { value: values.get(name)! } : undefined),
  set: vi.fn((name: string, value: string) => { values.set(name, value); }),
};

vi.mock("next/headers", () => ({ cookies: async () => cookieStore }));

const {
  MOCK_TRIP_SEED_VERSION,
  addTripItem,
  buildRelativeMockTripSeed,
  createTrip,
  deleteTrip,
  getTripById,
  getTripItems,
  getTripNameSequence,
  getTrips,
  reorderTripItems,
  updateTripItem,
} = await import("@/backend/domains/trips");

const AUTHENTICATED_USER_ID = "aaaaaaaa-0000-0000-0000-000000000005";
const OTHER_USER_ID = "bbbbbbbb-0000-0000-0000-000000000006";
const authenticatedDb = {
  auth: {
    getUser: vi.fn(async () => ({ data: { user: { id: AUTHENTICATED_USER_ID } }, error: null })),
  },
} as never;
const unauthenticatedDb = {
  auth: {
    getUser: vi.fn(async () => ({ data: { user: null }, error: { message: "expired" } })),
  },
} as never;

const trip = {
  id: "trip-1",
  user_id: AUTHENTICATED_USER_ID,
  name: "Penang",
  start_date: "2026-09-15",
  end_date: "2026-09-17",
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-01T00:00:00.000Z",
};

describe("trip item persistence", () => {
  beforeEach(() => {
    values.clear();
    values.set("MOCK_TRIPS", JSON.stringify([trip]));
    values.set("MOCK_TRIP_ITEMS", JSON.stringify([]));
    values.set("MOCK_TRIP_SEED_VERSION", MOCK_TRIP_SEED_VERSION);
    vi.clearAllMocks();
  });

  it("adds and schedules a catalogue activity atomically", async () => {
    const stored = await addTripItem({
      trip_id: trip.id,
      experience_id: "activity-1",
      source: "vendor",
      lat: 5.4141,
      lng: 100.3288,
      label: "George Town Food Tour",
      scheduled_date: "2026-09-16",
      scheduled_time: "14:00",
    }, authenticatedDb);

    expect(stored).toMatchObject({
      experience_id: "activity-1",
      scheduled_date: "2026-09-16",
      scheduled_time: "14:00",
    });
    expect(await getTripItems(trip.id, authenticatedDb)).toContainEqual(stored);
  });

  it("keeps existing unscheduled callers backward compatible", async () => {
    const stored = await addTripItem({
      trip_id: trip.id,
      source: "location",
      lat: 5.4,
      lng: 100.3,
      label: "Starting point",
    }, authenticatedDb);
    expect(stored).toMatchObject({ scheduled_date: null, scheduled_time: null });
  });

  it("rejects a scheduled date outside the trip before saving", async () => {
    await expect(addTripItem({
      trip_id: trip.id,
      experience_id: "activity-1",
      source: "vendor",
      lat: 5.4,
      lng: 100.3,
      label: "Outside",
      scheduled_date: "2026-09-18",
    }, authenticatedDb)).rejects.toThrow("Scheduled date is outside this trip");
    expect(await getTripItems(trip.id, authenticatedDb)).toEqual([]);
  });

  it("rejects adding an item to another user's trip", async () => {
    values.set("MOCK_TRIPS", JSON.stringify([{ ...trip, user_id: OTHER_USER_ID }]));

    await expect(addTripItem({
      trip_id: trip.id,
      source: "location",
      lat: 5.4,
      lng: 100.3,
      label: "Unauthorized stop",
    }, authenticatedDb)).rejects.toThrow("Trip not found");
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("rejects a time that reverses the same-day itinerary order", async () => {
    values.set("MOCK_TRIP_ITEMS", JSON.stringify([
      {
        id: "first",
        trip_id: trip.id,
        experience_id: "activity-1",
        sequence: 1,
        scheduled_date: "2026-09-16",
        scheduled_time: "10:00",
        created_at: "2026-09-01T00:00:00.000Z",
        source: "vendor",
        lat: 5.4,
        lng: 100.3,
        label: "First",
      },
      {
        id: "second",
        trip_id: trip.id,
        experience_id: "activity-2",
        sequence: 2,
        scheduled_date: "2026-09-16",
        scheduled_time: "11:00",
        created_at: "2026-09-01T00:00:00.000Z",
        source: "vendor",
        lat: 5.41,
        lng: 100.31,
        label: "Second",
      },
    ]));

    await expect(updateTripItem("second", { scheduled_time: "09:59" }, authenticatedDb))
      .rejects.toThrow("Trip times must follow itinerary order");
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect((await getTripItems(trip.id, authenticatedDb)).find((entry) => entry.id === "second")?.scheduled_time).toBe("11:00");
  });

  it("rejects a drag reorder that would reverse scheduled times", async () => {
    values.set("MOCK_TRIP_ITEMS", JSON.stringify([
      {
        id: "first",
        trip_id: trip.id,
        experience_id: "activity-1",
        sequence: 1,
        scheduled_date: "2026-09-16",
        scheduled_time: "10:00",
        created_at: "2026-09-01T00:00:00.000Z",
        source: "vendor",
        lat: 5.4,
        lng: 100.3,
        label: "First",
      },
      {
        id: "second",
        trip_id: trip.id,
        experience_id: "activity-2",
        sequence: 2,
        scheduled_date: "2026-09-16",
        scheduled_time: "11:00",
        created_at: "2026-09-01T00:00:00.000Z",
        source: "vendor",
        lat: 5.41,
        lng: 100.31,
        label: "Second",
      },
    ]));

    await expect(reorderTripItems(trip.id, ["second", "first"], authenticatedDb))
      .rejects.toThrow("Trip times must follow itinerary order");
    expect(cookieStore.set).not.toHaveBeenCalled();
    expect((await getTripItems(trip.id, authenticatedDb)).map((entry) => entry.id)).toEqual(["first", "second"]);
  });
});

describe("relative mock trip seed", () => {
  const now = new Date("2026-09-14T16:30:00.000Z");

  beforeEach(() => {
    values.clear();
    vi.useFakeTimers();
    vi.setSystemTime(now);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("provides complete trips for the day after tomorrow, next week, and next month", async () => {
    const trips = await getTrips(authenticatedDb);

    expect(trips).toHaveLength(3);
    expect(trips.every((seededTrip) => seededTrip.user_id === AUTHENTICATED_USER_ID)).toBe(true);
    expect(trips.map(({ name, start_date, end_date }) => ({ name, start_date, end_date }))).toEqual([
      {
        name: "Penang Escape in Two Days",
        start_date: "2026-09-17",
        end_date: "2026-09-19",
      },
      {
        name: "Kuala Lumpur Next Week",
        start_date: "2026-09-22",
        end_date: "2026-09-24",
      },
      {
        name: "Sabah Next Month Adventure",
        start_date: "2026-10-01",
        end_date: "2026-10-04",
      },
    ]);

    for (const seededTrip of trips) {
      const items = await getTripItems(seededTrip.id, authenticatedDb);
      expect(items).toHaveLength(3);
      expect(items.map((item) => item.sequence)).toEqual([0, 1, 2]);
      expect(items.filter((item) => item.source === "location")).toHaveLength(1);
      expect(items.filter((item) => item.source === "vendor" && item.experience_id)).toHaveLength(2);
      expect(items.filter((item) => item.source === "vendor").every((item) => item.scheduled_date && item.scheduled_time)).toBe(true);
    }
  });

  it("uses current live catalogue activities and valid coordinates", () => {
    const seed = buildRelativeMockTripSeed(now, AUTHENTICATED_USER_ID);

    expect(seed.items.filter((item) => item.source === "vendor").map((item) => item.experience_id)).toEqual([
      "ae9cf9c7-aa4c-4d31-ae2d-420a2753c5a7",
      "a54fe0fb-042c-e2e4-9dde-c18a8444cb8e",
      "6fda4b3f-b932-4238-a418-dde327462126",
      "494b5af6-49d5-4fc8-a0a9-054c1201d295",
      "0ebf0f78-6e99-d77e-954c-1abff3b52514",
      "a9bcb898-5f5f-22db-9b9d-809cfb3aa108",
    ]);
    expect(seed.items.every((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng))).toBe(true);
  });

  it("refreshes surviving version-one seed metadata without replacing user choices or deleted seeds", async () => {
    const [penangTrip] = buildRelativeMockTripSeed(now, AUTHENTICATED_USER_ID).trips;
    values.set("MOCK_TRIP_SEED_VERSION", "relative-itineraries-v1");
    values.set("MOCK_TRIPS", JSON.stringify([penangTrip]));
    values.set("MOCK_TRIP_ITEMS", JSON.stringify([
      {
        id: "seed-item-penang-george-town-walk",
        trip_id: penangTrip.id,
        experience_id: "93806ba3-a1db-4a28-a8c8-5798a7dea394",
        sequence: 8,
        scheduled_date: "2026-09-19",
        scheduled_time: "15:45",
        created_at: "2026-09-10T00:00:00.000Z",
        source: "vendor",
        lat: 5.4141,
        lng: 100.3288,
        label: "George Town Story Walk",
        sublabel: "George Town, Penang",
      },
      {
        id: "user-added-chendul",
        trip_id: penangTrip.id,
        experience_id: "user-product",
        sequence: 9,
        scheduled_date: "2026-09-19",
        scheduled_time: "16:30",
        created_at: "2026-09-12T00:00:00.000Z",
        source: "vendor",
        lat: 5.415,
        lng: 100.329,
        label: "Original Chendul",
      },
    ]));

    const items = await getTripItems(penangTrip.id, authenticatedDb);
    const migrated = items.find((entry) => entry.id === "seed-item-penang-george-town-walk");

    expect(items).toHaveLength(2);
    expect(migrated).toMatchObject({
      experience_id: "ae9cf9c7-aa4c-4d31-ae2d-420a2753c5a7",
      label: "Standard Entrance Pass",
      sequence: 8,
      scheduled_date: "2026-09-19",
      scheduled_time: "15:45",
      created_at: "2026-09-10T00:00:00.000Z",
    });
    expect(items.some((entry) => entry.id === "user-added-chendul")).toBe(true);
    expect(items.some((entry) => entry.id === "seed-origin-penang-george-town")).toBe(false);
    expect(items.some((entry) => entry.id === "seed-item-penang-national-park")).toBe(false);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("merges missing seeds into an existing unversioned store without duplicates", async () => {
    values.set("MOCK_TRIPS", JSON.stringify([trip]));
    values.set("MOCK_TRIP_ITEMS", JSON.stringify([]));

    const firstRead = await getTrips(authenticatedDb);
    const secondRead = await getTrips(authenticatedDb);

    expect(firstRead).toHaveLength(4);
    expect(secondRead).toHaveLength(4);
    expect(firstRead[0]).toEqual(trip);
    expect(new Set(firstRead.map((candidate) => candidate.id)).size).toBe(4);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("does not resurrect a seed after a mutation persists the current seed version", async () => {
    const [seededTrip] = await getTrips(authenticatedDb);

    await deleteTrip(seededTrip.id, authenticatedDb);

    expect(values.get("MOCK_TRIP_SEED_VERSION")).toBe(MOCK_TRIP_SEED_VERSION);
    expect((await getTrips(authenticatedDb)).some((candidate) => candidate.id === seededTrip.id)).toBe(false);
  });

  it("keeps persisted mock cookies below the common 4096-byte limit", async () => {
    const seed = buildRelativeMockTripSeed(now, AUTHENTICATED_USER_ID);

    await updateTripItem(seed.items[0].id, { scheduled_time: "08:30" }, authenticatedDb);

    for (const name of ["MOCK_TRIPS", "MOCK_TRIP_ITEMS"]) {
      const value = values.get(name);
      expect(value).toBeDefined();
      expect(name.length + encodeURIComponent(value!).length).toBeLessThan(4096);
    }
  });

  it("migrates only legacy mock ownership while preserving itinerary data", async () => {
    const legacyTrip = { ...trip, user_id: "mock-user", name: "Preserved Penang" };
    values.set("MOCK_TRIPS", JSON.stringify([legacyTrip]));
    values.set("MOCK_TRIP_ITEMS", JSON.stringify([{
      id: "legacy-item",
      trip_id: legacyTrip.id,
      experience_id: null,
      sequence: 0,
      scheduled_date: "2026-09-16",
      scheduled_time: "14:30",
      created_at: legacyTrip.created_at,
      source: "location",
      lat: 5.4141,
      lng: 100.3288,
      label: "Preserved stop",
    }]));
    values.set("MOCK_TRIP_SEED_VERSION", MOCK_TRIP_SEED_VERSION);

    expect(await getTripById(legacyTrip.id, authenticatedDb)).toMatchObject({
      user_id: AUTHENTICATED_USER_ID,
      name: "Preserved Penang",
    });
    expect(await getTripItems(legacyTrip.id, authenticatedDb)).toEqual([
      expect.objectContaining({ label: "Preserved stop", scheduled_time: "14:30" }),
    ]);
    expect(cookieStore.set).not.toHaveBeenCalled();
  });

  it("does not expose a trip owned by another real user", async () => {
    values.set("MOCK_TRIPS", JSON.stringify([{ ...trip, user_id: OTHER_USER_ID }]));
    values.set("MOCK_TRIP_ITEMS", JSON.stringify([]));
    values.set("MOCK_TRIP_SEED_VERSION", MOCK_TRIP_SEED_VERSION);

    expect(await getTrips(authenticatedDb)).toEqual([]);
    expect(await getTripById(trip.id, authenticatedDb)).toBeNull();
  });

  it("creates trips for the authenticated user", async () => {
    values.set("MOCK_TRIPS", JSON.stringify([]));
    values.set("MOCK_TRIP_ITEMS", JSON.stringify([]));
    values.set("MOCK_TRIP_SEED_VERSION", MOCK_TRIP_SEED_VERSION);

    await expect(createTrip({ name: "Alice trip" }, authenticatedDb)).resolves.toMatchObject({
      user_id: AUTHENTICATED_USER_ID,
      name: "Alice trip",
    });
  });

  it("keeps the highest issued default trip number after its trip is deleted", async () => {
    values.set("MOCK_TRIPS", JSON.stringify([]));
    values.set("MOCK_TRIP_ITEMS", JSON.stringify([]));
    values.set("MOCK_TRIP_SEED_VERSION", MOCK_TRIP_SEED_VERSION);

    expect(await getTripNameSequence(authenticatedDb)).toBe(0);
    const created = await createTrip({ name: "Trip 1" }, authenticatedDb);
    expect(await getTripNameSequence(authenticatedDb)).toBe(1);

    await deleteTrip(created!.id, authenticatedDb);

    expect(await getTripNameSequence(authenticatedDb)).toBe(1);
  });

  it("fails closed without an authenticated user", async () => {
    await expect(getTrips(unauthenticatedDb)).rejects.toThrow("Authentication required");
    expect(cookieStore.set).not.toHaveBeenCalled();
  });
});
