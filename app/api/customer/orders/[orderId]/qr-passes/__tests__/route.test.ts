import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from })) }));

import { GET } from "../route";
import { verifyTicketPassToken } from "@/lib/tickets/tokens";
import { verifyFoodFulfilmentToken } from "@/lib/food/food-fulfilment-token";

function query(data: unknown, error: { code: string; message: string } | null = null) {
  const result = Promise.resolve({ data, error });
  const builder: Record<string, unknown> = {};
  for (const key of ["select", "eq"]) builder[key] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => result);
  builder.then = result.then.bind(result);
  return builder;
}

describe("GET customer order QR passes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "customer-1" } }, error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === "orders") return query({ id: "order-1", status: "paid", user_id: "customer-1" });
      if (table === "bookings") return query([{ id: "booking-1", order_items: { outlet_id: "outlet-1" }, ticket_passes: { id: "pass-1", policy: "multi_entry", entry_limit: 3, entries_used: 1, status: "active", valid_from: "2026-09-21T10:00:00Z", valid_until: "2026-10-21T10:00:00Z" } }]);
      return query([{
        outlet_id: "food-outlet",
        product_name: "Nasi Lemak",
        variant_name: "Regular",
        quantity: 2,
        food_fulfilment_mode: "takeaway",
        food_qr_scanned_at: null,
        fulfil_status: "pending",
        products: { categories: { slug: "food" } },
        outlets: { name: "Kedai Makan" },
      }]);
    });
  });

  it("returns a server-signed token bound to the current database pass", async () => {
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ orderId: "order-1" }) });
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json.data.tickets).toHaveLength(1);
    expect(verifyTicketPassToken(json.data.tickets[0].passToken).claims).toMatchObject({
      bookingId: "booking-1", passId: "pass-1", outletId: "outlet-1", policy: "multi_entry", entryLimit: 3,
    });
    expect(json.data.tickets[0]).toMatchObject({ entriesUsed: 1, validUntil: "2026-10-21T10:00:00Z" });
    expect(json.data.foodOrders[0]).toMatchObject({ outletId: "food-outlet", mode: "takeaway", status: "pending", outletName: "Kedai Makan" });
    expect(verifyFoodFulfilmentToken(json.data.foodOrders[0].foodToken).claims).toMatchObject({ orderId: "order-1", outletId: "food-outlet" });
  });

  it.each(["food_fulfilment_mode", "food_qr_scanned_at"])("still returns booking passes when optional food column %s is not migrated", async (column) => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "orders") return query({ id: "order-1", status: "paid", user_id: "customer-1" });
      if (table === "bookings") return query([{
        id: "booking-1",
        order_items: { outlet_id: "outlet-1" },
        ticket_passes: [{ id: "pass-1", policy: "single_entry", entry_limit: 1, entries_used: 0, status: "active", valid_from: null, valid_until: null }],
      }]);
      return query(null, {
        code: "42703",
        message: `column order_items.${column} does not exist`,
      });
    });

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ orderId: "order-1" }) });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.tickets).toHaveLength(1);
    expect(verifyTicketPassToken(json.data.tickets[0].passToken).claims).toMatchObject({
      bookingId: "booking-1", passId: "pass-1", outletId: "outlet-1",
    });
    expect(json.data.foodOrders).toEqual([]);
  });

  it("does not hide unrelated food order query failures", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "orders") return query({ id: "order-1", status: "paid", user_id: "customer-1" });
      if (table === "bookings") return query([]);
      return query(null, { code: "42501", message: "permission denied for table order_items" });
    });

    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ orderId: "order-1" }) });

    expect(response.status).toBe(500);
  });

  it("does not issue QR tokens for an unpaid order", async () => {
    mocks.from.mockImplementation((table: string) => table === "orders" ? query({ id: "order-1", status: "pending_payment", user_id: "customer-1" }) : query([]));
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ orderId: "order-1" }) });
    expect(response.status).toBe(409);
  });

  it("reports dine-in arrival separately from food fulfilment", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "orders") return query({ id: "order-1", status: "paid", user_id: "customer-1" });
      if (table === "bookings") return query([]);
      return query([{
        outlet_id: "food-outlet", product_name: "Nasi Lemak", variant_name: null, quantity: 1,
        food_fulfilment_mode: "dine_in", food_qr_scanned_at: "2026-09-21T10:00:00Z", fulfil_status: "pending",
        products: { categories: { slug: "food" } }, outlets: { name: "Kedai Makan" },
      }]);
    });
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ orderId: "order-1" }) });
    expect((await response.json()).data.foodOrders[0].status).toBe("checked_in");
  });

  it("reports takeaway as fulfilled only after the outlet records delivery", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "orders") return query({ id: "order-1", status: "paid", user_id: "customer-1" });
      if (table === "bookings") return query([]);
      return query([{
        outlet_id: "food-outlet", product_name: "Nasi Lemak", variant_name: null, quantity: 1,
        food_fulfilment_mode: "takeaway", food_qr_scanned_at: "2026-09-21T10:00:00Z", fulfil_status: "fulfilled",
        products: { categories: { slug: "food" } }, outlets: { name: "Kedai Makan" },
      }]);
    });
    const response = await GET(new Request("http://localhost"), { params: Promise.resolve({ orderId: "order-1" }) });
    expect((await response.json()).data.foodOrders[0].status).toBe("fulfilled");
  });
});
