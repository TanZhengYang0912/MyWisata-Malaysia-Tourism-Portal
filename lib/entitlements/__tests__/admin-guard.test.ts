import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  assurance: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/auth/staff-assurance", () => ({ requireStaffAssurance: mocks.assurance }));

import { requireAccessControlSuperAdmin } from "@/lib/entitlements/admin-guard";

function query(data: unknown, error: unknown = null) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () => ({ data, error }));
  return builder;
}

describe("requireAccessControlSuperAdmin", () => {
  const user = { id: "admin-1" };
  const profileQuery = query({ id: user.id, status: "active" });
  const roleQuery = query({ role_id: "role-1", vendor_id: null, outlet_id: null });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      rpc: mocks.rpc,
      from: mocks.from,
    });
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });
    mocks.assurance.mockResolvedValue(null);
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.from.mockImplementation((table: string) => table === "users" ? profileQuery : roleQuery);
  });

  it("allows only an active actor with an unscoped global Super Admin role", async () => {
    await expect(requireAccessControlSuperAdmin()).resolves.toEqual({
      db: expect.any(Object),
      user,
      response: null,
    });
    expect(mocks.from).toHaveBeenCalledWith("users");
    expect(mocks.from).toHaveBeenCalledWith("user_roles");
    expect(roleQuery.eq).toHaveBeenCalledWith("roles.name", "super_admin");
    expect(roleQuery.is).toHaveBeenCalledWith("vendor_id", null);
    expect(roleQuery.is).toHaveBeenCalledWith("outlet_id", null);
  });

  it("denies a suspended actor even if the role RPC says super admin", async () => {
    mocks.from.mockImplementation((table: string) => table === "users"
      ? query({ id: user.id, status: "suspended" })
      : roleQuery);

    const result = await requireAccessControlSuperAdmin();

    expect(result.response?.status).toBe(403);
    expect(roleQuery.maybeSingle).not.toHaveBeenCalled();
  });

  it("denies a scoped Super Admin role", async () => {
    mocks.from.mockImplementation((table: string) => table === "users"
      ? profileQuery
      : query(null));

    const result = await requireAccessControlSuperAdmin();

    expect(result.response?.status).toBe(403);
  });

  it("fails closed when account status or global role cannot be verified", async () => {
    mocks.from.mockImplementation((table: string) => table === "users"
      ? query(null, { message: "database unavailable" })
      : roleQuery);
    await expect(requireAccessControlSuperAdmin()).resolves.toMatchObject({
      response: { status: 503 },
    });

    mocks.from.mockImplementation((table: string) => table === "users"
      ? profileQuery
      : query(null, { message: "database unavailable" }));
    await expect(requireAccessControlSuperAdmin()).resolves.toMatchObject({
      response: { status: 503 },
    });
  });
});
