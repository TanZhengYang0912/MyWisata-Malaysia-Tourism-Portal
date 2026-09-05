import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { requireStaffPermission } from "@/lib/staff-permissions/server";

describe("requireStaffPermission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      rpc: mocks.rpc,
    });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "staff-1" } }, error: null });
    mocks.rpc.mockResolvedValue({ data: true, error: null });
  });

  it("returns 401 before querying permissions when authentication fails", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: { message: "expired" } });

    const result = await requireStaffPermission("admin.kyc.review");

    expect(result.response?.status).toBe(401);
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

  it("accepts the Super Admin grant returned by the governed RPC", async () => {
    const result = await requireStaffPermission("admin.kyc.review");

    expect(result.response).toBeNull();
    expect(mocks.rpc).toHaveBeenCalledOnce();
  });

  it("rejects unknown permission keys at compile time", () => {
    if (false) {
      // @ts-expect-error permission keys are a closed compile-time vocabulary
      void requireStaffPermission("admin.staff.impersonate");
    }
  });
});
