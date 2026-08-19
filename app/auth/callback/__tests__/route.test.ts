import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  exchangeCodeForSession: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

mocks.createClient.mockImplementation(async () => ({
  auth: {
    exchangeCodeForSession: mocks.exchangeCodeForSession,
    getUser: mocks.getUser,
  },
  from: mocks.from,
}));

const { GET } = await import("../route");

describe("GET /auth/callback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.exchangeCodeForSession.mockResolvedValue({ error: null });
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ maybeSingle: mocks.maybeSingle });
  });

  it("discards a stale admin return path for an outlet manager", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { user_roles: [{ roles: { name: "outlet_manager" } }] },
      error: null,
    });

    const response = await GET(new Request(
      "http://localhost/auth/callback?code=oauth-code&next=%2Fadmin%2Fdashboard",
    ));

    expect(response.headers.get("location")).toBe("http://localhost/vendor/dashboard");
  });

  it("preserves a return path compatible with the authenticated role", async () => {
    mocks.maybeSingle.mockResolvedValue({
      data: { user_roles: [{ roles: { name: "super_admin" } }] },
      error: null,
    });

    const response = await GET(new Request(
      "http://localhost/auth/callback?code=oauth-code&next=%2Fadmin%2Frecommendations",
    ));

    expect(response.headers.get("location")).toBe("http://localhost/admin/recommendations");
  });
});
