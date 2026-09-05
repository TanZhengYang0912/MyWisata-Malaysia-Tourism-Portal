import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  requireStaffPermission: vi.fn(),
  auditAndNotify: vi.fn(),
  emitVendorNotification: vi.fn(),
  createServiceClient: vi.fn(),
}));

function db() {
  return { rpc: mocks.rpc, from: mocks.from };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null }) },
    ...db(),
  })),
}));
vi.mock("@/lib/staff-permissions/server", () => ({ requireStaffPermission: mocks.requireStaffPermission }));
vi.mock("@/lib/audit", () => ({ auditAndNotify: mocks.auditAndNotify }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock("@/lib/vendor-notifications/emit", () => ({ emitVendorNotification: mocks.emitVendorNotification }));

import { POST } from "../route";

const VENDOR_ID = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ id: VENDOR_ID }) };

function request(body: string = JSON.stringify({ action: "suspend", reason: "Repeated policy violations" })) {
  return new Request(`http://localhost/api/admin/vendors/${VENDOR_ID}/suspend`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("POST /api/admin/vendors/:id/suspend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireStaffPermission.mockResolvedValue({ db: db(), user: { id: "admin-1" }, response: null });
    mocks.from.mockImplementation((table: string) => {
      if (table !== "vendors") throw new Error(`Unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            single: vi.fn().mockResolvedValue({
              data: { id: VENDOR_ID, owner_id: "owner-1", name: "Rasa Malaysia Kitchen", status: "approved" },
              error: null,
            }),
          }),
        }),
      };
    });
    mocks.rpc.mockResolvedValue({
      data: { vendor_id: VENDOR_ID, previous_status: "approved", status: "suspended" },
      error: null,
    });
    mocks.auditAndNotify.mockResolvedValue(undefined);
    mocks.emitVendorNotification.mockResolvedValue(undefined);
    mocks.createServiceClient.mockReturnValue({});
  });

  it("requires admin.vendor.manage before parsing or mutating", async () => {
    mocks.requireStaffPermission.mockResolvedValue({
      db: db(),
      user: { id: "admin-1" },
      response: Response.json({ data: null, error: { code: "FORBIDDEN" } }, { status: 403 }),
    });

    const response = await POST(request("{invalid-json"), context);

    expect(response.status).toBe(403);
    expect(mocks.requireStaffPermission).toHaveBeenCalledWith("admin.vendor.manage");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.createServiceClient).not.toHaveBeenCalled();
  });

  it("uses the permission-enforcing RPC for an allowed suspension", async () => {
    const response = await POST(request(), context);

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("staff_set_vendor_suspension", {
      p_vendor_id: VENDOR_ID,
      p_action: "suspend",
      p_reason: "Repeated policy violations",
    });
    expect(await response.json()).toMatchObject({ data: { id: VENDOR_ID, status: "suspended" } });
  });
});
