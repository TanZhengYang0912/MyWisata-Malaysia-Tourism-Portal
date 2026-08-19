import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signInWithPassword: mocks.signInWithPassword },
  }),
}));

const { POST } = await import("../demo-signin/route");

describe("POST /api/auth/demo-signin", () => {
  beforeEach(() => {
    mocks.signInWithPassword.mockReset();
  });

  it("returns the successful session so the browser client can hydrate itself", async () => {
    mocks.signInWithPassword.mockResolvedValue({
      data: {
        session: {
          access_token: "access-token",
          refresh_token: "refresh-token",
        },
      },
      error: null,
    });

    const response = await POST(new Request("http://localhost/api/auth/demo-signin", {
      method: "POST",
      body: JSON.stringify({ email: "customer@demo.local" }),
      headers: { "content-type": "application/json" },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      session: {
        access_token: "access-token",
        refresh_token: "refresh-token",
      },
    });
  });
});
