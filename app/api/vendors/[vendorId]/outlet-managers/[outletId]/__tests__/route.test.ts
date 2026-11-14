import { beforeEach, describe, expect, it, vi } from "vitest";

type Assignment = { outlet_id: string; user_id: string };

const state = vi.hoisted(() => ({
  ownerOutletIds: ["o1", "o2"] as string[],
  assignments: [] as Assignment[],
  roleDeletes: [] as Array<Record<string, string>>,
  emitted: 0,
}));

vi.mock("@/lib/vendor-notifications/emit", () => ({
  emitVendorNotification: vi.fn(async () => { state.emitted += 1; }),
}));

vi.mock("@/lib/vendor-authorization", () => ({
  authorizeVendor: vi.fn(async () => ({
    ok: true,
    access: {
      userId: "owner-1",
      vendorId: "v1",
      isOwner: true,
      outletIds: state.ownerOutletIds,
      serviceDb: {
        from(table: string) {
          const filters: Record<string, string> = {};
          let mode: "select" | "delete" = "select";
          const chain = {
            select: () => chain,
            delete: () => { mode = "delete"; return chain; },
            eq: (column: string, value: string) => { filters[column] = value; return chain; },
            maybeSingle: async () => (table === "roles" ? { data: { id: "role-om" }, error: null } : { data: null, error: null }),
            then(resolve: (value: { data: unknown; error: null }) => unknown) {
              if (table === "outlet_managers" && mode === "select") {
                return resolve({ data: state.assignments.filter((row) => row.outlet_id === filters.outlet_id), error: null });
              }
              if (table === "outlet_managers" && mode === "delete") {
                state.assignments = state.assignments.filter((row) => !(row.outlet_id === filters.outlet_id && row.user_id === filters.user_id));
                return resolve({ data: null, error: null });
              }
              if (table === "user_roles" && mode === "delete") state.roleDeletes.push({ ...filters });
              return resolve({ data: null, error: null });
            },
          };
          return chain;
        },
      },
    },
  })),
}));

const route = await import("../route");
const remove = (outletId: string, userId?: string) => route.DELETE(
  new Request(`http://localhost/api/vendors/v1/outlet-managers/${outletId}${userId ? `?userId=${userId}` : ""}`, { method: "DELETE" }),
  { params: Promise.resolve({ vendorId: "v1", outletId }) },
);

describe("remove outlet manager", () => {
  beforeEach(() => {
    state.ownerOutletIds = ["o1", "o2"];
    state.assignments = [];
    state.roleDeletes = [];
    state.emitted = 0;
  });

  it("refuses an outlet that does not belong to the caller's vendor", async () => {
    state.assignments = [{ outlet_id: "foreign", user_id: "m9" }];
    const response = await remove("foreign");
    expect(response.status).toBe(404);
    expect(state.assignments).toHaveLength(1);
    expect(state.emitted).toBe(0);
  });

  it("removes only the target outlet assignment and keeps the manager's other outlets", async () => {
    state.assignments = [{ outlet_id: "o1", user_id: "m1" }, { outlet_id: "o2", user_id: "m1" }];
    const response = await remove("o1");
    expect(response.status).toBe(200);
    expect(state.assignments).toEqual([{ outlet_id: "o2", user_id: "m1" }]);
    expect(state.roleDeletes).toEqual([{ user_id: "m1", role_id: "role-om", outlet_id: "o1" }]);
  });

  it("requires a userId when the outlet has more than one manager", async () => {
    state.assignments = [{ outlet_id: "o1", user_id: "m1" }, { outlet_id: "o1", user_id: "m2" }];
    expect((await remove("o1")).status).toBe(409);
    expect(state.assignments).toHaveLength(2);
    const response = await remove("o1", "m2");
    expect(response.status).toBe(200);
    expect(state.assignments).toEqual([{ outlet_id: "o1", user_id: "m1" }]);
  });

  it("returns 404 when the requested manager is not assigned", async () => {
    state.assignments = [{ outlet_id: "o1", user_id: "m1" }];
    expect((await remove("o1", "m7")).status).toBe(404);
    expect(state.assignments).toHaveLength(1);
  });
});
