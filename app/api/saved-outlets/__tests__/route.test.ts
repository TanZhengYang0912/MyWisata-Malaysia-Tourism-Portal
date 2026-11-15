import { beforeEach, describe, expect, it, vi } from "vitest";

const OUTLET = "5016d273-eb84-d20d-81ab-f9022bf401fa";
const USER = "11111111-1111-4111-8111-111111111111";

const state = vi.hoisted(() => ({
  user: null as { id: string } | null,
  getClaims: null as unknown as ReturnType<typeof vi.fn>,
  isHotel: true,
  calls: [] as Array<{ op: string; table: string; payload?: unknown; options?: unknown; filters: Array<[string, unknown]> }>,
}));

vi.mock("@/lib/customer/hotel-outlet", () => ({ isHotelOutlet: vi.fn(async () => state.isHotel) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }), getClaims: state.getClaims },
    from: (table: string) => {
      const call = { op: "select", table, filters: [] as Array<[string, unknown]>, payload: undefined as unknown, options: undefined as unknown };
      state.calls.push(call);
      const chain = {
        select: () => chain,
        upsert: (payload: unknown, options: unknown) => { call.op = "upsert"; call.payload = payload; call.options = options; return chain; },
        delete: () => { call.op = "delete"; return chain; },
        eq: (column: string, value: unknown) => { call.filters.push([column, value]); return chain; },
        order: () => chain,
        maybeSingle: async () => ({ data: { outlet_id: OUTLET, created_at: "2026-10-18T00:00:00Z" }, error: null }),
        then: (resolve: (value: unknown) => void) => resolve({ data: [{ outlet_id: OUTLET, created_at: "2026-10-18T00:00:00Z" }], error: null }),
      };
      return chain;
    },
  }),
}));

const route = await import("../route");
const request = (method: string, body?: unknown) => new Request("http://localhost/api/saved-outlets", {
  method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body),
});

describe("saved hotels API", () => {
  beforeEach(() => {
    state.user = { id: USER }; state.isHotel = true; state.calls = [];
    state.getClaims = vi.fn(async () => ({ data: { claims: state.user ? { sub: state.user.id } : null }, error: null }));
  });

  it("lists the caller's saved hotels from locally verified token claims", async () => {
    const response = await route.GET();

    expect(response.status).toBe(200);
    expect(state.getClaims).toHaveBeenCalled();
    expect(state.calls[0].filters).toContainEqual(["user_id", USER]);
  });

  it("requires sign-in", async () => {
    state.user = null;
    expect((await route.GET()).status).toBe(401);
    expect((await route.POST(request("POST", { outletId: OUTLET }))).status).toBe(401);
  });

  it("saves a hotel for the caller, ignoring duplicates", async () => {
    const response = await route.POST(request("POST", { outletId: OUTLET }));
    expect(response.status).toBe(201);
    const upsert = state.calls.find((call) => call.op === "upsert")!;
    expect(upsert.table).toBe("customer_saved_outlets");
    expect(upsert.payload).toEqual({ user_id: USER, outlet_id: OUTLET });
    expect(upsert.options).toEqual({ onConflict: "user_id,outlet_id", ignoreDuplicates: true });
  });

  it("refuses to save an outlet that is not a hotel", async () => {
    state.isHotel = false;
    expect((await route.POST(request("POST", { outletId: OUTLET }))).status).toBe(422);
    expect(state.calls.some((call) => call.op === "upsert")).toBe(false);
  });

  it("removes only the caller's saved row", async () => {
    expect((await route.DELETE(request("DELETE", { outletId: OUTLET }))).status).toBe(200);
    const del = state.calls.find((call) => call.op === "delete")!;
    expect(del.filters).toEqual([["user_id", USER], ["outlet_id", OUTLET]]);
  });

  it("lists the caller's saved hotel ids", async () => {
    const body = await (await route.GET()).json();
    expect(body.data.outletIds).toEqual([OUTLET]);
  });
});
