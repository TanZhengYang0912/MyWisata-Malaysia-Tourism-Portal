import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { GET } from "../route";

const hours = {
  mon: { open: "09:00", close: "18:00" },
  tue: { open: "09:00", close: "18:00" },
  wed: { open: "09:00", close: "18:00" },
  thu: { open: "09:00", close: "18:00" },
  fri: { open: "09:00", close: "18:00" },
  sat: { open: "09:00", close: "18:00" },
  sun: { open: "09:00", close: "18:00" },
};

const liveSlot = {
  id: "slot-live-1",
  product_id: "product-live-1",
  outlet_id: "outlet-live-1",
  starts_at: "2030-07-02T02:00:00.000Z",
  ends_at: "2030-07-02T04:00:00.000Z",
  capacity: 10,
  booked: 2,
  status: "available",
  products: { id: "product-live-1", name: "Real Tuesday Walk", cover_url: null, requires_booking: true, categories: { slug: "activity" } },
  outlets: {
    id: "outlet-live-1",
    name: "George Town Outlet",
    operating_hours: hours,
    vendors: { name: "Local Walks", status: "approved" },
  },
};

function configureDatabase(data: unknown[]) {
  const query = {
    select: vi.fn(),
    gte: vi.fn(),
    lt: vi.fn(),
    eq: vi.fn(),
    order: vi.fn().mockResolvedValue({ data, error: null }),
  };
  query.select.mockReturnValue(query);
  query.gte.mockReturnValue(query);
  query.lt.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  mocks.createClient.mockResolvedValue({ from: vi.fn(() => query) });
  return query;
}

function request() {
  return new Request(
    "http://localhost/api/customer/event-calendar?from=2030-07-01T00:00:00.000Z&to=2030-07-31T00:00:00.000Z",
  );
}

describe("GET /api/customer/event-calendar live availability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NODE_ENV", "development");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns an empty live result without inventing preview sessions in development", async () => {
    const query = configureDatabase([]);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.events).toEqual([]);
    expect(query.gte).toHaveBeenCalledWith("starts_at", "2030-07-01T00:00:00.000Z");
  });

  it("projects an eligible database slot as a real calendar event", async () => {
    const query = configureDatabase([liveSlot]);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(query.select).toHaveBeenCalledWith(expect.stringContaining("categories(slug)"));
    expect(body.data.events).toEqual([expect.objectContaining({
      id: "slot-live-1",
      title: "Real Tuesday Walk",
      start: liveSlot.starts_at,
      end: liveSlot.ends_at,
      extendedProps: expect.objectContaining({
        activityId: "product-live-1",
        outletId: "outlet-live-1",
        outletName: "George Town Outlet",
        remainingCapacity: 8,
      }),
    })]);
  });

  it("projects room availability as a local stay date without exposing the generic slot time or end", async () => {
    configureDatabase([{
      ...liveSlot,
      products: {
        ...liveSlot.products,
        name: "Deluxe Room",
        categories: { slug: "accommodation" },
      },
    }]);

    const response = await GET(request());
    const body = await response.json();

    expect(body.data.events).toEqual([expect.objectContaining({
      id: "slot-live-1",
      start: "2030-07-02",
      allDay: true,
      extendedProps: expect.objectContaining({ isAccommodation: true }),
    })]);
    expect(body.data.events[0]).not.toHaveProperty("end");
  });

  it("keeps an available real slot that starts outside the outlet opening hours", async () => {
    configureDatabase([{
      ...liveSlot,
      starts_at: "2030-07-02T14:00:00.000Z",
      ends_at: "2030-07-02T16:00:00.000Z",
    }]);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.events).toEqual([expect.objectContaining({
      id: "slot-live-1",
      start: "2030-07-02T14:00:00.000Z",
      end: "2030-07-02T16:00:00.000Z",
    })]);
  });
});
