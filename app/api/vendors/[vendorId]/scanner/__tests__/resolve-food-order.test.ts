import { beforeEach, describe, expect, it, vi } from "vitest";
import { signFoodFulfilmentToken } from "@/lib/food/food-fulfilment-token";
import { signTicketPassToken } from "@/lib/tickets/tokens";

const ids = {
  vendor: "11111111-1111-4111-8111-111111111111",
  outlet: "22222222-2222-4222-8222-222222222222",
  otherOutlet: "33333333-3333-4333-8333-333333333333",
  order: "44444444-4444-4444-8444-444444444444",
};
const mocks = vi.hoisted(() => ({ authorizeVendor: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/vendor-authorization", () => ({ authorizeVendor: mocks.authorizeVendor }));

import { POST } from "../resolve/route";

function query(data: unknown) {
  const result = Promise.resolve({ data, error: null });
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq"]) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => result);
  builder.then = result.then.bind(result);
  return builder;
}

describe("vendor scanner food order resolution", () => {
  let ticketPass: { id: string; policy: string; entry_limit: number; entries_used: number; status: string; valid_from: string | null; valid_until: string | null };
  beforeEach(() => {
    vi.clearAllMocks();
    ticketPass = { id: "66666666-6666-4666-8666-666666666666", policy: "single_entry", entry_limit: 1, entries_used: 0, status: "active", valid_from: null, valid_until: null };
    mocks.authorizeVendor.mockResolvedValue({
      ok: true,
      access: { outletIds: [ids.outlet], serviceDb: { from: mocks.from } },
    });
    mocks.from.mockImplementation((table: string) => table === "orders"
      ? query({ id: ids.order, status: "paid" })
      : table === "bookings"
      ? query({
            id: "55555555-5555-4555-8555-555555555555",
            status: "confirmed",
        order_items: { order_id: ids.order, vendor_id: ids.vendor, outlet_id: ids.outlet, quantity: 1, product_name: "Garden Entry", outlets: { id: ids.outlet, name: "North Outlet", vendor_id: ids.vendor, vendors: { id: ids.vendor, name: "Vendor A" } } },
        ticket_passes: [ticketPass],
      })
      : query([{
        id: "item-1",
        vendor_id: ids.vendor,
        outlet_id: ids.outlet,
        product_name: "Laksa",
        variant_name: "Regular",
        quantity: 2,
        food_fulfilment_mode: "dine_in",
        food_qr_scanned_at: null,
        fulfil_status: "pending",
        products: { categories: { slug: "food" } },
        outlets: { id: ids.outlet, name: "North Outlet", vendor_id: ids.vendor, vendors: { id: ids.vendor, name: "Vendor A" } },
      }, {
        id: "item-cancelled",
        vendor_id: ids.vendor,
        outlet_id: ids.outlet,
        product_name: "Cancelled side dish",
        variant_name: null,
        quantity: 1,
        food_fulfilment_mode: null,
        food_qr_scanned_at: null,
        fulfil_status: "cancelled",
        products: { categories: { slug: "food" } },
        outlets: { id: ids.outlet, name: "North Outlet", vendor_id: ids.vendor, vendors: { id: ids.vendor, name: "Vendor A" } },
      }]));
  });

  it("resolves only the paid food items at the signed outlet", async () => {
    const token = signFoodFulfilmentToken({ orderId: ids.order, outletId: ids.outlet, issuedAt: Date.now() });
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outletId: ids.outlet, rawValue: "http://localhost/customer/orders/" + ids.order + "?food_t=" + token }),
    }), { params: Promise.resolve({ vendorId: ids.vendor }) });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ kind: "food_order", orderId: ids.order, vendorName: "Vendor A", outletName: "North Outlet", mode: "dine_in", items: [{ name: "Laksa", quantity: 2 }] });
  });

  it("rejects a signed code scanned at a different outlet", async () => {
    const token = signFoodFulfilmentToken({ orderId: ids.order, outletId: ids.otherOutlet, issuedAt: Date.now() });
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outletId: ids.outlet, rawValue: "http://localhost/customer/orders/" + ids.order + "?food_t=" + token }),
    }), { params: Promise.resolve({ vendorId: ids.vendor }) });
    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects replay after a dine-in arrival scan", async () => {
    mocks.from.mockImplementation((table: string) => table === "orders"
      ? query({ id: ids.order, status: "paid" })
      : table === "bookings" ? query([]) : query([{
        id: "item-1", product_name: "Laksa", variant_name: null, quantity: 1,
        food_fulfilment_mode: "dine_in", food_qr_scanned_at: "2026-09-21T10:00:00Z", fulfil_status: "pending",
        products: { categories: { slug: "food" } },
      }]));
    const token = signFoodFulfilmentToken({ orderId: ids.order, outletId: ids.outlet, issuedAt: Date.now() });
    const response = await POST(new Request("http://localhost", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ outletId: ids.outlet, rawValue: "http://localhost/customer/orders/" + ids.order + "?food_t=" + token }),
    }), { params: Promise.resolve({ vendorId: ids.vendor }) });
    expect(response.status).toBe(409);
  });

  it("resolves a ticket only when the QR token matches the current paid pass", async () => {
    const bookingId = "55555555-5555-4555-8555-555555555555";
    const passId = "66666666-6666-4666-8666-666666666666";
    const passToken = signTicketPassToken({ passId, bookingId, outletId: ids.outlet, issuedAt: Date.now() });
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outletId: ids.outlet, rawValue: "http://localhost/customer/bookings/" + bookingId + "?t=" + passToken }),
    }), { params: Promise.resolve({ vendorId: ids.vendor }) });
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ kind: "ticket", vendorName: "Vendor A", outletName: "North Outlet", pass: { id: passId, entries_used: 0, entry_limit: 1 } });
  });

  it.each([
    { policy: "group_entry", entry_limit: 4, entries_used: 1, remaining: 3 },
    { policy: "multi_entry", entry_limit: 6, entries_used: 2, remaining: 4 },
  ])("scans a $policy ticket at its exact merchant outlet and returns current usage", async ({ policy, entry_limit, entries_used, remaining }) => {
    ticketPass = { ...ticketPass, policy, entry_limit, entries_used };
    const bookingId = "55555555-5555-4555-8555-555555555555";
    const passToken = signTicketPassToken({ passId: ticketPass.id, bookingId, outletId: ids.outlet, issuedAt: Date.now() });
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outletId: ids.outlet, rawValue: "http://localhost/customer/bookings/" + bookingId + "?t=" + passToken }),
    }), { params: Promise.resolve({ vendorId: ids.vendor }) });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({
      kind: "ticket",
      vendorName: "Vendor A",
      outletName: "North Outlet",
      pass: { policy, entry_limit, entries_used, remaining },
    });
  });

  it("does not offer a fully redeemed pass for another scan", async () => {
    ticketPass = { ...ticketPass, policy: "multi_entry", entry_limit: 3, entries_used: 3, status: "fully_redeemed" };
    const bookingId = "55555555-5555-4555-8555-555555555555";
    const passToken = signTicketPassToken({ passId: ticketPass.id, bookingId, outletId: ids.outlet, issuedAt: Date.now() });
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outletId: ids.outlet, rawValue: "http://localhost/customer/bookings/" + bookingId + "?t=" + passToken }),
    }), { params: Promise.resolve({ vendorId: ids.vendor }) });

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("TICKET_FULLY_REDEEMED");
  });

  it("rejects inconsistent merchant relations instead of showing another vendor's name", async () => {
    mocks.from.mockImplementation((table: string) => table === "orders"
      ? query({ id: ids.order, status: "paid" })
      : table === "bookings"
      ? query({
        id: "55555555-5555-4555-8555-555555555555",
        status: "confirmed",
        order_items: {
          order_id: ids.order,
          vendor_id: ids.vendor,
          outlet_id: ids.outlet,
          quantity: 1,
          product_name: "Garden Entry",
          outlets: { id: ids.outlet, name: "Wrong Outlet", vendor_id: "other-vendor", vendors: { id: "other-vendor", name: "Vendor B" } },
        },
        ticket_passes: [ticketPass],
      })
      : query([]));
    const bookingId = "55555555-5555-4555-8555-555555555555";
    const passToken = signTicketPassToken({ passId: ticketPass.id, bookingId, outletId: ids.outlet, issuedAt: Date.now() });
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outletId: ids.outlet, rawValue: "http://localhost/customer/bookings/" + bookingId + "?t=" + passToken }),
    }), { params: Promise.resolve({ vendorId: ids.vendor }) });

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("MERCHANT_IDENTITY_UNAVAILABLE");
  });

  it("rejects a ticket whose order is pending payment", async () => {
    mocks.from.mockImplementation((table: string) => table === "orders"
      ? query({ id: ids.order, status: "pending_payment" })
      : query({
        id: "55555555-5555-4555-8555-555555555555",
        status: "confirmed",
        order_items: { order_id: ids.order, vendor_id: ids.vendor, outlet_id: ids.outlet, quantity: 1, product_name: "Garden Entry" },
        ticket_passes: [{ id: "66666666-6666-4666-8666-666666666666", policy: "single_entry", entry_limit: 1, entries_used: 0, status: "active" }],
      }));
    const bookingId = "55555555-5555-4555-8555-555555555555";
    const passToken = signTicketPassToken({ passId: "66666666-6666-4666-8666-666666666666", bookingId, outletId: ids.outlet, issuedAt: Date.now() });
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outletId: ids.outlet, rawValue: "http://localhost/customer/bookings/" + bookingId + "?t=" + passToken }),
    }), { params: Promise.resolve({ vendorId: ids.vendor }) });
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("ORDER_NOT_PAID");
  });

  it("rejects a valid ticket when scanned at a different authorized outlet", async () => {
    mocks.authorizeVendor.mockResolvedValue({
      ok: true,
      access: { outletIds: [ids.outlet, ids.otherOutlet], serviceDb: { from: mocks.from } },
    });
    const bookingId = "55555555-5555-4555-8555-555555555555";
    const passToken = signTicketPassToken({ passId: ticketPass.id, bookingId, outletId: ids.outlet, issuedAt: Date.now() });
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ outletId: ids.otherOutlet, rawValue: "http://localhost/customer/bookings/" + bookingId + "?t=" + passToken }),
    }), { params: Promise.resolve({ vendorId: ids.vendor }) });

    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("FORBIDDEN");
  });
});
