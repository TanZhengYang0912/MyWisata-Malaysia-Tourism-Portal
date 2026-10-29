import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), rpc: vi.fn() }));
vi.mock("@/lib/staff-permissions/server", () => ({ requireStaffRoleManagementSuperAdmin: mocks.guard }));
import { GET as list } from "../route";
import { GET as detail } from "../[userId]/route";
const userId = "22222222-2222-4222-8222-222222222222";
const assignmentId = "33333333-3333-4333-8333-333333333333";
const context = { params: Promise.resolve({ userId }) };
describe("employee access projection routes", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.guard.mockResolvedValue({ db: { rpc: mocks.rpc }, response: null }); });
  it("guards listing and preview before reading data", async () => {
    mocks.guard.mockResolvedValue({ response: Response.json({}, { status: 403 }) });
    expect((await list(new Request("http://localhost"))).status).toBe(403);
    expect((await detail(new Request("http://localhost"), context)).status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("forwards validated filters with the existing default page size and strips unexpected fields", async () => {
    mocks.rpc.mockResolvedValue({ data: { items: [], total: 42, page: 2, pageSize: 25, totalPages: 2, secret: "private" } });
    const response = await list(new Request("http://localhost?search=Chen&status=active&page=2"));
    expect(mocks.rpc).toHaveBeenCalledWith("list_staff_employees", { p_search: "Chen", p_status: "active", p_page: 2, p_page_size: 25 });
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain("private");
  });
  it("accepts PostgreSQL-valid seeded demo UUIDs whose RFC version bits are unset", async () => {
    const demoAdminId = "aaaaaaaa-0000-0000-0000-000000000001";
    mocks.rpc.mockResolvedValue({ data: {
      items: [{ id: demoAdminId, name: "Demo Admin", email: "admin@demo.local", status: "active", roles: ["super_admin"] }],
      total: 1, page: 1, pageSize: 25, totalPages: 1,
    } });
    const response = await list(new Request("http://localhost"));
    expect(response.status).toBe(200);
    expect((await response.json()).data.items[0].id).toBe(demoAdminId);

    mocks.rpc.mockResolvedValue({ data: { id: demoAdminId, name: "Demo Admin", email: "admin@demo.local", status: "active", coarseRoles: ["super_admin"], assignments: [], sources: [] } });
    const detailResponse = await detail(new Request("http://localhost"), { params: Promise.resolve({ userId: demoAdminId }) });
    expect(detailResponse.status).toBe(200);
  });
  it("previews exclusion using the target assignment and exposes no private profile fields", async () => {
    mocks.rpc.mockResolvedValue({ data: { id: userId, name: "Chen", email: "chen@example.test", status: "active", coarseRoles: ["staff"], assignments: [], sources: [], bank: "private" } });
    const response = await detail(new Request(`http://localhost?excludedAssignmentId=${assignmentId}`), context);
    expect(mocks.rpc).toHaveBeenCalledWith("get_staff_employee_access", { p_user_id: userId, p_excluded_assignment_id: assignmentId });
    expect(response.status).toBe(200);
    expect(JSON.stringify(await response.json())).not.toContain("private");
  });
  it("rejects invalid paging and fails closed on an unavailable source projection", async () => {
    expect((await list(new Request("http://localhost?pageSize=9999"))).status).toBe(422);
    mocks.rpc.mockResolvedValue({ error: { message: "secret diagnostic" } });
    const response = await detail(new Request("http://localhost"), context);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("secret diagnostic");
  });
  it("distinguishes an RPC outage from a malformed RPC response without exposing diagnostics", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: "42883", message: "secret database details" } });
    const rpcResponse = await list(new Request("http://localhost"));
    expect((await rpcResponse.json()).error).toMatchObject({
      code: "STAFF_EMPLOYEES_RPC_UNAVAILABLE",
      details: { stage: "rpc", databaseCode: "42883" },
    });
    mocks.rpc.mockResolvedValue({ data: { items: [{ email: "not-an-email" }], total: 1 }, error: null });
    const schemaResponse = await list(new Request("http://localhost"));
    const schemaBody = await schemaResponse.json();
    expect(schemaBody.error).toMatchObject({
      code: "STAFF_EMPLOYEES_RESPONSE_INVALID",
      details: { stage: "response_validation" },
    });
    expect(JSON.stringify(schemaBody)).not.toContain("not-an-email");
  });
});
