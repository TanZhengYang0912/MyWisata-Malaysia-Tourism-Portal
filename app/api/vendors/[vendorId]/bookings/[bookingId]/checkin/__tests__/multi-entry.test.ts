import { describe, expect, it, vi } from "vitest";
import { POST } from "../route";
import { signTicketPassToken } from "@/lib/tickets/tokens";

vi.mock("@/lib/vendor-authorization", () => ({
  authorizeVendor: vi.fn(),
}));

vi.mock("@/lib/vendor-notifications/emit", () => ({
  emitVendorNotification: vi.fn().mockResolvedValue(undefined),
}));

import { authorizeVendor } from "@/lib/vendor-authorization";

describe("POST /api/vendors/[vendorId]/bookings/[bookingId]/checkin (Multi-Entry & Group Tickets)", () => {
  const vendorId = "v-100";
  const outletId = "out-200";
  const bookingId = "bk-300";
  const passId = "pass-400";

  function setupAuth() {
    vi.mocked(authorizeVendor).mockResolvedValue({
      ok: true,
      access: {
        userId: "user-operator-1",
        vendorId,
        role: "vendor_owner",
        outletIds: [outletId],
        isOwner: true,
        isOutletManager: false,
        authDb: {} as any,
        serviceDb: {
          from: vi.fn().mockImplementation((table: string) => {
            if (table === "bookings") {
              return {
                select: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: bookingId,
                        order_item_id: "oi-500",
                        customer_id: "cust-600",
                        status: "confirmed",
                        order_items: {
                          vendor_id: vendorId,
                          outlet_id: outletId,
                          quantity: 2,
                        },
                      },
                      error: null,
                    }),
                  }),
                }),
              };
            }
            if (table === "ticket_passes") {
              return {
                select: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        id: passId,
                        booking_id: bookingId,
                        policy: "group_entry",
                        entry_limit: 2,
                        entries_used: 0,
                        status: "active",
                      },
                      error: null,
                    }),
                  }),
                }),
              };
            }
            return {
              select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn() }) }),
            };
          }),
          rpc: vi.fn().mockImplementation((name: string, args: any) => {
            if (name === "admit_ticket_pass") {
              if (args.p_entries_to_admit > 2) {
                return Promise.resolve({
                  data: {
                    success: false,
                    code: "EXCEEDS_ENTRY_LIMIT",
                    message: "Requested admission exceeds remaining entries",
                    remaining: 2,
                  },
                  error: null,
                });
              }
              const isFull = args.p_entries_to_admit === 2;
              return Promise.resolve({
                data: {
                  success: true,
                  pass_id: passId,
                  booking_id: bookingId,
                  policy: "group_entry",
                  entries_admitted: args.p_entries_to_admit,
                  entries_used: args.p_entries_to_admit,
                  entry_limit: 2,
                  remaining: 2 - args.p_entries_to_admit,
                  pass_status: isFull ? "fully_redeemed" : "active",
                },
                error: null,
              });
            }
            return Promise.resolve({ data: null, error: null });
          }),
        } as any,
      },
    });
  }

  it("admits partial entries for a group ticket and keeps status in_use", async () => {
    setupAuth();

    const req = new Request(`http://localhost:3000/api/vendors/${vendorId}/bookings/${bookingId}/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entriesAdmitted: 1 }),
    });

    const res = await POST(req, { params: Promise.resolve({ vendorId, bookingId }) });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.data.status).toBe("in_use");
    expect(json.data.pass.entries_admitted).toBe(1);
    expect(json.data.pass.remaining).toBe(1);
  });

  it("admits remaining entries and marks booking checked_in", async () => {
    setupAuth();

    const req = new Request(`http://localhost:3000/api/vendors/${vendorId}/bookings/${bookingId}/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entriesAdmitted: 2 }),
    });

    const res = await POST(req, { params: Promise.resolve({ vendorId, bookingId }) });
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json.data.status).toBe("checked_in");
    expect(json.data.pass.pass_status).toBe("fully_redeemed");
    expect(json.data.pass.remaining).toBe(0);
  });

  it("rejects check-in if admission request exceeds remaining entries", async () => {
    setupAuth();

    const req = new Request(`http://localhost:3000/api/vendors/${vendorId}/bookings/${bookingId}/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entriesAdmitted: 5 }),
    });

    const res = await POST(req, { params: Promise.resolve({ vendorId, bookingId }) });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error.code).toBe("EXCEEDS_ENTRY_LIMIT");
  });

  it("validates signed ticket tokens and rejects invalid tokens with 401", async () => {
    setupAuth();

    const req = new Request(`http://localhost:3000/api/vendors/${vendorId}/bookings/${bookingId}/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passToken: "malformed_tampered_token.invalid" }),
    });

    const res = await POST(req, { params: Promise.resolve({ vendorId, bookingId }) });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error.code).toBe("INVALID_TOKEN");
  });

  it("accepts valid signed ticket token matching bookingId", async () => {
    setupAuth();

    const validToken = signTicketPassToken({
      passId,
      bookingId,
      outletId,
      policy: "group_entry",
      entryLimit: 2,
      issuedAt: Date.now(),
    });

    const req = new Request(`http://localhost:3000/api/vendors/${vendorId}/bookings/${bookingId}/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passToken: validToken, entriesAdmitted: 2 }),
    });

    const res = await POST(req, { params: Promise.resolve({ vendorId, bookingId }) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("checked_in");
  });
});
