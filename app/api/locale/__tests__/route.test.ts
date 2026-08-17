import { beforeEach, describe, expect, it, vi } from "vitest";
import { LOCALE_COOKIE } from "@/lib/i18n/locale";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  cookieSet: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: mocks.getUser },
    from: mocks.from,
  }),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ set: mocks.cookieSet }),
}));

const { POST } = await import("../route");

function request(body: unknown) {
  return new Request("http://localhost/api/locale", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/locale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: null });
    mocks.from.mockReturnValue({ update: mocks.update });
    mocks.update.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockResolvedValue({ error: null });
  });

  it("writes only the cookie for an anonymous visitor", async () => {
    const response = await POST(request({ locale: "ms" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { locale: "ms", persistedToAccount: false },
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.cookieSet).toHaveBeenCalledWith(
      LOCALE_COOKIE,
      "ms",
      expect.objectContaining({
        path: "/",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 365,
        secure: process.env.NODE_ENV === "production",
      }),
    );
  });

  it("updates only the authenticated user's preferred_locale before writing the cookie", async () => {
    const user = { id: "user-123" };
    mocks.getUser.mockResolvedValue({ data: { user }, error: null });

    const response = await POST(request({ locale: "zh-CN" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { locale: "zh-CN", persistedToAccount: true },
    });
    expect(mocks.from).toHaveBeenCalledWith("users");
    expect(mocks.update).toHaveBeenCalledWith({ preferred_locale: "zh-CN" });
    expect(mocks.eq).toHaveBeenCalledWith("id", user.id);
    expect(mocks.cookieSet).toHaveBeenCalled();
    expect(mocks.cookieSet.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.eq.mock.invocationCallOrder[0]);
  });

  it("rejects zh-TW and arbitrary locale values with 400", async () => {
    const zhTwResponse = await POST(request({ locale: "zh-TW" }));
    const arbitraryResponse = await POST(request({ locale: "arbitrary" }));

    expect(zhTwResponse.status).toBe(400);
    expect(arbitraryResponse.status).toBe(400);
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });

  it("does not change the cookie when the authenticated database update fails", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-123" } }, error: null });
    mocks.eq.mockResolvedValue({ error: { message: "database unavailable" } });

    const response = await POST(request({ locale: "en" }));

    expect(response.status).toBe(500);
    expect(mocks.cookieSet).not.toHaveBeenCalled();
  });
});
