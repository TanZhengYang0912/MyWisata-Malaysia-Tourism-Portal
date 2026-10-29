import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  requireSuperAdmin: vi.fn(),
  assurance: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/staff-assurance", () => ({ requireStaffAssurance: mocks.assurance }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/entitlements/admin-guard", () => ({
  requireAccessControlSuperAdmin: mocks.requireSuperAdmin,
}));

import {
  requireStaffPermission,
  requireStaffRoleManagementSuperAdmin,
} from "@/lib/staff-permissions/server";

describe("requireStaffPermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      rpc: mocks.rpc,
      from: mocks.from,
    });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "staff-1" } }, error: null });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    mocks.assurance.mockResolvedValue(null);
  });

  it("returns 401 before querying permissions when authentication fails", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });

    const result = await requireStaffPermission("admin.kyc.review");

    expect(result.response?.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("requires staff assurance before querying permissions", async () => {
    const denied = Response.json({ data: null, error: { code: "STAFF_PASSKEY_REQUIRED" } }, { status: 403 });
    mocks.assurance.mockResolvedValue(denied);

    const result = await requireStaffPermission("admin.kyc.review");

    expect(result.response).toBe(denied);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("returns 503 when permission resolution is unavailable", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });

    const result = await requireStaffPermission("admin.vendor.manage");

    expect(result.response?.status).toBe(503);
  });

  it("returns 403 when the authenticated staff member lacks permission", async () => {
    mocks.rpc.mockResolvedValue({ data: false, error: null });

    const result = await requireStaffPermission("admin.withdrawal.approve");

    expect(result.response?.status).toBe(403);
  });

  it("passes only the authenticated user ID and typed key to the RPC", async () => {
    const result = await requireStaffPermission("admin.map_campaign.manage");

    expect(result.response).toBeNull();
    expect(result.user).toEqual({ id: "staff-1" });
    expect(mocks.rpc).toHaveBeenCalledWith("has_staff_permission", {
      p_user_id: "staff-1",
      p_permission_key: "admin.map_campaign.manage",
    });
  });

  it("resolves campaign governance through its dedicated permission key", async () => {
    const result = await requireStaffPermission("admin.promotion_campaign.manage");

    expect(result.response).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith("has_staff_permission", {
      p_user_id: "staff-1",
      p_permission_key: "admin.promotion_campaign.manage",
    });
  });

  it("accepts the Super Admin grant returned by the governed RPC", async () => {
    const result = await requireStaffPermission("admin.kyc.review");

    expect(result.response).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it("accepts a dynamically stored permission key", async () => {
    const result = await requireStaffPermission("admin.staff.impersonate");

    expect(result.response).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledWith("has_staff_permission", {
      p_user_id: "staff-1",
      p_permission_key: "admin.staff.impersonate",
    });
  });
});

describe("requireStaffRoleManagementSuperAdmin", () => {
  const authenticatedDb = { from: mocks.from };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSuperAdmin.mockResolvedValue({
      db: authenticatedDb,
      user: { id: "staff-1" },
      response: null,
    });
  });

  it("reuses the strict Access Control guard without repeating database checks", async () => {
    const denied = Response.json({ data: null, error: { code: "UNAUTHORIZED" } }, { status: 401 });
    mocks.requireSuperAdmin.mockResolvedValue({ db: authenticatedDb, user: null, response: denied });

    const result = await requireStaffRoleManagementSuperAdmin();

    expect(result.response).toBe(denied);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns the strict guard's authenticated result", async () => {
    const result = await requireStaffRoleManagementSuperAdmin();

    expect(result).toEqual({ db: authenticatedDb, user: { id: "staff-1" }, response: null });
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
