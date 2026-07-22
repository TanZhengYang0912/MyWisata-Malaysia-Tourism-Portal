import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  authRpc: vi.fn(),
  serviceRpc: vi.fn(),
  moderateAccountText: vi.fn(),
  enqueueUserAccountEmail: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.authRpc }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({ rpc: mocks.serviceRpc }),
}));
vi.mock("@/lib/moderation", () => ({ moderateAccountText: mocks.moderateAccountText }));
vi.mock("@/lib/email/events", () => ({ enqueueUserAccountEmail: mocks.enqueueUserAccountEmail }));

const { POST } = await import("../route");

const actor = { id: "11111111-1111-4111-8111-111111111111" };
const targetId = "22222222-2222-4222-8222-222222222222";

function request(body: unknown) {
  return new Request(`http://localhost/api/admin/users/${targetId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/users/[userId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: actor } });
    mocks.authRpc.mockResolvedValue({ data: true, error: null });
    mocks.serviceRpc.mockResolvedValue({
      data: { userId: targetId, email: "target@example.com", name: "Target" },
      error: null,
    });
    mocks.moderateAccountText.mockResolvedValue({ flagged: false });
    mocks.enqueueUserAccountEmail.mockResolvedValue(undefined);
  });

  it("rejects a short reason before moderation or mutation", async () => {
    const response = await POST(request({ action: "suspend", reason: "too short" }), { params: Promise.resolve({ userId: targetId }) });

    expect(response.status).toBe(422);
    expect(mocks.moderateAccountText).not.toHaveBeenCalled();
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
  });

  it("rejects flagged reasons without mutation or email", async () => {
    mocks.moderateAccountText.mockResolvedValue({ flagged: true, categories: ["harassment"] });

    const response = await POST(request({ action: "suspend", reason: "A sufficiently long reason" }), { params: Promise.resolve({ userId: targetId }) });

    expect(response.status).toBe(422);
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
    expect(mocks.enqueueUserAccountEmail).not.toHaveBeenCalled();
  });

  it("fails closed when moderation is unavailable", async () => {
    mocks.moderateAccountText.mockResolvedValue({ error: "api_unavailable" });

    const response = await POST(request({ action: "unsuspend", reason: "A sufficiently long reason" }), { params: Promise.resolve({ userId: targetId }) });

    expect(response.status).toBe(503);
    expect(mocks.serviceRpc).not.toHaveBeenCalled();
    expect(mocks.enqueueUserAccountEmail).not.toHaveBeenCalled();
  });

  it("moderates and then calls the server-only mutation RPC", async () => {
    const reason = "A sufficiently long reason";
    const response = await POST(request({ action: "suspend", reason }), { params: Promise.resolve({ userId: targetId }) });

    expect(response.status).toBe(200);
    expect(mocks.moderateAccountText).toHaveBeenCalledWith(reason, "suspend_reason");
    expect(mocks.serviceRpc).toHaveBeenCalledWith("admin_manage_user", {
      p_actor_id: actor.id,
      p_user_id: targetId,
      p_action: "suspend",
      p_reason: reason,
    });
    expect(mocks.enqueueUserAccountEmail).toHaveBeenCalled();
  });

  it("keeps restore on the existing path without Gemini", async () => {
    const response = await POST(request({ action: "restore", reason: "Restore after review" }), { params: Promise.resolve({ userId: targetId }) });

    expect(response.status).toBe(200);
    expect(mocks.moderateAccountText).not.toHaveBeenCalled();
    expect(mocks.serviceRpc).toHaveBeenCalled();
  });

  it("explains when the new account-management RPC has not been deployed", async () => {
    mocks.serviceRpc.mockResolvedValue({
      data: null,
      error: { message: "Could not find the function public.admin_manage_user(p_action, p_actor_id, p_reason, p_user_id) in the schema cache" },
    });

    const response = await POST(request({ action: "suspend", reason: "A sufficiently long reason" }), { params: Promise.resolve({ userId: targetId }) });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.message).toContain("054_account_moderation_rpc.sql");
  });

  it("includes a sanitized unknown database reason for admin debugging", async () => {
    mocks.serviceRpc.mockResolvedValue({
      data: null,
      error: { message: 'column "closed_at" does not exist' },
    });

    const response = await POST(request({ action: "suspend", reason: "A sufficiently long reason" }), { params: Promise.resolve({ userId: targetId }) });
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error.message).toContain('Database response: column "closed_at" does not exist');
  });

  it("explains when the lifecycle-context migration has not been applied", async () => {
    mocks.serviceRpc.mockResolvedValue({
      data: null,
      error: { message: "account_lifecycle_fields_are_server_managed" },
    });

    const response = await POST(request({ action: "suspend", reason: "A sufficiently long reason" }), { params: Promise.resolve({ userId: targetId }) });
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.message).toContain("055_admin_account_lifecycle_context.sql");
  });
});
