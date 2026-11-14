import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ outletIds: ["o1"] as string[], updates: [] as Array<Record<string, unknown>>, row: { id: "o1", status: "closed" } as null | { id: string; status: string } }));

vi.mock("@/lib/vendor-authorization", () => ({
  authorizeOutlet: vi.fn(),
  authorizeVendor: vi.fn(async () => ({
    ok: true,
    access: {
      userId: "owner-1", vendorId: "v1", isOwner: true, outletIds: state.outletIds,
      serviceDb: {
        from: () => {
          const chain = {
            update: (payload: Record<string, unknown>) => { state.updates.push(payload); return chain; },
            eq: () => chain, select: () => chain,
            maybeSingle: async () => ({ data: state.row, error: null }),
          };
          return chain;
        },
      },
    },
  })),
}));

const route = await import("../route");
const close = (outletId: string) => route.DELETE(new Request("http://localhost/x", { method: "DELETE" }), { params: Promise.resolve({ vendorId: "v1", outletId }) });

describe("close outlet", () => {
  beforeEach(() => { state.outletIds = ["o1"]; state.updates = []; state.row = { id: "o1", status: "closed" }; });

  it("only changes the status of an outlet in the owner's vendor", async () => {
    const response = await close("o1");
    expect(response.status).toBe(200);
    expect(state.updates).toEqual([{ status: "closed" }]);
    expect((await response.json()).data).toEqual({ id: "o1", status: "closed" });
  });

  it("rejects an outlet outside the vendor without writing", async () => {
    expect((await close("foreign")).status).toBe(404);
    expect(state.updates).toHaveLength(0);
  });

  it("does not report success when no row was updated", async () => {
    state.row = null;
    expect((await close("o1")).status).toBe(404);
  });
});
