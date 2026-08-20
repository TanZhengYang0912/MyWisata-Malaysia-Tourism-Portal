import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: {
      exchangeCodeForSession: mocks.exchangeCodeForSession,
      getUser: mocks.getUser,
    },
    from: mocks.from,
    rpc: mocks.rpc,
  })),
}));

import { GET } from "../route";

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "customer-1" } }, error: null });
    mocks.rpc.mockResolvedValue({ data: [{ role_name: "customer" }], error: null });
  });

  it("sends a customer to the customer home instead of a requested admin page", async () => {
    const response = await GET(new Request("http://localhost/auth/callback?code=oauth-code&next=%2Fadmin%2Fdashboard"));

    expect(response.headers.get("location")).toBe("http://localhost/customer");
    expect(mocks.rpc).toHaveBeenCalledWith("get_my_roles");
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("uses the current-user role RPC so RLS cannot hide role assignments", async () => {
    await GET(new Request("http://localhost/auth/callback?code=oauth-code&next=%2Fadmin%2Fdashboard"));

    expect(mocks.rpc).toHaveBeenCalledWith("get_my_roles");
  });

  it("resolves an existing email session without requiring an OAuth code", async () => {
    const response = await GET(new Request("http://localhost/auth/callback?next=%2Fadmin%2Fdashboard"));

    expect(response.headers.get("location")).toBe("http://localhost/customer");
    expect(mocks.exchangeCodeForSession).not.toHaveBeenCalled();
  });

  it("keeps an allowed destination for the authenticated role", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "admin-1" } }, error: null });
    mocks.rpc.mockResolvedValue({ data: [{ role_name: "admin" }], error: null });

    const response = await GET(new Request("http://localhost/auth/callback?code=oauth-code&next=%2Fadmin%2Fvendors"));

    expect(response.headers.get("location")).toBe("http://localhost/admin/vendors");
  });

  it.each([
    ["vendor invitation", "%2Fvendor-invite%3Frecommendation%3Dinvite-token", "/vendor-invite?recommendation=invite-token"],
    ["outlet-manager invitation", "%2Foutlet-manager-invitations%2Finvite-token", "/outlet-manager-invitations/invite-token"],
    ["password reset", "%2Freset-password", "/reset-password"],
  ])("keeps a safe role-neutral %s destination", async (_label, next, expected) => {
    const response = await GET(new Request(`http://localhost/auth/callback?code=oauth-code&next=${next}`));

    expect(response.headers.get("location")).toBe(`http://localhost${expected}`);
  });

  it("checks the normalized path before applying the role boundary", async () => {
    const response = await GET(new Request("http://localhost/auth/callback?code=oauth-code&next=%2Fcustomer%2F..%2Fadmin%2Fdashboard"));

    expect(response.headers.get("location")).toBe("http://localhost/customer");
  });

  it("rejects an external next destination", async () => {
    const response = await GET(new Request("http://localhost/auth/callback?code=oauth-code&next=https%3A%2F%2Fevil.example%2Fsteal"));

    expect(response.headers.get("location")).toBe("http://localhost/customer/explore");
  });

  it("reports an OAuth exchange failure before reading account data", async () => {
    mocks.exchangeCodeForSession.mockResolvedValue({ error: { message: "invalid code" } });

    const response = await GET(new Request("http://localhost/auth/callback?code=bad-code&next=%2Fadmin%2Fdashboard"));

    expect(response.headers.get("location")).toBe("http://localhost/login?error=oauth");
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("reports a missing authenticated session", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET(new Request("http://localhost/auth/callback?next=%2Fadmin%2Fdashboard"));

    expect(response.headers.get("location")).toBe("http://localhost/login?error=oauth");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("falls back to the root router when the role lookup fails", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "database unavailable" } });

    const response = await GET(new Request("http://localhost/auth/callback?code=oauth-code&next=%2Fadmin%2Fdashboard"));

    expect(response.headers.get("location")).toBe("http://localhost/");
  });
});
