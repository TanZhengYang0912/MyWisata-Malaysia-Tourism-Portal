import { describe, expect, it, vi } from "vitest";
import { POST } from "../route";
import { POST as resolveScan } from "../../../../scanner/resolve/route";
import { signTicketPassToken } from "@/lib/tickets/tokens";

vi.mock("@/lib/vendor-authorization", () => ({
  authorizeVendor: vi.fn(),
}));

vi.mock("@/lib/vendor-notifications/emit", () => ({
  emitVendorNotification: vi.fn().mockResolvedValue(undefined),
}));

import { authorizeVendor } from "@/lib/vendor-authorization";

describe("POST /api/vendors/[vendorId]/bookings/[bookingId]/checkin (Multi-Entry & Group Tickets)", () => {
  const vendorId = "11111111-1111-4111-8111-111111111111";
  const outletId = "22222222-2222-4222-8222-222222222222";
  const bookingId = "33333333-3333-4333-8333-333333333333";
  const passId = "44444444-4444-4444-8444-444444444444";

  function setupAuth({ policy = 'group_entry', entryLimit = 2, entriesUsed = 0, orderStatus = 'paid' }: { policy?: 'single_entry' | 'group_entry' | 'multi_entry'; entryLimit?: number; entriesUsed?: number; orderStatus?: string } = {}) {
    const state = { entriesUsed, rpc: vi.fn() };
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
                        status: state.entriesUsed >= entryLimit ? "checked_in" : state.entriesUsed > 0 ? "in_use" : "confirmed",
                        order_items: {
                          order_id: "55555555-5555-4555-8555-555555555555",
                          vendor_id: vendorId,
                          outlet_id: outletId,
                          quantity: 2,
                          product_name: "Garden Entry",
                          outlets: { id: outletId, name: "North Outlet", vendor_id: vendorId, vendors: { id: vendorId, name: "Vendor A" } },
                        },
                        ticket_passes: { id: passId, policy, entry_limit: entryLimit, entries_used: state.entriesUsed, status: state.entriesUsed >= entryLimit ? "fully_redeemed" : "active", valid_from: null, valid_until: null },
                      },
                      error: null,
                    }),
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: {
                        id: bookingId,
                        order_item_id: "oi-500",
                        customer_id: "cust-600",
                        status: state.entriesUsed >= entryLimit ? "checked_in" : state.entriesUsed > 0 ? "in_use" : "confirmed",
                        order_items: {
                          order_id: "55555555-5555-4555-8555-555555555555",
                          vendor_id: vendorId,
                          outlet_id: outletId,
                          quantity: 2,
                          product_name: "Garden Entry",
                          outlets: { id: outletId, name: "North Outlet", vendor_id: vendorId, vendors: { id: vendorId, name: "Vendor A" } },
                        },
                        ticket_passes: { id: passId, policy, entry_limit: entryLimit, entries_used: state.entriesUsed, status: state.entriesUsed >= entryLimit ? "fully_redeemed" : "active", valid_from: null, valid_until: null },
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
                        policy,
                        entry_limit: entryLimit,
                        entries_used: state.entriesUsed,
                        status: state.entriesUsed >= entryLimit ? "fully_redeemed" : "active",
                      },
                      error: null,
                    }),
                  }),
                }),
              };
            }
            if (table === "orders") {
              return {
                select: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: { status: orderStatus }, error: null }),
                  }),
                }),
              };
            }
            return {
              select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn() }) }),
            };
          }),
          rpc: state.rpc.mockImplementation((name: string, args: any) => {
            if (name === "admit_ticket_pass") {
              const remaining = entryLimit - state.entriesUsed;
              if (args.p_entries_to_admit > remaining) {
                return Promise.resolve({
                  data: {
                    success: false,
                    code: "EXCEEDS_ENTRY_LIMIT",
                    message: "Requested admission exceeds remaining entries",
                    entries_used: state.entriesUsed,
                    entry_limit: entryLimit,
                    remaining,
                  },
                  error: null,
                });
              }
              state.entriesUsed += args.p_entries_to_admit;
              const isFull = state.entriesUsed === entryLimit;
              return Promise.resolve({
                data: {
                  success: true,
                  pass_id: passId,
                  booking_id: bookingId,
                  policy,
                  entries_admitted: args.p_entries_to_admit,
                  entries_used: state.entriesUsed,
                  entry_limit: entryLimit,
                  remaining: entryLimit - state.entriesUsed,
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
    return state;
  }

  it("admits partial entries for a group ticket and keeps status in_use", async () => {
    const state = setupAuth({ entryLimit: 3 });

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
    expect(json.data.pass.entries_used).toBe(1);
    expect(json.data.pass.remaining).toBe(2);
    expect(state.entriesUsed).toBe(1);
  });

  it("admits remaining entries and marks booking checked_in", async () => {
    const state = setupAuth();

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
    expect(state.entriesUsed).toBe(2);
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

  it('admits one visit at a time for a multi-entry pass even when a client asks for more', async () => {
    const state = setupAuth({ policy: 'multi_entry', entryLimit: 4 });

    const req = new Request(`http://localhost:3000/api/vendors/${vendorId}/bookings/${bookingId}/checkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entriesAdmitted: 2 }),
    });

    const res = await POST(req, { params: Promise.resolve({ vendorId, bookingId }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('INVALID_ADMISSION_COUNT');
    expect(state.rpc).not.toHaveBeenCalled();
  });

  it("reduces multi-entry remaining count by exactly one on each successful scan", async () => {
    const state = setupAuth({ policy: "multi_entry", entryLimit: 3 });
    const scan = () => POST(new Request(`http://localhost:3000/api/vendors/${vendorId}/bookings/${bookingId}/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entriesAdmitted: 1 }),
    }), { params: Promise.resolve({ vendorId, bookingId }) });

    const first = await scan();
    expect(first.status).toBe(200);
    expect((await first.json()).data.pass).toMatchObject({ entries_used: 1, entry_limit: 3, remaining: 2, pass_status: "active" });
    const second = await scan();
    expect(second.status).toBe(200);
    expect((await second.json()).data.pass).toMatchObject({ entries_used: 2, entry_limit: 3, remaining: 1, pass_status: "active" });
    const third = await scan();
    expect(third.status).toBe(200);
    expect((await third.json()).data.pass).toMatchObject({ entries_used: 3, entry_limit: 3, remaining: 0, pass_status: "fully_redeemed" });

    const exhausted = await scan();
    expect(exhausted.status).toBe(400);
    expect((await exhausted.json()).error.code).toBe("INVALID_STATE");
    expect(state.rpc).toHaveBeenCalledTimes(3);
    expect(state.entriesUsed).toBe(3);
  });

  it("reduces group-ticket remaining guests by the selected number of admissions", async () => {
    const state = setupAuth({ policy: "group_entry", entryLimit: 4 });
    const scan = (entriesAdmitted: number) => POST(new Request(`http://localhost:3000/api/vendors/${vendorId}/bookings/${bookingId}/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entriesAdmitted }),
    }), { params: Promise.resolve({ vendorId, bookingId }) });

    const first = await scan(2);
    expect(first.status).toBe(200);
    expect((await first.json()).data.pass).toMatchObject({ entries_used: 2, entry_limit: 4, remaining: 2 });
    const second = await scan(2);
    expect(second.status).toBe(200);
    expect((await second.json()).data.pass).toMatchObject({ entries_used: 4, entry_limit: 4, remaining: 0, pass_status: "fully_redeemed" });
    expect(state.rpc).toHaveBeenCalledTimes(2);
    expect(state.entriesUsed).toBe(4);
  });

  it.each([
    { policy: "group_entry" as const, entryLimit: 4, perScan: 2, expectedUsed: [2, 4], expectedRemaining: [2, 0] },
    { policy: "multi_entry" as const, entryLimit: 3, perScan: 1, expectedUsed: [1, 2, 3], expectedRemaining: [2, 1, 0] },
  ])("resolves, scans, and updates each $policy pass only at Vendor A / North Outlet", async ({ policy, entryLimit, perScan, expectedUsed, expectedRemaining }) => {
    const state = setupAuth({ policy, entryLimit });
    const passToken = signTicketPassToken({ passId, bookingId, outletId, policy, entryLimit, issuedAt: Date.now() });
    const resolve = () => resolveScan(new Request("http://localhost/api/vendors/scanner/resolve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outletId, rawValue: `http://localhost/customer/bookings/${bookingId}?t=${passToken}` }),
    }), { params: Promise.resolve({ vendorId }) });
    const scan = (entriesAdmitted: number) => POST(new Request(`http://localhost/api/vendors/${vendorId}/bookings/${bookingId}/checkin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passToken, entriesAdmitted }),
    }), { params: Promise.resolve({ vendorId, bookingId }) });

    for (let index = 0; index < expectedUsed.length; index += 1) {
      const resolved = await resolve();
      const resolvedBody = await resolved.json();
      expect(resolved.status, JSON.stringify(resolvedBody)).toBe(200);
      const resolvedData = resolvedBody.data;
      expect(resolvedData).toMatchObject({ vendorName: "Vendor A", outletName: "North Outlet", outletId, pass: { policy, entries_used: expectedUsed[index]! - perScan, remaining: expectedRemaining[index]! + perScan } });

      const admitted = await scan(perScan);
      expect(admitted.status).toBe(200);
      expect((await admitted.json()).data.pass).toMatchObject({ entries_used: expectedUsed[index], entry_limit: entryLimit, remaining: expectedRemaining[index] });
      expect(state.rpc).toHaveBeenNthCalledWith(index + 1, "admit_ticket_pass", expect.objectContaining({ p_vendor_id: vendorId, p_outlet_id: outletId, p_entries_to_admit: perScan }));
    }

    const exhausted = await resolve();
    expect(exhausted.status).toBe(409);
    expect((await exhausted.json()).error.code).toBe("TICKET_FULLY_REDEEMED");
    expect(state.entriesUsed).toBe(entryLimit);
    expect(state.rpc).toHaveBeenCalledTimes(expectedUsed.length);
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

  it("does not admit an unpaid order", async () => {
    setupAuth({ orderStatus: "pending_payment" });
    const res = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({}) }), { params: Promise.resolve({ vendorId, bookingId }) });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("ORDER_NOT_PAID");
  });

  it("rejects a signed token for another pass", async () => {
    setupAuth();
    const passToken = signTicketPassToken({ passId: "pass-from-another-ticket", bookingId, outletId, issuedAt: Date.now() });
    const res = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ passToken }) }), { params: Promise.resolve({ vendorId, bookingId }) });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("TOKEN_MISMATCH");
  });
});
