import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  guard: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/staff-permissions/server", () => ({
  requireStaffRoleManagementSuperAdmin: mocks.guard,
}));
vi.mock("@/app/api/admin/access-control/_shared", () => ({
  mutationReceipt: async (_db: unknown, _actorId: string, _action: string, entityId: string, data: Record<string, unknown>, status = 200) =>
    Response.json({ data: { ...data, moduleId: entityId, auditEventId: "audit-id", generation: 1 }, error: null }, { status }),
}));

import * as modulesRoute from "../route";
import * as moduleRoute from "../[moduleId]/route";

const actor = { id: "11111111-1111-4111-8111-111111111111" };
const moduleId = "22222222-2222-4222-8222-222222222222";

function query(data: unknown) {
  const result = Promise.resolve({ data, error: null });
  const chain = {
    select: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    then: result.then.bind(result),
  };
  return chain;
}

function request(method: string, body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/access-control/staff-modules", {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  key: "support_triage",
  label: "Support triage",
  description: "Triage customer tickets",
  sectionKey: "support",
  sectionLabel: "Support",
  sectionSortOrder: 40,
  href: "/admin/support",
  iconKey: "inbox",
  sortOrder: 15,
  permissionKeys: ["support.ticket.manage"],
  groupKey: null,
  reason: "Create a support triage Module",
};

describe("Staff Module governance routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guard.mockResolvedValue({
      db: { from: mocks.from, rpc: mocks.rpc },
      user: actor,
      response: null,
    });
    mocks.rpc.mockResolvedValue({ data: moduleId, error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === "staff_modules") return query([{
        id: moduleId, key: "catalogue_review", label: "Catalogue Review", label_key: "navigation.Catalogue Review",
        description: "Review listings", section_key: "governance", section_label: "Governance",
        section_label_key: "navigationSections.governance", section_sort_order: 20, href: "/admin/catalogue",
        icon_key: "clipboard-check", sort_order: 20, is_active: true, is_system: true,
      }]);
      if (table === "staff_permissions") return query([{ id: "permission-id", key: "admin.catalogue.review", module: "catalogue", action: "review", description: "Review listings", is_system: true }]);
      if (table === "staff_module_permissions") return query([{ module_id: moduleId, staff_permissions: { key: "admin.catalogue.review" } }]);
      if (table === "staff_module_groups") return query([{ id: "group-id", key: "catalogue_governance", name: "Catalogue governance", description: null, is_system: true, is_active: true }]);
      if (table === "staff_module_group_members") return query([{ group_id: "group-id", module_id: moduleId }]);
      throw new Error(`unexpected table ${table}`);
    });
  });

  it("fails closed before reading Module tables", async () => {
    mocks.guard.mockResolvedValue({ db: {}, user: null, response: new Response(null, { status: 403 }) });
    expect((await modulesRoute.GET()).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns Modules, dynamic permissions and atomic groups", async () => {
    const response = await modulesRoute.GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: {
      modules: [{ key: "catalogue_review", permissionKeys: ["admin.catalogue.review"], groupKey: "catalogue_governance" }],
      permissions: [{ key: "admin.catalogue.review" }],
      groups: [{ key: "catalogue_governance", moduleKeys: ["catalogue_review"] }],
    } });
  });

  it("creates a Module using a future database permission key", async () => {
    const response = await modulesRoute.POST(request("POST", validBody));
    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith("create_staff_module", expect.objectContaining({
      p_key: "support_triage",
      p_permission_keys: ["support.ticket.manage"],
      p_href: "/admin/support",
    }));
  });

  it("rejects unsafe external routes before calling the database", async () => {
    const response = await modulesRoute.POST(request("POST", { ...validBody, href: "https://example.com/admin" }));
    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("updates Module metadata through the governed RPC", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    const updateBody: Partial<typeof validBody> = { ...validBody };
    delete updateBody.key;
    const response = await moduleRoute.PATCH(request("PATCH", { ...updateBody, active: false }), {
      params: Promise.resolve({ moduleId }),
    });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("update_staff_module", expect.objectContaining({
      p_module_id: moduleId,
      p_active: false,
      p_permission_keys: ["support.ticket.manage"],
    }));
  });
});
