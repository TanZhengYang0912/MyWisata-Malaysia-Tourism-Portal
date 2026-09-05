import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSuperAdmin: vi.fn(),
  requireStaffGovernance: vi.fn(),
  listState: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/entitlements/admin-guard", () => ({
  requireAccessControlSuperAdmin: mocks.requireSuperAdmin,
}));
vi.mock("@/lib/staff-permissions/server", () => ({
  requireStaffRoleManagementSuperAdmin: mocks.requireStaffGovernance,
}));
vi.mock("@/lib/entitlements/admin", () => ({
  listAccessControlState: mocks.listState,
}));

import * as permissionsRoute from "@/app/api/admin/access-control/staff-permissions/route";
import * as rolesRoute from "@/app/api/admin/access-control/staff-roles/route";
import * as roleRoute from "@/app/api/admin/access-control/staff-roles/[roleId]/route";
import * as assignmentsRoute from "@/app/api/admin/access-control/staff-roles/[roleId]/assignments/route";

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const ROLE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const ASSIGNMENT_ID = "44444444-4444-4444-8444-444444444444";
const AUDIT_ID = "55555555-5555-4555-8555-555555555555";

function queryBuilder(data: unknown[] = []) {
  const result = { data, error: null };
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.maybeSingle = vi.fn(async () => ({ data: data[0] ?? null, error: null }));
  builder.then = (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

function createDb() {
  return {
    rpc: mocks.rpc,
    from: mocks.from,
  };
}

function allowSuperAdmin() {
  const allowed = {
    db: createDb(),
    user: { id: ACTOR_ID },
    response: null,
  };
  mocks.requireSuperAdmin.mockResolvedValue(allowed);
  mocks.requireStaffGovernance.mockResolvedValue(allowed);
}

function request(method: string, body?: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/access-control/staff-roles", {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { "content-type": "application/json" },
  });
}

const createBody = {
  name: "Campaign Editors",
  description: "Can administer sponsored map campaigns",
  permissionKeys: ["admin.map_campaign.manage"],
  reason: "Create the campaign operations role",
};

const updateBody = {
  ...createBody,
  name: "Campaign Managers",
  active: true,
  reason: "Update the campaign operations role",
};

describe("staff role management API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listState.mockResolvedValue({
      capabilities: [], policies: [], policyVersions: [], policyRequirements: [],
      approvals: [], assignments: [], generation: 23,
    });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.from.mockImplementation((table: string) => {
      if (table === "audit_logs") return queryBuilder([{ id: AUDIT_ID }]);
      if (table === "staff_permissions") {
        return queryBuilder([{ id: "permission-1", key: "admin.map_campaign.manage", module: "admin", action: "map_campaign.manage" }]);
      }
      if (table === "staff_roles") {
        return queryBuilder([{ id: ROLE_ID, name: "Campaign Editors", is_system: false, is_active: true }]);
      }
      if (table === "staff_role_permissions") {
        return queryBuilder([{ role_id: ROLE_ID, staff_permissions: { key: "admin.map_campaign.manage" } }]);
      }
      if (table === "staff_role_assignments") {
        return queryBuilder([{ id: ASSIGNMENT_ID, role_id: ROLE_ID, user_id: USER_ID, revoked_at: null }]);
      }
      return queryBuilder();
    });
    allowSuperAdmin();
  });

  const guardedCalls = [
    ["permission list", () => permissionsRoute.GET()],
    ["role list", () => rolesRoute.GET()],
    ["role create", () => rolesRoute.POST(request("POST", createBody))],
    ["role update", () => roleRoute.PATCH(request("PATCH", updateBody), { params: Promise.resolve({ roleId: ROLE_ID }) })],
    ["role assign", () => assignmentsRoute.POST(request("POST", { userId: USER_ID, reason: "Assign after staff capability review" }), { params: Promise.resolve({ roleId: ROLE_ID }) })],
    ["role revoke", () => assignmentsRoute.DELETE(request("DELETE", { assignmentId: ASSIGNMENT_ID, reason: "Revoke after the scheduled rotation" }), { params: Promise.resolve({ roleId: ROLE_ID }) })],
  ] as const;

  it.each(guardedCalls)("requires Super Admin for %s", async (_name, call) => {
    mocks.requireStaffGovernance.mockResolvedValue({
      db: createDb(),
      user: { id: USER_ID },
      response: Response.json({ data: null, error: { code: "FORBIDDEN" } }, { status: 403 }),
    });

    const response = await call();

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each(guardedCalls)("blocks suspended or scoped governance before handling %s", async (_name, call) => {
    mocks.requireStaffGovernance.mockResolvedValue({
      db: createDb(),
      user: { id: ACTOR_ID },
      response: Response.json({ data: null, error: { code: "FORBIDDEN" } }, { status: 403 }),
    });

    const response = await call();

    expect(response.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("lists permissions and roles from read-only Task 3 tables", async () => {
    const permissions = await permissionsRoute.GET();
    const roles = await rolesRoute.GET();

    expect(await permissions.json()).toMatchObject({
      data: { permissions: [{ key: "admin.map_campaign.manage" }] },
      error: null,
    });
    expect(await roles.json()).toMatchObject({
      data: {
        roles: [{ id: ROLE_ID, permissionKeys: ["admin.map_campaign.manage"] }],
        assignments: [{ id: ASSIGNMENT_ID, roleId: ROLE_ID, userId: USER_ID }],
      },
      error: null,
    });
  });

  it("creates a role through the governed RPC and returns an audit receipt", async () => {
    mocks.rpc.mockResolvedValue({ data: ROLE_ID, error: null });

    const response = await rolesRoute.POST(request("POST", createBody));

    expect(response.status).toBe(201);
    expect(mocks.rpc).toHaveBeenCalledWith("create_staff_role", {
      p_name: createBody.name,
      p_description: createBody.description,
      p_permission_keys: createBody.permissionKeys,
      p_reason: createBody.reason,
    });
    expect(await response.json()).toMatchObject({
      data: { roleId: ROLE_ID, auditEventId: AUDIT_ID },
      error: null,
    });
  });

  it("updates a custom role through the governed RPC", async () => {
    const response = await roleRoute.PATCH(request("PATCH", updateBody), {
      params: Promise.resolve({ roleId: ROLE_ID }),
    });

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("update_staff_role", {
      p_role_id: ROLE_ID,
      p_name: updateBody.name,
      p_description: updateBody.description,
      p_permission_keys: updateBody.permissionKeys,
      p_active: true,
      p_reason: updateBody.reason,
    });
  });

  it("assigns and revokes a custom role through governed RPCs", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: ASSIGNMENT_ID, error: null })
      .mockResolvedValueOnce({ data: null, error: null });

    const assigned = await assignmentsRoute.POST(request("POST", {
      userId: USER_ID,
      reason: "Assign after staff capability review",
    }), { params: Promise.resolve({ roleId: ROLE_ID }) });
    const revoked = await assignmentsRoute.DELETE(request("DELETE", {
      assignmentId: ASSIGNMENT_ID,
      reason: "Revoke after the scheduled rotation",
    }), { params: Promise.resolve({ roleId: ROLE_ID }) });

    expect(assigned.status).toBe(201);
    expect(revoked.status).toBe(200);
    expect(mocks.rpc.mock.calls.slice(0, 2)).toEqual([
      ["assign_staff_role", { p_role_id: ROLE_ID, p_user_id: USER_ID, p_reason: "Assign after staff capability review" }],
      ["revoke_staff_role_assignment", { p_assignment_id: ASSIGNMENT_ID, p_reason: "Revoke after the scheduled rotation" }],
    ]);
  });

  it.each([
    ["create", () => rolesRoute.POST(request("POST", { ...createBody, actorId: ACTOR_ID }))],
    ["update", () => roleRoute.PATCH(request("PATCH", { ...updateBody, isSystem: false }), { params: Promise.resolve({ roleId: ROLE_ID }) })],
    ["assign", () => assignmentsRoute.POST(request("POST", { userId: USER_ID, roleId: ROLE_ID, reason: "Assign after staff capability review" }), { params: Promise.resolve({ roleId: ROLE_ID }) })],
    ["revoke", () => assignmentsRoute.DELETE(request("DELETE", { assignmentId: ASSIGNMENT_ID, userId: USER_ID, reason: "Revoke after the scheduled rotation" }), { params: Promise.resolve({ roleId: ROLE_ID }) })],
  ] as const)("strictly validates %s bodies before RPC calls", async (_name, call) => {
    const response = await call();

    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("rejects unknown and duplicate permission keys", async () => {
    const unknown = await rolesRoute.POST(request("POST", {
      ...createBody,
      permissionKeys: ["admin.staff.impersonate"],
    }));
    const duplicate = await rolesRoute.POST(request("POST", {
      ...createBody,
      permissionKeys: ["admin.kyc.review", "admin.kyc.review"],
    }));

    expect(unknown.status).toBe(422);
    expect(duplicate.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["create name", () => rolesRoute.POST(request("POST", { ...createBody, name: "123456789012345678901" }))],
    ["create description", () => rolesRoute.POST(request("POST", { ...createBody, description: "x".repeat(101) }))],
    ["update name", () => roleRoute.PATCH(request("PATCH", { ...updateBody, name: "123456789012345678901" }), { params: Promise.resolve({ roleId: ROLE_ID }) })],
    ["update description", () => roleRoute.PATCH(request("PATCH", { ...updateBody, description: "x".repeat(101) }), { params: Promise.resolve({ roleId: ROLE_ID }) })],
  ] as const)("rejects overlong staff role metadata for %s", async (_name, call) => {
    const response = await call();

    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["duplicate role", "duplicate key value violates unique constraint", "CONFLICT", "create"],
    ["duplicate assignment", "staff_role_assignments_live_unique", "CONFLICT", "assign"],
    ["system role", "system_role_protected", "SYSTEM_ROLE_PROTECTED", "update"],
  ])("maps %s without returning database details", async (_name, message, code, operation) => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message } });

    const response = operation === "create"
      ? await rolesRoute.POST(request("POST", createBody))
      : operation === "assign"
        ? await assignmentsRoute.POST(request("POST", { userId: USER_ID, reason: "Assign after staff capability review" }), { params: Promise.resolve({ roleId: ROLE_ID }) })
        : await roleRoute.PATCH(request("PATCH", updateBody), { params: Promise.resolve({ roleId: ROLE_ID }) });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.code).toBe(code);
    expect(JSON.stringify(body)).not.toContain(message);
  });

  it("does not directly mutate staff RBAC tables", async () => {
    await rolesRoute.POST(request("POST", createBody));
    await roleRoute.PATCH(request("PATCH", updateBody), { params: Promise.resolve({ roleId: ROLE_ID }) });
    await assignmentsRoute.POST(request("POST", { userId: USER_ID, reason: "Assign after staff capability review" }), { params: Promise.resolve({ roleId: ROLE_ID }) });

    expect(mocks.from).not.toHaveBeenCalledWith("staff_roles");
    expect(mocks.from).not.toHaveBeenCalledWith("staff_role_permissions");
    expect(mocks.from).not.toHaveBeenCalledWith("staff_role_assignments");
  });
});
