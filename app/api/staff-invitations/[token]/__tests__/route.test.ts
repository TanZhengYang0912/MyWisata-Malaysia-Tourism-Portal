import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createServiceClient: vi.fn(),
  createClient: vi.fn(),
  serviceFrom: vi.fn(),
  rpc: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));

import { GET, POST } from "@/app/api/staff-invitations/[token]/route";

const TOKEN = "invite-secret";
const USER_ID = "11111111-1111-4111-8111-111111111111";

function singleQuery(data: unknown, error: unknown = null) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => ({ data, error }));
  return builder;
}

describe("staff invitation recipient API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createServiceClient.mockReturnValue({ from: mocks.serviceFrom });
    mocks.serviceFrom.mockReturnValue(singleQuery({
      invited_email: "staff@example.com",
      role_name_snapshot: "KYC Reviewer",
      permission_keys_snapshot: ["admin.kyc.review"],
      status: "pending",
      delivery_status: "sent",
      expires_at: "2099-09-13T04:30:00.000Z",
      staff_roles: {
        name: "KYC Reviewer",
        is_active: true,
        staff_role_permissions: [{ staff_permissions: { key: "admin.kyc.review" } }],
      },
    }));
    mocks.getUser.mockResolvedValue({ data: { user: { id: USER_ID } }, error: null });
    mocks.rpc.mockResolvedValue({ data: { accepted: true }, error: null });
    mocks.createClient.mockResolvedValue({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc });
  });

  it("returns a no-store, human-readable preview without technical secrets", async () => {
    const response = await GET(new Request(`https://mywisata.test/api/staff-invitations/${TOKEN}?locale=en`), {
      params: Promise.resolve({ token: TOKEN }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(body.data).toMatchObject({
      email: "staff@example.com",
      roleName: "KYC Reviewer",
      permissions: ["Review KYC applications"],
      status: "pending",
    });
    expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(JSON.stringify(body)).not.toContain("admin.kyc.review");
  });

  it("marks changed role templates unavailable", async () => {
    mocks.serviceFrom.mockReturnValue(singleQuery({
      invited_email: "staff@example.com",
      role_name_snapshot: "KYC Reviewer",
      permission_keys_snapshot: ["admin.kyc.review"],
      status: "pending",
      delivery_status: "sent",
      expires_at: "2099-09-13T04:30:00.000Z",
      staff_roles: { name: "Changed", is_active: true, staff_role_permissions: [] },
    }));
    const response = await GET(new Request(`https://mywisata.test/api/staff-invitations/${TOKEN}`), {
      params: Promise.resolve({ token: TOKEN }),
    });
    expect((await response.json()).data.status).toBe("role_changed");
  });

  it("requires authentication before accepting", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    const response = await POST(new Request(`https://mywisata.test/api/staff-invitations/${TOKEN}`, { method: "POST" }), {
      params: Promise.resolve({ token: TOKEN }),
    });
    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("accepts through the transactional RPC and sanitizes failures", async () => {
    const response = await POST(new Request(`https://mywisata.test/api/staff-invitations/${TOKEN}`, { method: "POST" }), {
      params: Promise.resolve({ token: TOKEN }),
    });
    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith("accept_staff_invitation", { p_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/) });

    mocks.rpc.mockResolvedValue({ data: null, error: { message: "email_mismatch database-secret" } });
    const mismatch = await POST(new Request(`https://mywisata.test/api/staff-invitations/${TOKEN}`, { method: "POST" }), {
      params: Promise.resolve({ token: TOKEN }),
    });
    const body = await mismatch.json();
    expect(mismatch.status).toBe(403);
    expect(JSON.stringify(body)).not.toContain("database-secret");
  });
});
