import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireStaffGovernance: vi.fn(),
  createServiceClient: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/staff-permissions/server", () => ({
  requireStaffRoleManagementSuperAdmin: mocks.requireStaffGovernance,
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: mocks.createServiceClient,
}));

import { GET } from "@/app/api/admin/access-control/staff-candidates/route";

function queryBuilder(data: unknown[] = [], error: unknown = null) {
  const result = { data, error };
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "in", "is", "eq", "order"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

describe("staff role candidates API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStaffGovernance.mockResolvedValue({
      db: {},
      user: { id: "11111111-1111-4111-8111-111111111111" },
      response: null,
    });
    mocks.createServiceClient.mockReturnValue({ from: mocks.from });
    mocks.from.mockImplementation((table: string) => {
      if (table === "roles") {
        return queryBuilder([
          { id: 0, name: "staff" },
          { id: 1, name: "admin" },
          { id: 2, name: "approver" },
          { id: 3, name: "super_admin" },
        ]);
      }
      if (table === "user_roles") {
        return queryBuilder([
          { user_id: "22222222-2222-4222-8222-222222222222", role_id: 1 },
          { user_id: "22222222-2222-4222-8222-222222222222", role_id: 2 },
          { user_id: "33333333-3333-4333-8333-333333333333", role_id: 3 },
        ]);
      }
      if (table === "users") {
        return queryBuilder([
          { id: "22222222-2222-4222-8222-222222222222", email: "ali@example.com", full_name: "Ali Staff", display_name: null, status: "active", phone: "private" },
          { id: "33333333-3333-4333-8333-333333333333", email: "boss@example.com", full_name: null, display_name: "Boss", status: "active", phone: "private" },
        ]);
      }
      return queryBuilder();
    });
  });

  it("checks governance before creating the service client", async () => {
    mocks.requireStaffGovernance.mockResolvedValue({
      db: {},
      user: null,
      response: Response.json({ data: null, error: { code: "FORBIDDEN" } }, { status: 403 }),
    });

    const response = await GET(new Request("http://localhost/api/admin/access-control/staff-candidates"));

    expect(response.status).toBe(403);
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it("returns only minimal active global staff identities matching name or email", async () => {
    const response = await GET(new Request("http://localhost/api/admin/access-control/staff-candidates?search=ALI"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      data: {
        candidates: [{
          id: "22222222-2222-4222-8222-222222222222",
          email: "ali@example.com",
          name: "Ali Staff",
          roles: ["admin", "approver"],
        }],
      },
      error: null,
    });
    expect(JSON.stringify(body)).not.toContain("private");
  });

  it("fails closed when eligible staff data cannot be loaded", async () => {
    mocks.from.mockImplementation((table: string) => table === "roles"
      ? queryBuilder([], { message: "database unavailable" })
      : queryBuilder());

    const response = await GET(new Request("http://localhost/api/admin/access-control/staff-candidates?search=ali"));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      data: null,
      error: { code: "STAFF_CANDIDATES_UNAVAILABLE" },
    });
  });
});
